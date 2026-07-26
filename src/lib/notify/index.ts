import type { NotificationEvent, Project, RepoSnapshot, Repository } from "@prisma/client";
import { APP_NAME, APP_URL } from "@/lib/config";
import { prisma } from "@/lib/db";
import { repoTitle } from "@/lib/repositories";
import { deliver } from "./channels";
import { EVENT_META, type NotificationMessage } from "./types";

export * from "./types";
export { emailAvailable, smtpConfig } from "./channels";

/**
 * Entscheidet nach einem Abgleich, worueber zu benachrichtigen ist, und
 * stellt zu.
 *
 * Gemeldet wird ausschliesslich bei einer **Aenderung** gegenueber dem,
 * worueber zuletzt benachrichtigt wurde. Sonst kaeme bei einem Repo mit
 * abgelaufenem Token mit jedem stuendlichen Durchlauf dieselbe Nachricht.
 * Der zuletzt gemeldete Zustand steht am Repository – nicht am Projekt, sonst
 * verdeckte ein rotes Frontend die rote Pipeline des Backends.
 *
 * Fehler beim Zustellen werden geschluckt: eine kaputte Benachrichtigung
 * darf den Abgleich nicht scheitern lassen.
 */
export async function notifyAfterSync(repositoryId: string): Promise<void> {
  try {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: { snapshot: true, project: true },
    });
    if (!repository?.project.ownerId) return;

    const faellig = pendingEvents(repository.project, repository, repository.snapshot);
    if (faellig.length === 0) return;

    const ziele = await prisma.notificationTarget.findMany({
      where: {
        userId: repository.project.ownerId,
        isActive: true,
        events: { hasSome: faellig.map((entry) => entry.event) },
      },
    });

    // Auch ohne Ziel den Merkstand fortschreiben: sonst kaeme beim ersten
    // eingerichteten Ziel gleich die gesamte Vergangenheit hinterher.
    await prisma.repository.update({
      where: { id: repository.id },
      data: {
        notifiedSyncError: repository.syncError,
        notifiedCiState: repository.snapshot?.ciState ?? null,
        notifiedRelease: currentRelease(repository.snapshot),
      },
    });

    if (ziele.length === 0) return;

    for (const eintrag of faellig) {
      const passende = ziele.filter((ziel) => ziel.events.includes(eintrag.event));
      for (const ziel of passende) {
        const ergebnis = await deliver(ziel, eintrag.message);
        await prisma.notificationTarget.update({
          where: { id: ziel.id },
          data: {
            lastSentAt: new Date(),
            lastOk: ergebnis.ok,
            lastMessage: ergebnis.message,
          },
        });
      }
    }
  } catch (error) {
    console.error("[nebula] Benachrichtigung fehlgeschlagen:", error);
  }
}

function currentRelease(snapshot: RepoSnapshot | null): string | null {
  if (!snapshot) return null;
  return snapshot.latestRelease ?? snapshot.latestTag ?? null;
}

/**
 * Vergleicht den aktuellen Stand mit dem zuletzt gemeldeten.
 * Exportiert, weil hier die eigentliche Entscheidung faellt – siehe Tests.
 */
export function pendingEvents(
  project: Project,
  repository: Repository,
  snapshot: RepoSnapshot | null,
): Array<{ event: NotificationEvent; message: NotificationMessage }> {
  const treffer: Array<{ event: NotificationEvent; message: NotificationMessage }> = [];
  const projektUrl = `${APP_URL}/projects/${project.id}`;
  const bezug = { id: project.id, name: project.name, slug: project.slug };
  const jetzt = new Date().toISOString();

  /**
   * Der Betreff nennt das Repository nur, wenn es nicht ohnehin so heisst
   * wie das Projekt. "nebula – nebula: CI ist rot" liest niemand gern.
   */
  const titel = repoTitle(repository);
  const woher =
    titel.toLowerCase() === project.name.toLowerCase() ||
    titel.toLowerCase().endsWith(`/${project.name.toLowerCase()}`)
      ? project.name
      : `${project.name} · ${titel}`;

  if (repository.syncError && repository.syncError !== repository.notifiedSyncError) {
    treffer.push({
      event: "SYNC_FAILED",
      message: {
        event: "SYNC_FAILED",
        title: `${EVENT_META.SYNC_FAILED.emoji} ${woher}: Abgleich fehlgeschlagen`,
        body: repository.syncError,
        priority: "high",
        url: projektUrl,
        project: bezug,
        at: jetzt,
      },
    });
  }

  const ci = snapshot?.ciState ?? null;
  if (ci === "failure" && ci !== repository.notifiedCiState) {
    treffer.push({
      event: "CI_FAILED",
      message: {
        event: "CI_FAILED",
        title: `${EVENT_META.CI_FAILED.emoji} ${woher}: CI ist rot`,
        body:
          `Der letzte Lauf auf ${snapshot?.ciBranch ?? "dem Default-Branch"} ist ` +
          `fehlgeschlagen${snapshot?.ciName ? ` (${snapshot.ciName})` : ""}.`,
        priority: "high",
        url: snapshot?.ciUrl ?? projektUrl,
        project: bezug,
        at: jetzt,
      },
    });
  }

  const release = currentRelease(snapshot);
  // Beim allerersten Abgleich ist notifiedRelease noch leer – dann waere
  // jede vorhandene Version eine "Neuigkeit". Deshalb nur melden, wenn
  // vorher schon einmal etwas festgehalten wurde.
  if (release && repository.notifiedRelease && release !== repository.notifiedRelease) {
    treffer.push({
      event: "NEW_RELEASE",
      message: {
        event: "NEW_RELEASE",
        title: `${EVENT_META.NEW_RELEASE.emoji} ${woher}: ${release}`,
        body: `Neue Version im Repository: ${release} (vorher ${repository.notifiedRelease}).`,
        priority: "normal",
        url: snapshot?.htmlUrl ?? projektUrl,
        project: bezug,
        at: jetzt,
      },
    });
  }

  return treffer;
}

/** Nachricht fuer den Knopf "Testen" an einem Ziel. */
export function testMessage(): NotificationMessage {
  return {
    event: "TEST",
    title: `🔔 ${APP_NAME}: Testnachricht`,
    body:
      "Wenn du das liest, ist der Zustellweg eingerichtet. " +
      "Echte Meldungen kommen nur bei einer Aenderung – nicht bei jedem Abgleich.",
    priority: "normal",
    url: APP_URL,
    project: null,
    at: new Date().toISOString(),
  };
}
