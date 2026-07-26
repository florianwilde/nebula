import type { Prisma } from "@prisma/client";
import { getAppSettings } from "@/lib/auth/settings";
import { prisma } from "@/lib/db";
import { runStaleCheck } from "@/lib/notify/stale";
import { syncProject } from "@/lib/sync";

/**
 * Automatischer Abgleich mit den Git-Systemen.
 *
 * Laeuft im Serverprozess selbst, angestossen von instrumentation.ts. Fuer
 * eine Einzelinstanz ist das die einfachste tragfaehige Loesung: kein
 * zusaetzlicher Container, kein externer Cron, keine zweite Konfiguration.
 * Wer lieber von aussen taktet, ruft stattdessen POST /api/admin/sync/run
 * auf und laesst den Automatismus aus.
 *
 * Ruecksicht auf fremde Kontingente:
 *  - je Durchlauf nur eine begrenzte Zahl Projekte
 *  - die am laengsten nicht abgeglichenen zuerst
 *  - nach Fehlschlaegen wird zurueckgehalten, mit wachsendem Abstand
 *  - kurze Pause zwischen den Projekten
 */

const TICK_MS = 60_000;
/** Stillstand aendert sich langsam – einmal am Tag genuegt. */
const STALE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Kleine Verschnaufpause zwischen zwei Projekten. */
const PAUSE_MS = 400;
/** Hoechstens so lange wird nach Fehlschlaegen zurueckgehalten. */
const MAX_BACKOFF_STEPS = 4;

export interface AutoSyncReport {
  at: string;
  trigger: "zeitplan" | "manuell";
  candidates: number;
  synced: number;
  failed: number;
  /** Wegen Zurueckhaltung nach Fehlschlaegen uebersprungen. */
  skipped: number;
  durationMs: number;
}

// Ueber globalThis, damit der Hot-Reload im Entwicklungsbetrieb nicht bei
// jedem Neuladen einen weiteren Zeitgeber startet.
const globalForScheduler = globalThis as unknown as {
  nebulaAutoSyncTimer?: NodeJS.Timeout;
  nebulaAutoSyncRunning?: boolean;
};

export function startAutoSyncScheduler() {
  if (globalForScheduler.nebulaAutoSyncTimer) return;

  const timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  // Der Zeitgeber darf den Prozess nicht am Beenden hindern.
  timer.unref?.();
  globalForScheduler.nebulaAutoSyncTimer = timer;

  // Kurz nach dem Start einmal nachsehen, statt eine volle Minute zu warten.
  const initial = setTimeout(() => void tick(), 20_000);
  initial.unref?.();

  console.log("[nebula] Zeitgeber fuer den automatischen Abgleich laeuft.");
}

/** Prueft, ob ein Durchlauf faellig ist, und startet ihn gegebenenfalls. */
async function tick() {
  try {
    const settings = await getAppSettings();

    if (settings.autoSyncEnabled) {
      const intervalMs = Math.max(5, settings.autoSyncIntervalMinutes) * 60_000;
      const last = settings.lastAutoSyncAt?.getTime() ?? 0;
      if (Date.now() - last >= intervalMs) {
        await runAutoSyncPass("zeitplan");
      }
    }

    // Unabhaengig vom Abgleich: der Stillstand ergibt sich aus dem
    // gespeicherten Stand, dafuer muss nichts geholt werden.
    await maybeCheckStale();
  } catch (error) {
    console.error("[nebula] Automatischer Abgleich fehlgeschlagen:", error);
  }
}

/**
 * Stillstandspruefung, hoechstens einmal am Tag. Laeuft nur, wenn ueberhaupt
 * jemand darauf hoert – sonst waere es reine Datenbanklast.
 */
