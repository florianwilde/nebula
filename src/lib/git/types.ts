import type { GitProvider } from "@prisma/client";
import type { CommitCalendar } from "./calendar";

export type { CommitCalendar };

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

/** Ein offener Pull Request, Merge Request oder ein Issue. */
export interface TicketInfo {
  number: number;
  title: string;
  author: string | null;
  createdAt: string | null;
  url: string | null;
  draft: boolean;
  labels: string[];
}

/** Ergebnis des letzten CI-Laufs auf dem Default-Branch. */
export type CiState = "success" | "failure" | "running" | "pending" | "cancelled";

export interface CiInfo {
  state: CiState;
  /** Name des Workflows bzw. der Pipeline, falls die API ihn liefert. */
  name: string | null;
  branch: string | null;
  url: string | null;
  finishedAt: string | null;
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
  pullRequests: TicketInfo[];
  issues: TicketInfo[];
  ci: CiInfo | null;
  /** Commits je Tag der letzten 30 Tage, aeltester zuerst. */
  commitActivity: number[];
}

/** Tage, ueber die die Commit-Aktivitaet gebildet wird. */
export const ACTIVITY_DAYS = 30;

/**
 * Verteilt Commit-Zeitpunkte auf Tagesbuckets. Bewusst aus den ohnehin
 * geholten Commits berechnet statt ueber eigene Statistik-Endpunkte: die
 * gibt es nicht bei allen drei Systemen, und bei GitHub antworten sie beim
 * ersten Aufruf mit 202 und ohne Daten.
 *
 * Wichtig fuer die Ehrlichkeit der Kurve: geholt wird nur eine Seite
 * Commits. Liegt der aelteste davon noch innerhalb des Zeitraums, wissen wir
 * ueber die Tage davor schlicht nichts – dort eine Null zu zeichnen waere
 * falsch. Deshalb wird die Kurve auf den tatsaechlich belegten Zeitraum
 * gekuerzt.
 */
export function bucketCommitActivity(dates: Array<string | null>): number[] {
  const buckets = new Array<number>(ACTIVITY_DAYS).fill(0);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let oldestDaysAgo = -1;

  for (const value of dates) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time)) continue;
    const daysAgo = Math.floor((now - time) / dayMs);
    if (daysAgo < 0) continue;
    if (daysAgo > oldestDaysAgo) oldestDaysAgo = daysAgo;
    if (daysAgo >= ACTIVITY_DAYS) continue;
    buckets[ACTIVITY_DAYS - 1 - daysAgo] += 1;
  }

  // Reicht die Historie nicht bis an den Rand des Zeitraums, nur den
  // belegten Ausschnitt zurueckgeben.
  if (oldestDaysAgo >= 0 && oldestDaysAgo < ACTIVITY_DAYS - 1) {
    return buckets.slice(ACTIVITY_DAYS - 1 - oldestDaysAgo);
  }

  return buckets;
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
  /**
   * Commits je Tag ueber ein Jahr – fuer die Heatmap.
   *
   * Getrennt von fetchRepo, weil es zusaetzliche Aufrufe kostet und nur
   * hoechstens einmal am Tag noetig ist. null heisst: nichts zu holen.
   */
  fetchCommitCalendar(ref: RepoRef): Promise<CommitCalendar | null>;
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
