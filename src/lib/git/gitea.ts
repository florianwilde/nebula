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

/**
 * Gitea (und kompatible Forks wie Forgejo) – API v1.
 * Authentifizierung per "Authorization: token <PAT>".
 */
export class GiteaClient implements GitClient {
  readonly provider = "GITEA" as const;
  private readonly apiBase: string;
  private readonly token: string | null;

  constructor(config: ProviderConfig) {
    const base = normalizeBaseUrl(config.baseUrl);
    this.apiBase = `${base}/api/v1`;
    this.token = config.token;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `token ${this.token}`;
    return headers;
  }

  async check(): Promise<ConnectionCheck> {
    try {
      const version = await getJsonSafe<{ version?: string }>(
        `${this.apiBase}/version`,
        {},
        { headers: this.headers() },
      );

      if (!this.token) {
        return {
          ok: true,
          message: `Instanz erreichbar${version.version ? ` (Gitea ${version.version})` : ""} – ohne Token nur oeffentliche Repos.`,
          user: null,
          version: version.version ?? null,
        };
      }

      const user = await getJson<{ login: string; full_name?: string }>(`${this.apiBase}/user`, {
        headers: this.headers(),
      });
      return {
        ok: true,
        message: `Verbunden als ${user.login}${version.version ? ` (Gitea ${version.version})` : ""}`,
        user: user.login,
        version: version.version ?? null,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async listRepos(query?: string): Promise<RepoListItem[]> {
    const url = this.token
      ? `${this.apiBase}/user/repos?limit=100`
      : `${this.apiBase}/repos/search?limit=50${query ? `&q=${encodeURIComponent(query)}` : ""}`;

    const raw = await getJson<GiteaRepo[] | { data: GiteaRepo[] }>(url, {
      headers: this.headers(),
    });
    const repos = Array.isArray(raw) ? raw : (raw?.data ?? []);
    const needle = query?.toLowerCase().trim();

    return repos
      .filter((repo) => !needle || repo.full_name.toLowerCase().includes(needle))
      .map((repo) => ({
        fullPath: repo.full_name,
        owner: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "",
        name: repo.name,
        description: repo.description ?? null,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch ?? null,
        visibility: repo.private ? "private" : "public",
        updatedAt: toIso(repo.updated_at),
      }));
  }

  async fetchRepo(ref: RepoRef): Promise<RepoSnapshotData> {
    const base = `${this.apiBase}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;
    const headers = this.headers();

    const repo = await getJson<GiteaRepo>(base, { headers });

    const [branches, tags, commits, releases, languages, pulls] = await Promise.all([
      getJsonSafe<GiteaBranch[]>(`${base}/branches?limit=50`, [], { headers }),
      getJsonSafe<GiteaTag[]>(`${base}/tags?limit=25`, [], { headers }),
      getJsonSafe<GiteaCommit[]>(`${base}/commits?limit=15&stat=false`, [], { headers }),
      getJsonSafe<GiteaRelease[]>(`${base}/releases?limit=10`, [], { headers }),
      getJsonSafe<Record<string, number>>(`${base}/languages`, {}, { headers }),
      getJsonSafe<GiteaPull[]>(`${base}/pulls?state=open&limit=100`, [], { headers }),
    ]);

    const mappedBranches: BranchInfo[] = branches.map((branch) => ({
      name: branch.name,
      sha: branch.commit?.id ?? null,
      isDefault: branch.name === repo.default_branch,
      protected: Boolean(branch.protected),
      lastCommitAt: toIso(branch.commit?.timestamp),
      lastCommitMessage: branch.commit?.message?.split("\n")[0] ?? null,
      lastCommitAuthor: branch.commit?.author?.name ?? null,
      url: `${repo.html_url}/src/branch/${encodeURIComponent(branch.name)}`,
    }));

    const mappedTags: TagInfo[] = tags.map((tag) => ({
      name: tag.name,
      sha: tag.commit?.sha ?? tag.id ?? null,
      message: tag.message ?? null,
      date: toIso(tag.commit?.created),
      url: tag.zipball_url ? `${repo.html_url}/releases/tag/${encodeURIComponent(tag.name)}` : null,
    }));

    const mappedCommits: CommitInfo[] = commits.map((commit) => ({
      sha: commit.sha,
      shortSha: shortSha(commit.sha),
      message: commit.commit?.message?.split("\n")[0] ?? "",
      author: commit.commit?.author?.name ?? commit.author?.login ?? null,
      date: toIso(commit.commit?.author?.date ?? commit.created),
      url: commit.html_url ?? null,
    }));

    const mappedReleases: ReleaseInfo[] = releases.map((release) => ({
      name: release.name || release.tag_name,
      tag: release.tag_name,
      publishedAt: toIso(release.published_at ?? release.created_at),
      url: release.html_url ?? null,
      prerelease: Boolean(release.prerelease),
      draft: Boolean(release.draft),
    }));

    return {
      fullName: repo.full_name,
      description: repo.description ?? null,
      defaultBranch: repo.default_branch ?? null,
      htmlUrl: repo.html_url,
      visibility: repo.private ? "private" : "public",
      stars: repo.stars_count ?? 0,
      forks: repo.forks_count ?? 0,
      openIssues: repo.open_issues_count ?? 0,
      openPullRequests: repo.open_pr_counter ?? pulls.length,
      sizeKb: repo.size ?? 0,
      pushedAt: toIso(repo.updated_at),
      branches: mappedBranches,
      tags: mappedTags,
      commits: mappedCommits,
      releases: mappedReleases,
      languages: languages ?? {},
    };
  }
}

// ── API-Typen ──────────────────────────────────────────────────

interface GiteaRepo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  default_branch: string | null;
  private: boolean;
  stars_count: number;
  forks_count: number;
  open_issues_count: number;
  open_pr_counter?: number;
  size: number;
  updated_at: string | null;
  owner?: { login: string };
}

interface GiteaBranch {
  name: string;
  protected?: boolean;
  commit?: {
    id: string;
    message?: string;
    timestamp?: string;
    author?: { name?: string };
  };
}

interface GiteaTag {
  name: string;
  id?: string;
  message?: string | null;
  zipball_url?: string;
  commit?: { sha?: string; created?: string };
}

interface GiteaCommit {
  sha: string;
  html_url?: string;
  created?: string;
  author?: { login?: string } | null;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
  };
}

interface GiteaRelease {
  name: string | null;
  tag_name: string;
  published_at: string | null;
  created_at: string | null;
  html_url: string | null;
  prerelease: boolean;
  draft: boolean;
}

interface GiteaPull {
  id: number;
}
