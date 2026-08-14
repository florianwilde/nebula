import type { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clientForConnection } from "@/lib/git";

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
