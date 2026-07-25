import type { GitProvider } from "@prisma/client";

export type ProviderKind = GitProvider;

/** Zeiger auf ein konkretes Repository. */
export interface RepoRef {
  /** Owner / Namespace / Gruppe – bei GitLab auch verschachtelt ("gruppe/sub"). */
  owner: string;
  /** Repository-Name ohne Namespace. */
  name: string;
}

export interface BranchInfo {
  name: string;
  sha: string | null;
  isDefault: boolean;
  protected: boolean;
  lastCommitAt: string | null;
  lastCommitMessage: string | null;
  lastCommitAuthor: string | null;
  url: string | null;
}

export interface TagInfo {
  name: string;
  sha: string | null;
  message: string | null;
  date: string | null;
  url: string | null;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string | null;
}

export interface ReleaseInfo {
  name: string;
  tag: string;
  publishedAt: string | null;
  url: string | null;
  prerelease: boolean;
  draft: boolean;
}

export interface RepoOverview {
  fullName: string;
  description: string | null;
  defaultBranch: string | null;
  htmlUrl: string | null;
  visibility: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  openPullRequests: number;
  sizeKb: number;
  pushedAt: string | null;
}

export interface RepoSnapshotData extends RepoOverview {
  branches: BranchInfo[];
  tags: TagInfo[];
  commits: CommitInfo[];
  releases: ReleaseInfo[];
  languages: Record<string, number>;
}

export interface RepoListItem {
  fullPath: string;
  owner: string;
  name: string;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string | null;
  visibility: string | null;
  updatedAt: string | null;
}

export interface ConnectionCheck {
  ok: boolean;
  message: string;
  user?: string | null;
  version?: string | null;
}

export interface ProviderConfig {
  provider: ProviderKind;
  baseUrl: string;
  token: string | null;
}

export interface GitClient {
  readonly provider: ProviderKind;
  /** Prueft Erreichbarkeit und Token-Gueltigkeit. */
  check(): Promise<ConnectionCheck>;
  /** Repos, auf die der Token Zugriff hat (fuer die Auswahl beim Verknuepfen). */
  listRepos(query?: string): Promise<RepoListItem[]>;
  /** Vollstaendiger Stand eines Repositories. */
  fetchRepo(ref: RepoRef): Promise<RepoSnapshotData>;
}

/** Fehler mit HTTP-Kontext, damit die UI verstaendliche Meldungen zeigen kann. */
export class GitApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "GitApiError";
    this.status = status;
    this.url = url;
  }
}
