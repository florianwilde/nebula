import type {
  ActivityKind,
  GitProvider,
  Note,
  Project,
  ProjectStatus,
  Recurrence,
  RepoSnapshot,
  Repository,
  Task,
  TaskStatus,
} from "@prisma/client";
import type { CommitCalendar } from "@/lib/git/calendar";
import type { DueBucket } from "@/lib/tasks";
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

/**
 * Ein Repository samt Verbindung und zuletzt geholtem Stand.
 *
 * Ohne webhookSecret: das Geheimnis verlaesst den Server nicht – siehe
 * repositorySafeSelect. Ob einer eingerichtet ist, reicht die Projektseite
 * getrennt durch.
 */
export interface RepositoryWithSnapshot extends Omit<Repository, "webhookSecret"> {
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

/**
 * Eine Aufgabe in der projektuebergreifenden Uebersicht.
 *
 * Bewusst kein `extends Task`: die Seite braucht das Projekt dazu, das Fach
 * fuer die Faelligkeit kommt vom Server, und Datumsangaben gehen als
 * Zeichenkette an den Browser – ein Date ueberlebt die Serialisierung nicht.
 */
export interface TaskOverviewItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  labels: string[];
  recurrence: Recurrence | null;
  /** Gesetzt, wenn die Aufgabe an einem Git-Issue haengt. */
  sourceIssue: number | null;
  sourceUrl: string | null;
  bucket: DueBucket;
  project: { id: string; name: string; accent: string; status: ProjectStatus };
}

/** Ein Verlaufseintrag im Wochenrueckblick – mit Projekt, ueber Projekte hinweg. */
export interface ReviewEntry {
  id: string;
  kind: ActivityKind;
  summary: string;
  /** ISO – ein Date ueberlebt den Weg zum Browser nicht. */
  createdAt: string;
  project: { id: string; name: string; accent: string };
  user: { username: string; displayName: string | null } | null;
}

/** Ein Kalendertag der Woche samt seiner Eintraege. */
export interface ReviewDay {
  /** "2026-08-17", in Berliner Zeit bestimmt. */
  tag: string;
  eintraege: ReviewEntry[];
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
  CommitCalendar,
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

/**
 * Der Commit-Kalender aus dem Snapshot. Prisma liefert Json als unknown, und
 * ein Datensatz aus der Zeit vor der Heatmap hat dort ein leeres Objekt –
 * beides muss hier zu null werden, statt die Anzeige zu zerlegen.
 */
export function asCalendar(value: unknown): CommitCalendar | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kandidat = value as Partial<CommitCalendar>;
  if (typeof kandidat.from !== "string" || typeof kandidat.to !== "string") return null;
  if (!kandidat.days || typeof kandidat.days !== "object") return null;
  return {
    from: kandidat.from,
    to: kandidat.to,
    days: kandidat.days as Record<string, number>,
    source: kandidat.source === "stats" ? "stats" : "commits",
    truncated: Boolean(kandidat.truncated),
  };
}

export function asRecord(value: unknown): Record<string, number> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, number>;
  }
  return {};
}
