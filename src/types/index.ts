import type { GitProvider, Note, Project, ProjectStatus, RepoSnapshot } from "@prisma/client";
import type { BranchInfo, CommitInfo, ReleaseInfo, TagInfo } from "@/lib/git/types";

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
  _count?: { projects: number };
}

export interface ProjectListItem extends Project {
  connection: ConnectionSafe | null;
  snapshot: RepoSnapshot | null;
  _count: { notes: number };
}

export interface ProjectDetail extends Project {
  connection: ConnectionSafe | null;
  snapshot: RepoSnapshot | null;
  notes: Note[];
  _count: { notes: number };
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

export type { BranchInfo, CommitInfo, Note, ProjectStatus, ReleaseInfo, RepoSnapshot, TagInfo };

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
