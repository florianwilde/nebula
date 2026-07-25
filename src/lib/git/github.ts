import { getJson, getJsonSafe, normalizeBaseUrl, shortSha, toIso } from "./http";
import type {
  BranchInfo,
  CommitInfo,
  ConnectionCheck,
  GitClient,
  ProviderConfig,
  ReleaseInfo,
  RepoListItem,
  RepoRef,
  RepoSnapshotData,
  TagInfo,
} from "./types";
import { GitApiError } from "./types";

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
    this.apiBase = /github\.com$/i.test(base) ? "https://api.github.com" : `${base}/api/v3`;
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

  async check(): Promise<ConnectionCheck> {
    try {
      if (!this.token) {
        await getJson(`${this.apiBase}/rate_limit`, { headers: this.headers() });
        return {
          ok: true,
          message: "Erreichbar (ohne Token – nur oeffentliche Repos, striktes Rate-Limit).",
          user: null,
        };
      }
      const user = await getJson<{ login: string; name?: string }>(`${this.apiBase}/user`, {
        headers: this.headers(),
      });
      return { ok: true, message: `Verbunden als ${user.login}`, user: user.login };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async listRepos(query?: string): Promise<RepoListItem[]> {
    if (!this.token) {
      throw new GitApiError("Fuer das Auflisten von Repos wird ein Token benoetigt.", 401, this.apiBase);
    }
    const repos = await getJson<GitHubRepo[]>(
      `${this.apiBase}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`,
      { headers: this.headers() },
    );
    const needle = query?.toLowerCase().trim();
    return (repos ?? [])
      .filter((repo) => !needle || repo.full_name.toLowerCase().includes(needle))
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

    const [branches, tags, commits, releases, languages, pulls] = await Promise.all([
      getJsonSafe<GitHubBranch[]>(`${base}/branches?per_page=50`, [], { headers }),
      getJsonSafe<GitHubTag[]>(`${base}/tags?per_page=25`, [], { headers }),
      getJsonSafe<GitHubCommit[]>(`${base}/commits?per_page=15`, [], { headers }),
      getJsonSafe<GitHubRelease[]>(`${base}/releases?per_page=10`, [], { headers }),
      getJsonSafe<Record<string, number>>(`${base}/languages`, {}, { headers }),
      getJsonSafe<GitHubPull[]>(`${base}/pulls?state=open&per_page=100`, [], { headers }),
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

    // open_issues_count zaehlt bei GitHub PRs mit – hier wieder herausrechnen.
    const openPullRequests = pulls.length;
    const openIssues = Math.max(0, (repo.open_issues_count ?? 0) - openPullRequests);

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
      commits: mappedCommits,
      releases: mappedReleases,
      languages: languages ?? {},
    };
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

interface GitHubPull {
  id: number;
}
