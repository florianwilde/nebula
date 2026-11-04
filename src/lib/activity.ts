import type { ActivityKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STATUS_META } from "@/lib/status";

/**
 * Verlauf je Projekt: was ist wann passiert.
 *
 * Der Einzeiler wird beim Schreiben formuliert und nicht erst beim Anzeigen.
 * Das ist Absicht: ein Eintrag soll auch dann noch lesbar sein, wenn es die
 * Notiz oder die Aufgabe, um die es ging, laengst nicht mehr gibt.
 */

/** Wie viele Eintraege je Projekt aufgehoben werden. */
export const ACTIVITY_LIMIT = 200;

type Entry = {
  projectId: string;
  /** null = die Anwendung selbst, etwa der Zeitgeber beim Abgleich. */
  userId?: string | null;
  kind: ActivityKind;
  summary: string;
  meta?: Prisma.InputJsonValue;
};

/**
 * Haelt einen Vorgang fest. Wirft nie: der Verlauf ist Beiwerk, und daran
 * darf die eigentliche Aenderung nicht scheitern.
 */
export async function recordActivity(entry: Entry): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        projectId: entry.projectId,
        userId: entry.userId ?? null,
        kind: entry.kind,
        summary: entry.summary,
        meta: entry.meta,
      },
    });
  } catch (error) {
    console.error("[activity] konnte nicht geschrieben werden:", error);
  }
}

/** Mehrere Vorgaenge auf einmal – ein Rundgang statt vieler. */
export async function recordActivities(entries: Entry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.activity.createMany({
      data: entries.map((entry) => ({
        projectId: entry.projectId,
        userId: entry.userId ?? null,
        kind: entry.kind,
        summary: entry.summary,
        meta: entry.meta,
      })),
    });
  } catch (error) {
    console.error("[activity] konnte nicht geschrieben werden:", error);
  }
}

// ── Formulierungshilfen ──────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  summary: "Kurzbeschreibung",
  description: "Beschreibung",
  priority: "Priorität",
  progress: "Fortschritt",
  accent: "Farbe",
  tags: "Tags",
  favorite: "Favorit",
  autoSync: "Automatischer Abgleich",
  progressFromTasks: "Fortschritt aus Aufgaben",
  autoImportIssues: "Issues automatisch übernehmen",
  autoCreateIssues: "Aufgaben automatisch als Issue",
  connectionId: "Git-Verbindung",
  repoUrl: "Repository",
  repoOwner: "Repository",
  repoName: "Repository",
  defaultBranch: "Standard-Branch",
};

/**
 * Aus geaenderten Feldnamen einen lesbaren Satz machen: "Name und Tags
 * geändert". Doppelte Bezeichnungen fallen weg – wer repoOwner und repoName
 * zusammen setzt, hat einmal das Repository geaendert, nicht zweimal.
 */
export function describeFields(fields: string[]): string | null {
  const labels: string[] = [];
  for (const field of fields) {
    const label = FIELD_LABELS[field];
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) return null;
  if (labels.length === 1) return `${labels[0]} geändert`;

  // Ab vier Feldern wird die Aufzaehlung laenger als sie nuetzt.
  if (labels.length > 3) return `${labels.length} Felder geändert`;
  return `${labels.slice(0, -1).join(", ")} und ${labels.at(-1)} geändert`;
}

/** "Idee → In Entwicklung" */
export function describeStatus(from: string, to: string): string {
  const label = (value: string) =>
    STATUS_META[value as keyof typeof STATUS_META]?.label ?? value;
  return `Status: ${label(from)} → ${label(to)}`;
}

/** Kuerzt lange Titel, damit ein Eintrag eine Zeile bleibt. */
export function shorten(text: string, max = 70): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Stutzt den Verlauf auf die neuesten Eintraege je Projekt zurueck. Laeuft
 * im taeglichen Durchgang des Zeitgebers mit – bei jedem Schreiben zu
 * pruefen waere eine zusaetzliche Abfrage fuer nichts.
 */
export async function pruneActivities(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    WITH nummeriert AS (
      SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "projectId" ORDER BY "createdAt" DESC, "id" DESC
      ) AS rang
      FROM "Activity"
    ), geloescht AS (
      DELETE FROM "Activity"
      WHERE "id" IN (SELECT "id" FROM nummeriert WHERE rang > ${ACTIVITY_LIMIT})
      RETURNING 1
    )
    SELECT COUNT(*)::bigint AS count FROM geloescht
  `;
  return Number(rows[0]?.count ?? 0);
}
