import type { Project, RepoSnapshot } from "@prisma/client";
import { APP_URL } from "@/lib/config";
import { prisma } from "@/lib/db";
import { statusOf } from "@/lib/status";
import { deliver } from "./channels";
import { EVENT_META, type NotificationMessage } from "./types";

/**
 * Meldet Projekte, in denen laenger nichts passiert ist.
 *
 * Anders als die uebrigen Anlaesse haengt dieser an keinem Ereignis – es
 * passiert ja gerade nichts. Deshalb ein eigener Durchlauf, hoechstens
 * einmal am Tag.
 *
 * Massstab ist ausschliesslich der letzte Commit im verknuepften
 * Repository. Das Aenderungsdatum des Projekts taugt nicht: jeder Abgleich
 * fasst es an und wuerde den Stillstand immer wieder zuruecksetzen.
 * Projekte ohne Repository bleiben folglich aussen vor.
 */

export interface StaleReport {
  at: string;
  checked: number;
  stale: number;
  notified: number;
  thresholdDays: number;
}

/** Entscheidet, ob ein Projekt jetzt zu melden ist. */
export function isStaleDue(
  project: Pick<Project, "notifiedStaleAt">,
  lastCommitAt: Date | null,
  cutoff: Date,
): boolean {
  // Ohne bekannten letzten Commit gibt es nichts zu beurteilen.
  if (!lastCommitAt) return false;
  // Noch innerhalb der Frist.
  if (lastCommitAt >= cutoff) return false;
  // Noch nie gemeldet: jetzt.
  if (!project.notifiedStaleAt) return true;
  // Schon gemeldet – erneut nur, wenn danach wieder ein Commit kam und es
  // seitdem wieder still geworden ist.
  return lastCommitAt > project.notifiedStaleAt;
}

/** Wie viele volle Tage seit dem letzten Commit vergangen sind. */
export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function message(
  project: Project,
  snapshot: RepoSnapshot | null,
  tage: number,
): NotificationMessage {
  return {
    event: "PROJECT_STALE",
    title: `${EVENT_META.PROJECT_STALE.emoji} ${project.name}: seit ${tage} Tagen kein Commit`,
    body:
      `Der letzte Commit liegt ${tage} Tage zurueck. ` +
      `Status: ${statusOf(project.status).label}. Vielleicht abschliessen oder archivieren?`,
    priority: "normal",
    url: snapshot?.htmlUrl ?? `${APP_URL}/projects/${project.id}`,
    project: { id: project.id, name: project.name, slug: project.slug },
    at: new Date().toISOString(),
  };
}

/**
 * Ein Durchlauf. Meldet je Projekt hoechstens einmal und schreibt den
 * Merkstand fort – auch dann, wenn niemand zuhoert.
 */
export async function runStaleCheck(thresholdDays: number): Promise<StaleReport> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - thresholdDays * 86_400_000);

  const kandidaten = await prisma.project.findMany({
    where: {
      // Fertige und archivierte Projekte duerfen ruhen.
      status: { notIn: ["DONE", "ARCHIVED"] },
      ownerId: { not: null },
      snapshot: { isNot: null },
    },
    include: { snapshot: true },
  });

  const faellig = kandidaten.filter((project) =>
    isStaleDue(project, project.snapshot?.lastCommitAt ?? null, cutoff),
  );

  let zugestellt = 0;

  for (const project of faellig) {
    const lastCommitAt = project.snapshot?.lastCommitAt;
    if (!lastCommitAt || !project.ownerId) continue;

    const ziele = await prisma.notificationTarget.findMany({
      where: { userId: project.ownerId, isActive: true, events: { has: "PROJECT_STALE" } },
    });

    for (const ziel of ziele) {
      const ergebnis = await deliver(
        ziel,
        message(project, project.snapshot, daysSince(lastCommitAt, now)),
      );
      zugestellt += 1;
      await prisma.notificationTarget.update({
        where: { id: ziel.id },
        data: { lastSentAt: now, lastOk: ergebnis.ok, lastMessage: ergebnis.message },
      });
    }

    // Auch ohne Ziel vermerken, sonst kaeme beim ersten eingerichteten Ziel
    // die gesamte Vergangenheit hinterher.
    await prisma.project.update({
      where: { id: project.id },
      data: { notifiedStaleAt: now },
    });
  }

  return {
    at: now.toISOString(),
    checked: kandidaten.length,
    stale: faellig.length,
    notified: zugestellt,
    thresholdDays,
  };
}
