import { getJson, getJsonSafe, normalizeBaseUrl, shortSha, toIso } from "./http";
import {
  CALENDAR_PAGE_SIZE,
  calendarByPaging,
  calendarSince,
  type CommitCalendar,
} from "./calendar";
import { capReadme, decodeBase64, pickReadme, type RepoReadme } from "./readme";
import type {
  BranchInfo,
  CiInfo,
  CiState,
  CommitInfo,
  ConnectionCheck,
  GitClient,
  ProviderConfig,
  ReleaseInfo,
  RepoListItem,
  RepoRef,
  RepoSnapshotData,
  TagInfo,
  TicketInfo,
} from "./types";
import { bucketCommitActivity } from "./types";

/**
 * GitLab – gitlab.com und selbst gehostete Instanzen (API v4).
 * Projekte werden ueber den URL-kodierten Pfad "gruppe%2Fprojekt" adressiert,
 * daher funktionieren auch verschachtelte Gruppen.
 */
export class GitLabClient implements GitClient {
  readonly provider = "GITLAB" as const;
  private readonly apiBase: string;
  private readonly token: string | null;

  constructor(config: ProviderConfig) {
    const base = normalizeBaseUrl(config.baseUrl || "https://gitlab.com");
    this.apiBase = `${base}/api/v4`;
    this.token = config.token;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) headers["PRIVATE-TOKEN"] = this.token;
    return headers;
  }

  async check(): Promise<ConnectionCheck> {
    try {
      if (!this.token) {
        await getJson(`${this.apiBase}/projects?per_page=1`, { headers: this.headers() });
        return { ok: true, message: "Erreichbar (ohne Token – nur oeffentliche Projekte).", user: null };
      }
      const user = await getJson<{ username: string; name?: string }>(`${this.apiBase}/user`, {
        headers: this.headers(),
      });
      return { ok: true, message: `Verbunden als ${user.username}`, user: user.username };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async listRepos(query?: string): Promise<RepoListItem[]> {
    const search = query ? `&search=${encodeURIComponent(query)}` : "";
    const url = this.token
      ? `${this.apiBase}/projects?membership=true&per_page=100&order_by=last_activity_at${search}`
      : `${this.apiBase}/projects?per_page=50&order_by=last_activity_at${search}`;

    const projects = await getJson<GitLabProject[]>(url, { headers: this.headers() });
    return (projects ?? []).map((project) => {
      const path = project.path_with_namespace;
      const segments = path.split("/");
      return {
        fullPath: path,
        owner: segments.slice(0, -1).join("/"),
        name: segments[segments.length - 1] ?? project.name,
        description: project.description ?? null,
        htmlUrl: project.web_url,
        defaultBranch: project.default_branch ?? null,
        visibility: project.visibility ?? null,
        updatedAt: toIso(project.last_activity_at),
      };
    });
  }

  /** "gruppe/sub/projekt" URL-kodiert – so adressiert GitLab ein Projekt. */
  private projectPath(ref: RepoRef): string {
    return encodeURIComponent([ref.owner, ref.name].filter(Boolean).join("/"));
  }

  async fetchRepo(ref: RepoRef): Promise<RepoSnapshotData> {
    const base = `${this.apiBase}/projects/${this.projectPath(ref)}`;
    const headers = this.headers();

    const project = await getJson<GitLabProject>(`${base}?statistics=true`, { headers });

    const defaultBranch = project.default_branch ?? "";

    const [branches, tags, commits, releases, languages, mergeRequests, issues, pipelines] =
      await Promise.all([
        getJsonSafe<GitLabBranch[]>(`${base}/repository/branches?per_page=50`, [], { headers }),
        getJsonSafe<GitLabTag[]>(`${base}/repository/tags?per_page=25`, [], { headers }),
        // 100 statt 15: die aelteren brauchen wir fuer die Aktivitaetskurve.
        getJsonSafe<GitLabCommit[]>(`${base}/repository/commits?per_page=100`, [], { headers }),
        getJsonSafe<GitLabRelease[]>(`${base}/releases?per_page=10`, [], { headers }),
        getJsonSafe<Record<string, number>>(`${base}/languages`, {}, { headers }),
        getJsonSafe<GitLabMergeRequest[]>(`${base}/merge_requests?state=opened&per_page=50`, [], {
          headers,
        }),
        getJsonSafe<GitLabIssue[]>(`${base}/issues?state=opened&per_page=50`, [], { headers }),
        getJsonSafe<GitLabPipeline[]>(
          `${base}/pipelines?per_page=1${defaultBranch ? `&ref=${encodeURIComponent(defaultBranch)}` : ""}`,
          [],
          { headers },
        ),
      ]);

    const mappedBranches: BranchInfo[] = branches.map((branch) => ({
      name: branch.name,
      sha: branch.commit?.id ?? null,
      isDefault: Boolean(branch.default),
      protected: Boolean(branch.protected),
      lastCommitAt: toIso(branch.commit?.committed_date ?? branch.commit?.created_at),
      lastCommitMessage: branch.commit?.title ?? null,
      lastCommitAuthor: branch.commit?.author_name ?? null,
      url: branch.web_url ?? null,
    }));

    const mappedTags: TagInfo[] = tags.map((tag) => ({
      name: tag.name,
      sha: tag.commit?.id ?? null,
      message: tag.message ?? null,
      date: toIso(tag.commit?.committed_date ?? tag.commit?.created_at),
      url: `${project.web_url}/-/tags/${encodeURIComponent(tag.name)}`,
    }));

    const mappedCommits: CommitInfo[] = commits.map((commit) => ({
      sha: commit.id,
      shortSha: commit.short_id ?? shortSha(commit.id),
      message: commit.title ?? commit.message?.split("\n")[0] ?? "",
      author: commit.author_name ?? null,
      date: toIso(commit.committed_date ?? commit.created_at),
      url: commit.web_url ?? null,
    }));

    const mappedReleases: ReleaseInfo[] = releases.map((release) => ({
      name: release.name || release.tag_name,
      tag: release.tag_name,
      publishedAt: toIso(release.released_at ?? release.created_at),
      url: release._links?.self ?? null,
      prerelease: Boolean(release.upcoming_release),
      draft: false,
    }));

    const mappedMergeRequests: TicketInfo[] = mergeRequests.map((entry) => ({
      number: entry.iid,
      title: entry.title,
      author: entry.author?.username ?? null,
      createdAt: toIso(entry.created_at),
      url: entry.web_url ?? null,
      draft: Boolean(entry.draft),
      labels: entry.labels ?? [],
    }));

    const mappedIssues: TicketInfo[] = issues.map((entry) => ({
      number: entry.iid,
      title: entry.title,
      author: entry.author?.username ?? null,
      createdAt: toIso(entry.created_at),
      url: entry.web_url ?? null,
      draft: false,
      labels: entry.labels ?? [],
    }));

    const pipeline = pipelines[0];
    const ci: CiInfo | null = pipeline
      ? {
          state: mapPipelineState(pipeline.status),
          name: pipeline.name ?? `Pipeline #${pipeline.id}`,
          branch: pipeline.ref ?? null,
          url: pipeline.web_url ?? null,
          finishedAt: toIso(pipeline.updated_at),
        }
      : null;

    return {
      fullName: project.path_with_namespace,
      description: project.description ?? null,
      defaultBranch: project.default_branch ?? null,
      htmlUrl: project.web_url,
      visibility: project.visibility ?? null,
      stars: project.star_count ?? 0,
      forks: project.forks_count ?? 0,
      openIssues: project.open_issues_count ?? 0,
      openPullRequests: mergeRequests.length,
      sizeKb: project.statistics?.repository_size
        ? Math.round(project.statistics.repository_size / 1024)
        : 0,
      pushedAt: toIso(project.last_activity_at),
      branches: mappedBranches,
      tags: mappedTags,
      commits: mappedCommits.slice(0, 15),
      releases: mappedReleases,
      languages: languages ?? {},
      pullRequests: mappedMergeRequests,
      issues: mappedIssues,
      ci,
      commitActivity: bucketCommitActivity(mappedCommits.map((commit) => commit.date)),
    };
  }

  /**
   * GitLab kennt keine fertige Jahresstatistik, also seitenweise mit `since`.
   * Der Deckel in calendarByPaging begrenzt das auf wenige Aufrufe.
   */
  async fetchCommitCalendar(ref: RepoRef): Promise<CommitCalendar | null> {
    const base = `${this.apiBase}/projects/${this.projectPath(ref)}`;
    const seit = calendarSince().toISOString();

    // getJson und nicht getJsonSafe: ein Rate-Limit darf nicht als "keine
    // Daten" durchgehen – siehe maybeRefreshCalendar.
    return calendarByPaging(async (seite) => {
      const commits = await getJson<GitLabCommit[]>(
        `${base}/repository/commits?per_page=${CALENDAR_PAGE_SIZE}&page=${seite}` +
          `&since=${encodeURIComponent(seit)}`,
        { headers: this.headers() },
      );
      return commits.map((commit) => toIso(commit.committed_date ?? commit.created_at));
    });
  }

  /**
   * GitLab kennt keinen README-Endpunkt. Erst das Wurzelverzeichnis
   * auflisten, dann die gefundene Datei holen – zwei Aufrufe.
   */
  async fetchReadme(ref: RepoRef): Promise<RepoReadme | null> {
    const base = `${this.apiBase}/projects/${this.projectPath(ref)}`;
    const headers = this.headers();

    const eintraege = await getJsonSafe<Array<{ name: string; type: string }>>(
      `${base}/repository/tree?per_page=100`,
      [],
      { headers },
    );
    const name = pickReadme(
      eintraege.filter((eintrag) => eintrag.type === "blob").map((eintrag) => eintrag.name),
    );
    if (!name) return null;

    const datei = await getJson<{ content?: string; encoding?: string; file_path?: string }>(
      `${base}/repository/files/${encodeURIComponent(name)}?ref=HEAD`,
      { headers },
    );
    if (!datei?.content || datei.encoding !== "base64") return null;

    const { content, truncated } = capReadme(decodeBase64(datei.content));
    const projekt = await getJsonSafe<GitLabProject>(base, {} as GitLabProject, { headers });

    return {
      content,
      path: datei.file_path ?? name,
      baseUrl:
        projekt?.web_url && projekt.default_branch
          ? `${projekt.web_url}/-/blob/${encodeURIComponent(projekt.default_branch)}/`
          : null,
      truncated,
    };
  }
}

function mapPipelineState(status: string | null): CiState {
  switch (status) {
    case "success":
      return "success";
    case "running":
      return "running";
    case "failed":
      return "failure";
    case "canceled":
    case "skipped":
      return "cancelled";
    default:
      return "pending";
  }
}

// ── API-Typen ──────────────────────────────────────────────────

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  web_url: string;
  default_branch: string | null;
  visibility: string | null;
  star_count: number;
  forks_count: number;
  open_issues_count: number;
  last_activity_at: string | null;
  statistics?: { repository_size?: number };
}

interface GitLabCommitStub {
  id: string;
  short_id?: string;
  title?: string;
  message?: string;
  author_name?: string;
  committed_date?: string;
  created_at?: string;
  web_url?: string;
}

interface GitLabBranch {
  name: string;
  default?: boolean;
  protected?: boolean;
  web_url?: string;
  commit?: GitLabCommitStub;
}

interface GitLabTag {
  name: string;
  message: string | null;
  commit?: GitLabCommitStub;
}

type GitLabCommit = GitLabCommitStub;

interface GitLabRelease {
  name: string | null;
  tag_name: string;
  released_at: string | null;
  created_at: string | null;
  upcoming_release?: boolean;
  _links?: { self?: string };
}

interface GitLabMergeRequest {
  iid: number;
  title: string;
  created_at: string | null;
  web_url: string | null;
  draft?: boolean;
  labels?: string[];
  author?: { username: string } | null;
}

interface GitLabIssue {
  iid: number;
  title: string;
  created_at: string | null;
  web_url: string | null;
  labels?: string[];
  author?: { username: string } | null;
}

interface GitLabPipeline {
  id: number;
  name?: string | null;
  status: string | null;
  ref: string | null;
  web_url: string | null;
  updated_at: string | null;
}
