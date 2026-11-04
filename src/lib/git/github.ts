import {
  Teilabrufe,
  getJson,
  getJsonSafe,
  normalizeBaseUrl,
  sendJson,
  shortSha,
  toIso,
} from "./http";
import type {
  BranchInfo,
  CiInfo,
  CiState,
  CommitCalendar,
  CommitInfo,
  ConnectionCheck,
  CreatedIssue,
  CreatedWebhook,
  GitClient,
  ProviderConfig,
  ReleaseInfo,
  RepoListItem,
  RepoRef,
  RepoSnapshotData,
  TagInfo,
  TicketInfo,
} from "./types";
import { dayKey } from "./calendar";
import { capReadme, decodeBase64, type RepoReadme } from "./readme";
import { GitApiError, bucketCommitActivity } from "./types";

/**
 * GitHub – funktioniert mit github.com und GitHub Enterprise.
 * Bei Enterprise liegt die API unter <host>/api/v3.
 */
export class GitHubClient implements GitClient {
  readonly provider = "GITHUB" as const;
  private readonly apiBase: string;
  private readonly token: string | null;

  constructor(config: ProviderConfig) {
    const base = normalizeBaseUrl(config.baseUrl || "https://github.com");
    this.apiBase = /github\.com$/i.test(base)
      ? "https://api.github.com"
      : `${base}/api/v3`;
    this.token = config.token;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  private repoBase(ref: RepoRef): string {
    return `${this.apiBase}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;
  }

  async createIssue(
    ref: RepoRef,
    issue: { title: string; body?: string | null },
  ): Promise<CreatedIssue> {
    const angelegt = await sendJson<{ number: number; html_url?: string }>(
      `${this.repoBase(ref)}/issues`,
      "POST",
      { title: issue.title, body: issue.body ?? "" },
      { headers: this.headers() },
    );
    return { number: angelegt.number, url: angelegt.html_url ?? null };
  }

  async setIssueState(
    ref: RepoRef,
    number: number,
    open: boolean,
  ): Promise<void> {
    await sendJson(
      `${this.repoBase(ref)}/issues/${number}`,
      "PATCH",
      { state: open ? "open" : "closed" },
      { headers: this.headers() },
    );
  }

  async createWebhook(
    ref: RepoRef,
    hook: { url: string; secret: string },
  ): Promise<CreatedWebhook> {
    // Verlangt beim fine-grained Token "Webhooks: Read and write" – ein
    // eigenes Recht, keine Administration des Repositories.
    const angelegt = await sendJson<{ id: number }>(
      `${this.repoBase(ref)}/hooks`,
      "POST",
      {
        name: "web",
        active: true,
        events: ["push", "issues"],
        config: { url: hook.url, content_type: "json", secret: hook.secret, insecure_ssl: "0" },
      },
      { headers: this.headers() },
    );
    return { id: String(angelegt.id) };
  }

  async deleteWebhook(ref: RepoRef, id: string): Promise<void> {
    await sendJson(
      `${this.repoBase(ref)}/hooks/${encodeURIComponent(id)}`,
      "DELETE",
      undefined,
      { headers: this.headers() },
    );
  }

  async getIssueState(
    ref: RepoRef,
    number: number,
  ): Promise<"open" | "closed" | null> {
    const issue = await getJson<{ state?: string } | null>(
      `${this.repoBase(ref)}/issues/${number}`,
      { headers: this.headers(), allow404: true },
    );
    if (!issue?.state) return null;
    return issue.state === "closed" ? "closed" : "open";
  }

  async check(): Promise<ConnectionCheck> {
    try {
      if (!this.token) {
        await getJson(`${this.apiBase}/rate_limit`, {
          headers: this.headers(),
        });
        return {
          ok: true,
          message:
            "Erreichbar (ohne Token – nur oeffentliche Repos, striktes Rate-Limit).",
          user: null,
        };
      }
      const user = await getJson<{ login: string; name?: string }>(
        `${this.apiBase}/user`,
        {
          headers: this.headers(),
        },
      );
      return {
        ok: true,
        message: `Verbunden als ${user.login}`,
        user: user.login,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listRepos(query?: string): Promise<RepoListItem[]> {
    if (!this.token) {
      throw new GitApiError(
        "Fuer das Auflisten von Repos wird ein Token benoetigt.",
        401,
        this.apiBase,
      );
    }
    const repos = await getJson<GitHubRepo[]>(
      `${this.apiBase}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`,
      { headers: this.headers() },
    );
    const needle = query?.toLowerCase().trim();
    return (repos ?? [])
      .filter(
        (repo) => !needle || repo.full_name.toLowerCase().includes(needle),
      )
      .map((repo) => ({
        fullPath: repo.full_name,
        owner: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "",
        name: repo.name,
        description: repo.description ?? null,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch ?? null,
        visibility: repo.private ? "private" : "public",
        updatedAt: toIso(repo.pushed_at ?? repo.updated_at),
      }));
  }

  async fetchRepo(ref: RepoRef): Promise<RepoSnapshotData> {
    const base = `${this.apiBase}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;
    const headers = this.headers();

    const repo = await getJson<GitHubRepo>(base, { headers });

    const defaultBranch = repo.default_branch;

    // Sammelt, welche Liste nicht geholt werden konnte und warum.
    const teil = new Teilabrufe();

    const [
      branches,
      tags,
      commits,
      releases,
      languages,
      pulls,
      issues,
      ciRuns,
    ] = await Promise.all([
      teil.hol<GitHubBranch[]>("branches", `${base}/branches?per_page=50`, [], {
        headers,
      }),
      teil.hol<GitHubTag[]>("tags", `${base}/tags?per_page=25`, [], {
        headers,
      }),
      // 100 statt 15: die aelteren brauchen wir fuer die Aktivitaetskurve.
      // Kommen weniger an, kuerzt sich die Kurve ehrlich auf den tatsaechlich
      // belegten Zeitraum (siehe bucketCommitActivity).
      teil.hol<GitHubCommit[]>("commits", `${base}/commits?per_page=100`, [], {
        headers,
      }),
      teil.hol<GitHubRelease[]>(
        "releases",
        `${base}/releases?per_page=10`,
        [],
        { headers },
      ),
      teil.hol<Record<string, number>>(
        "languages",
        `${base}/languages`,
        {},
        { headers },
      ),
      teil.hol<GitHubPull[]>(
        "pullRequests",
        `${base}/pulls?state=open&per_page=50`,
        [],
        { headers },
      ),
      // /issues liefert bei GitHub auch Pull Requests – die filtern wir raus.
      teil.hol<GitHubIssue[]>(
        "issues",
        `${base}/issues?state=open&per_page=50`,
        [],
        { headers },
      ),
      teil.hol<{ workflow_runs?: GitHubRun[] }>(
        "ci",
        `${base}/actions/runs?per_page=1&branch=${encodeURIComponent(defaultBranch)}`,
        {},
        { headers },
      ),
    ]);

    const mappedBranches: BranchInfo[] = branches.map((branch) => ({
      name: branch.name,
      sha: branch.commit?.sha ?? null,
      isDefault: branch.name === repo.default_branch,
      protected: Boolean(branch.protected),
      lastCommitAt: null,
      lastCommitMessage: null,
      lastCommitAuthor: null,
      url: `${repo.html_url}/tree/${encodeURIComponent(branch.name)}`,
    }));

    const mappedTags: TagInfo[] = tags.map((tag) => ({
      name: tag.name,
      sha: tag.commit?.sha ?? null,
      message: null,
      date: null,
      url: `${repo.html_url}/releases/tag/${encodeURIComponent(tag.name)}`,
    }));

    const mappedCommits: CommitInfo[] = commits.map((entry) => ({
      sha: entry.sha,
      shortSha: shortSha(entry.sha),
      message: entry.commit?.message?.split("\n")[0] ?? "",
      author: entry.commit?.author?.name ?? entry.author?.login ?? null,
      date: toIso(entry.commit?.author?.date ?? entry.commit?.committer?.date),
      url: entry.html_url ?? null,
    }));

    const mappedReleases: ReleaseInfo[] = releases.map((release) => ({
      name: release.name || release.tag_name,
      tag: release.tag_name,
      publishedAt: toIso(release.published_at ?? release.created_at),
      url: release.html_url ?? null,
      prerelease: Boolean(release.prerelease),
      draft: Boolean(release.draft),
    }));

    const mappedPulls: TicketInfo[] = pulls.map((pull) => ({
      number: pull.number,
      title: pull.title,
      author: pull.user?.login ?? null,
      createdAt: toIso(pull.created_at),
      url: pull.html_url ?? null,
      draft: Boolean(pull.draft),
      labels: (pull.labels ?? []).map((label) => label.name),
    }));

    const mappedIssues: TicketInfo[] = issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        author: issue.user?.login ?? null,
        createdAt: toIso(issue.created_at),
        url: issue.html_url ?? null,
        draft: false,
        labels: (issue.labels ?? []).map((label) => label.name),
      }));

    // open_issues_count zaehlt bei GitHub PRs mit – hier wieder herausrechnen.
    const openPullRequests = pulls.length;
    const openIssues = Math.max(
      0,
      (repo.open_issues_count ?? 0) - openPullRequests,
    );

    const run = ciRuns?.workflow_runs?.[0];
    const ci: CiInfo | null = run
      ? {
          state: mapRunState(run.status, run.conclusion),
          name: run.name ?? null,
          branch: run.head_branch ?? null,
          url: run.html_url ?? null,
          finishedAt: toIso(run.updated_at),
        }
      : null;

    return {
      fullName: repo.full_name,
      description: repo.description ?? null,
      defaultBranch: repo.default_branch ?? null,
      htmlUrl: repo.html_url,
      visibility: repo.private ? "private" : "public",
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      openIssues,
      openPullRequests,
      sizeKb: repo.size ?? 0,
      pushedAt: toIso(repo.pushed_at),
      branches: mappedBranches,
      tags: mappedTags,
      // Angezeigt werden die letzten 15; die uebrigen dienten der Kurve.
      commits: mappedCommits.slice(0, 15),
      releases: mappedReleases,
      languages: languages ?? {},
      pullRequests: mappedPulls,
      issues: mappedIssues,
      ci,
      commitActivity: bucketCommitActivity(
        mappedCommits.map((commit) => commit.date),
      ),
      missing: teil.fehler,
    };
  }

  /**
   * GitHub fuehrt die Statistik selbst: /stats/commit_activity liefert 52
   * Wochen mit Tageswerten in einem einzigen Aufruf. Das ist deutlich
   * sparsamer, als ein Jahr Commits seitenweise abzuholen.
   *
   * Die Statistik wird bei Bedarf erst berechnet; dann antwortet GitHub mit
   * 202 und einem leeren Rumpf – daher der leere Fall unten.
   *
   * Bewusst getJson und nicht getJsonSafe: ein Rate-Limit oder ein Ausfall
   * darf nicht als "keine Daten" durchgehen. Der Fehler geht nach oben, und
   * der naechste Abgleich versucht es erneut.
   */
  async fetchCommitCalendar(ref: RepoRef): Promise<CommitCalendar | null> {
    const base = `${this.apiBase}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;
    const wochen = await getJson<GitHubWeek[]>(
      `${base}/stats/commit_activity`,
      {
        headers: this.headers(),
      },
    );

    if (!Array.isArray(wochen) || wochen.length === 0) {
      // Entweder rechnet GitHub noch, oder das Repository hat keine Commits.
      // Ersatzweise aus den geholten Commits zu bauen waere irrefuehrend –
      // das taete so, als reichte der Zeitraum ein Jahr zurueck.
      return null;
    }

    const days: Record<string, number> = {};
    let von: string | null = null;
    const heute = dayKey(new Date());

    for (const woche of wochen) {
      if (!woche?.week || !Array.isArray(woche.days)) continue;
      woche.days.forEach((anzahl, index) => {
        const tag = dayKey(new Date((woche.week + index * 86_400) * 1000));
        if (tag > heute) return;
        if (von === null || tag < von) von = tag;
        if (anzahl > 0) days[tag] = anzahl;
      });
    }

    if (von === null) return null;

    return { from: von, to: heute, days, source: "stats", truncated: false };
  }

  /**
   * GitHub hat einen eigenen Endpunkt, der jede Schreibweise findet – ein
   * Aufruf genuegt. Ohne README antwortet er mit 404; das ist kein Fehler,
   * sondern die Auskunft "gibt es nicht".
   */
  async fetchReadme(ref: RepoRef): Promise<RepoReadme | null> {
    const base = `${this.apiBase}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;

    let datei: GitHubContent;
    try {
      datei = await getJson<GitHubContent>(`${base}/readme`, {
        headers: this.headers(),
      });
    } catch (error) {
      if (error instanceof GitApiError && error.status === 404) return null;
      throw error;
    }

    if (!datei?.content || datei.encoding !== "base64") return null;

    const { content, truncated } = capReadme(decodeBase64(datei.content));
    return {
      content,
      path: datei.path ?? datei.name ?? "README",
      // html_url zeigt auf die Datei; fuer relative Links braucht es das
      // Verzeichnis darum herum.
      baseUrl: datei.html_url ? datei.html_url.replace(/\/[^/]*$/, "/") : null,
      truncated,
    };
  }
}

