import type { TaskStatus } from "@prisma/client";
import { recordActivity, shorten } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { clientForConnection } from "@/lib/git";
import type { GitClient, RepoRef } from "@/lib/git/types";
import { nextPosition, refreshDerivedProgress, spawnRecurrence } from "@/lib/tasks";

/**
 * Die Bruecke zwischen Nebula-Aufgabe und Git-Issue.
 *
 * Die Zustaende passen nicht aufeinander und das bleibt so: Nebula kennt
 * OFFEN, IN ARBEIT, BLOCKIERT und ERLEDIGT, ein Issue nur offen oder
 * geschlossen. Nach aussen geht deshalb nur die Grenze zwischen "erledigt"
 * und "nicht erledigt"; ein Rundlauf verliert IN ARBEIT und BLOCKIERT.
 *
 * Die Alternative waeren Labels wie "nebula:doing" – die wuerden den
 * Issue-Tracker aber mit Zustaenden fuellen, die dort niemand pflegt. Die
 * feine Abstufung bleibt in Nebula.
 */

/** Ist der Aufgabenzustand einer, bei dem das Issue offen sein soll? */
export function issueShouldBeOpen(status: TaskStatus): boolean {
  return status !== "DONE";
}

/** Der Aufgabenzustand, der zu einem Issue-Zustand passt. */
export function statusForIssueState(open: boolean, current: TaskStatus): TaskStatus {
  if (open) {
    // Ein wieder geoeffnetes Issue macht aus ERLEDIGT wieder OFFEN. Stand
    // die Aufgabe ohnehin nicht auf ERLEDIGT, bleibt ihr feinerer Zustand
    // stehen – IN ARBEIT ist mehr Information als OFFEN.
    return current === "DONE" ? "TODO" : current;
  }
  return "DONE";
}

/**
 * Traegt den Zustand einer Aufgabe an ihrem Issue nach.
 *
 * Bewusst fehlertolerant: schlaegt der Aufruf fehl, ist die Aufgabe in
 * Nebula trotzdem umgezogen. Ein nicht erreichbares Git-System darf das
 * Abhaken nicht verhindern – der naechste Wechsel versucht es erneut.
 *
 * Gibt zurueck, ob es geklappt hat; null heisst "nichts zu tun".
 */
export async function mirrorStatusToIssue(
  taskId: string,
  status: TaskStatus,
): Promise<boolean | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { sourceIssue: true, sourceRepositoryId: true },
  });
  if (!task?.sourceIssue || !task.sourceRepositoryId) return null;

  const repository = await prisma.repository.findUnique({
    where: { id: task.sourceRepositoryId },
    include: { connection: true },
  });
  if (!repository?.connection || !repository.repoOwner || !repository.repoName) return null;

  try {
    const client = clientForConnection(repository.connection);
    await client.setIssueState(
      { owner: repository.repoOwner, name: repository.repoName },
      task.sourceIssue,
      issueShouldBeOpen(status),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Hakt eine Aufgabe ab, weil ihr Issue geschlossen wurde.
 *
 * Bewusst an einer Stelle fuer beide Wege – Webhook und Abgleich. Vorher
 * setzte der Webhook nur den Status und liess dabei aus, was die Oberflaeche
 * tut: die naechste Fassung einer wiederkehrenden Aufgabe anlegen und den
 * Vorgang in den Verlauf schreiben.
 *
 * Gibt false zurueck, wenn nichts zu tun war (Aufgabe fehlt oder ist schon
 * erledigt) – der Aufrufer kann daran zaehlen, was er bewirkt hat.
 */
export async function completeTaskFromIssue(
  taskId: string,
  herkunft: "webhook" | "abgleich",
): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, projectId: true, sourceIssue: true },
  });
  if (!task || task.status === "DONE") return false;

  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: "DONE",
      doneAt: new Date(),
      position: await nextPosition(task.projectId, "DONE"),
    },
  });

  // Wie beim Abhaken von Hand: eine wiederkehrende Aufgabe erzeugt ihre
  // naechste Fassung.
  const folge = await spawnRecurrence(task.id);
  await refreshDerivedProgress(task.projectId);

  await recordActivity({
    projectId: task.projectId,
    // Kein userId: das hat nicht ein Mensch in Nebula getan, sondern das
    // Git-System gemeldet.
    kind: "TASK_MOVED",
    summary:
      `Issue #${task.sourceIssue} geschlossen → „${shorten(task.title, 40)}“ erledigt` +
      (herkunft === "abgleich" ? " (beim Abgleich bemerkt)" : "") +
      (folge ? ", nächste angelegt" : ""),
    meta: { taskId: task.id, issue: task.sourceIssue, source: herkunft },
  });

  return true;
}

/** Wie viele Issues ein Abgleich hoechstens einzeln nachfragt. */
const MAX_NACHFRAGEN = 25;

/**
 * Gleicht beim Abgleich die verknuepften Issues ab: was in Git geschlossen
 * ist, wird in Nebula abgehakt.
 *
 * Warum zusaetzlich zum Webhook: der Webhook wirkt sofort, setzt aber voraus,
 * dass die Instanz von aussen erreichbar ist und der Haken eingetragen wurde.
 * Ist er das nicht – oder faellt er einmal aus –, bliebe der Rueckweg sonst
 * ganz aus. Hier kommt er verzoegert, aber verlaesslich.
 *
 * **Nur abhaken, nie zuruecknehmen.** Der Abgleich sieht Zustaende, keine
 * Ereignisse. Ein offenes Issue kann auch bedeuten, dass das Schliessen von
 * Nebula aus fehlgeschlagen ist – dann wuerde ein symmetrischer Abgleich eine
 * bewusst erledigte Aufgabe wieder aufmachen. Das Zuruecknehmen bleibt dem
 * Webhook vorbehalten, der ein echtes "reopened" sieht.
 *
 * Fehler werden geschluckt: ein nicht erreichbares Issue darf den Abgleich
 * des Repositories nicht scheitern lassen.
 */
export async function reconcileLinkedIssues(
  repositoryId: string,
  client: GitClient,
  ref: RepoRef,
  /** Nummern, die der Snapshot gerade als offen gemeldet hat. */
  offeneNummern: number[] = [],
): Promise<number> {
  const offen = new Set(offeneNummern);

  const kandidaten = await prisma.task.findMany({
    where: {
      sourceRepositoryId: repositoryId,
      sourceIssue: { not: null },
      status: { not: "DONE" },
    },
    select: { id: true, sourceIssue: true },
    orderBy: { createdAt: "asc" },
  });

  let abgehakt = 0;
  let nachfragen = 0;

  for (const task of kandidaten) {
    const nummer = task.sourceIssue;
    if (nummer === null) continue;

    // Steht die Nummer in der Liste der offenen Issues, ist nichts zu tun –
    // und der Aufruf gespart. Umgekehrt gilt das nicht: die Liste ist
    // gedeckelt, aus dem Fehlen folgt also nichts.
    if (offen.has(nummer)) continue;

    if (nachfragen >= MAX_NACHFRAGEN) break;
    nachfragen += 1;

    try {
      const zustand = await client.getIssueState(ref, nummer);
      // null heisst "gibt es nicht mehr" – geloescht ist nicht erledigt,
      // also bleibt die Aufgabe stehen.
      if (zustand !== "closed") continue;
      if (await completeTaskFromIssue(task.id, "abgleich")) abgehakt += 1;
    } catch {
      // Nichts erreichbar, nichts geaendert – der naechste Lauf versucht es.
    }
  }

  return abgehakt;
}