async function maybeCheckStale() {
  const settings = await getAppSettings();
  const last = settings.lastStaleCheckAt?.getTime() ?? 0;
  if (Date.now() - last < STALE_CHECK_INTERVAL_MS) return;

  const zuhoerer = await prisma.notificationTarget.count({
    where: { isActive: true, events: { has: "PROJECT_STALE" } },
  });

  // Zeitstempel auch ohne Zuhoerer setzen, damit nicht jede Minute gezaehlt
  // wird.
  await prisma.appSettings.update({
    where: { id: "singleton" },
    data: { lastStaleCheckAt: new Date() },
  });

  if (zuhoerer === 0) return;

  const report = await runStaleCheck(Math.max(1, settings.staleAfterDays));
  if (report.stale > 0) {
    console.log(
      `[nebula] Stillstand: ${report.stale} von ${report.checked} Projekten ` +
        `ueber ${report.thresholdDays} Tage ohne Commit, ${report.notified} Meldungen.`,
    );
  }
}

/**
 * Ein Durchlauf. Laeuft nie zweimal gleichzeitig – ein zweiter Aufruf
 * waehrend eines laufenden Durchlaufs bekommt null zurueck.
 */
export async function runAutoSyncPass(
  trigger: AutoSyncReport["trigger"],
): Promise<AutoSyncReport | null> {
  if (globalForScheduler.nebulaAutoSyncRunning) return null;
  globalForScheduler.nebulaAutoSyncRunning = true;

  const startedAt = Date.now();
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const settings = await getAppSettings();
    const batchSize = Math.max(1, Math.min(200, settings.autoSyncBatchSize));
    const intervalMs = Math.max(5, settings.autoSyncIntervalMinutes) * 60_000;

    const where: Prisma.ProjectWhereInput = {
      autoSync: true,
      // Ohne Repository gibt es nichts abzugleichen.
      OR: [
        { AND: [{ repoOwner: { not: null } }, { repoName: { not: null } }] },
        { repoUrl: { not: null } },
      ],
      ...(settings.autoSyncActiveOnly
        ? { status: { notIn: ["DONE", "ARCHIVED"] } }
        : {}),
    };

    // Grosszuegig holen: ein Teil faellt gleich der Zurueckhaltung zum Opfer.
    const candidates = await prisma.project.findMany({
      where,
      orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
      take: batchSize * 4,
      select: { id: true, name: true, lastSyncedAt: true, syncFailureCount: true },
    });

    const due = candidates.filter((project) => {
      if (project.syncFailureCount === 0) return true;
      if (!project.lastSyncedAt) return true;

      // Nach jedem Fehlschlag doppelt so lange warten, gedeckelt.
      const steps = Math.min(project.syncFailureCount, MAX_BACKOFF_STEPS);
      const wait = intervalMs * 2 ** steps;
      const ready = Date.now() - project.lastSyncedAt.getTime() >= wait;
      if (!ready) skipped += 1;
      return ready;
    });

    const batch = due.slice(0, batchSize);

    for (const project of batch) {
      const result = await syncProject(project.id);
      if (result.ok) synced += 1;
      else failed += 1;
      if (PAUSE_MS > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }

    const report: AutoSyncReport = {
      at: new Date().toISOString(),
      trigger,
      candidates: candidates.length,
      synced,
      failed,
      skipped,
      durationMs: Date.now() - startedAt,
    };

    await prisma.appSettings.update({
      where: { id: "singleton" },
      data: {
        lastAutoSyncAt: new Date(),
        lastAutoSyncReport: report as unknown as Prisma.InputJsonValue,
      },
    });

    console.log(
      `[nebula] Abgleich (${trigger}): ${synced} aktualisiert, ${failed} fehlgeschlagen, ` +
        `${skipped} zurueckgestellt, ${report.durationMs} ms`,
    );

    return report;
  } finally {
    globalForScheduler.nebulaAutoSyncRunning = false;
  }
}

export function isAutoSyncRunning(): boolean {
  return Boolean(globalForScheduler.nebulaAutoSyncRunning);
}