interface GitHubContent {
  name?: string;
  path?: string;
  content?: string;
  encoding?: string;
  html_url?: string | null;
}

interface GitHubWeek {
  /** Unix-Zeit des Wochenanfangs (Sonntag). */
  week: number;
  /** Sieben Werte, Sonntag bis Samstag. */
  days: number[];
  total: number;
}

/** GitHub trennt Lauf-Status und Ergebnis; hier auf einen Wert zusammenfuehren. */
function mapRunState(
  status: string | null,
  conclusion: string | null,
): CiState {
  if (status === "queued" || status === "waiting" || status === "pending")
    return "pending";
  if (status === "in_progress") return "running";
  switch (conclusion) {
    case "success":
      return "success";
    case "cancelled":
      return "cancelled";
    case "failure":
    case "timed_out":
    case "startup_failure":
      return "failure";
    default:
      return conclusion ? "failure" : "pending";
  }
}

// ── API-Typen (nur die tatsaechlich genutzten Felder) ──────────

interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  private: boolean;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  size: number;
  pushed_at: string | null;
  updated_at: string | null;
  owner?: { login: string };
}

interface GitHubBranch {
  name: string;
  protected?: boolean;
  commit?: { sha: string };
}

interface GitHubTag {
  name: string;
  commit?: { sha: string };
}

interface GitHubCommit {
  sha: string;
  html_url?: string;
  author?: { login: string } | null;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
    committer?: { date?: string };
  };
}

interface GitHubRelease {
  name: string | null;
  tag_name: string;
  published_at: string | null;
  created_at: string | null;
  html_url: string | null;
  prerelease: boolean;
  draft: boolean;
}

interface GitHubLabel {
  name: string;
}

interface GitHubPull {
  number: number;
  title: string;
  html_url: string | null;
  created_at: string | null;
  draft?: boolean;
  user?: { login: string } | null;
  labels?: GitHubLabel[];
}

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string | null;
  created_at: string | null;
  user?: { login: string } | null;
  labels?: GitHubLabel[];
  /** Gesetzt, wenn der Eintrag in Wahrheit ein Pull Request ist. */
  pull_request?: unknown;
}

interface GitHubRun {
  name: string | null;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  html_url: string | null;
  updated_at: string | null;
}
