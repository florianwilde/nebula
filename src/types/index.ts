import type {
  ActivityKind,
  GitProvider,
  Note,
  Project,
  ProjectStatus,
  RepoSnapshot,
  Repository,
  Task,
  TaskStatus,
} from "@prisma/client";
import type {
  BranchInfo,
  CiInfo,
  CommitInfo,
  ReleaseInfo,
  TagInfo,
  TicketInfo,
} from "@/lib/git/types";

/** Verbindung ohne Geheimnisse – so wird sie an den Browser gegeben. */
export interface ConnectionSafe {
  id: string;
  name: string;
  provider: GitProvider;
  baseUrl: string;
  username: string | null;
  tokenHint: string | null;
  lastCheckedAt: Date | string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ConnectionWithCount extends ConnectionSafe {
  _count?: { repositories: number };
}

/** Ein Repository samt Verbindung und zuletzt geholtem Stand. */
export interface RepositoryWithSnapshot extends Repository {
  connection: ConnectionSafe | null;
  snapshot: RepoSnapshot | null;
}

export interface ProjectListItem extends Project {
  /** Das fuehrende zuerst – siehe repositoryInclude. */
  repositories: RepositoryWithSnapshot[];
  _count: { notes: number; tasks: number };
  /** Nur die erledigten – siehe projectListInclude. */
  tasks: { id: string }[];
}

/** Ein Eintrag im Projektverlauf, so wie ihn die Anzeige braucht. */
export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  summary: string;
  createdAt: Date | string;
  /** null bedeutet: die Anwendung selbst, etwa der automatische Abgleich. */
  user: { username: string; displayName: string | null } | null;
}

export interface ProjectDetail extends Project {
  repositories: RepositoryWithSnapshot[];
  notes: Note[];
  tasks: Task[];
  activities: ActivityEntry[];
  _count: { notes: number; tasks: number };
}

export interface RepoListEntry {
  fullPath: string;
  owner: string;
  name: string;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string | null;
  visibility: string | null;
  updatedAt: string | null;
}

export type {
  ActivityKind,
  BranchInfo,
  CiInfo,
  CommitInfo,
  Note,
  ProjectStatus,
  ReleaseInfo,
  RepoSnapshot,
  Repository,
  TagInfo,
  Task,
  TaskStatus,
  TicketInfo,
};

/** Prisma liefert Json als unknown – hier bequem in Arrays zurueckholen. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asRecord(value: unknown): Record<string, number> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, number>;
  }
  return {};
}
