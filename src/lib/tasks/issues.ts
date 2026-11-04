import { Prisma, type Task, type TaskStatus } from "@prisma/client";
import { recordActivity, shorten } from "@/lib/activity";
import { APP_URL } from "@/lib/config";
import { prisma } from "@/lib/db";
import { GitApiError, clientForConnection } from "@/lib/git";
import type { CreatedIssue, GitClient, RepoRef, TicketInfo } from "@/lib/git/types";
import { repoTitle } from "@/lib/git/meta";
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
    // "from"/"to" wie beim Verschieben von Hand – der Wochenrueckblick
    // zaehlt daran ab, was erledigt wurde, statt den Text zu durchsuchen.
    meta: {
      taskId: task.id,
      issue: task.sourceIssue,
      source: herkunft,
      from: task.status,
      to: "DONE",
    },
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

// ── Issues als Aufgaben uebernehmen ──────────────────────────

/**
 * Welche Issues noch keine Aufgabe haben. Rein, damit sich die Auswahl
 * ohne Datenbank pruefen laesst.
 */
export function issuesToImport(
  issues: TicketInfo[],
  bekannt: Iterable<number | null>,
): TicketInfo[] {
  const schon = new Set(bekannt);
  const gesehen = new Set<number>();
  return issues.filter((issue) => {
    // Doppelte Nummern in einer Liste gaebe es nur bei einer kaputten
    // Antwort – dann aber nicht als zwei Aufgaben.
    if (schon.has(issue.number) || gesehen.has(issue.number)) return false;
    gesehen.add(issue.number);
    return true;
  });
}

/**
 * Legt zu Issues eines Repositories Aufgaben an, sofern es sie noch nicht
 * gibt. Ein Weg fuer den Klick im Git-Panel und fuer die automatische
 * Uebernahme beim Abgleich.
 *
 * Die Eindeutigkeit je Repository steht in der Datenbank. Kommt ein
 * zweiter Weg zuvor – etwa das automatische Anlegen eines Issues, dessen
 * Nummer gerade erst gespeichert wird –, faellt die einzelne Aufgabe aus
 * und der Rest laeuft weiter.
 */
export async function importIssuesAsTasks(input: {
  projectId: string;
  repository: {
    id: string;
    label: string | null;
    repoOwner: string | null;
    repoName: string | null;
    repoUrl: string | null;
  };
  issues: TicketInfo[];
  /** Fehlt bei der automatischen Uebernahme – das hat kein Mensch getan. */
  userId?: string;
}): Promise<Task[]> {
  const { projectId, repository } = input;
  if (input.issues.length === 0) return [];

  const vorhanden = await prisma.task.findMany({
    where: {
      projectId,
      sourceRepositoryId: repository.id,
      sourceIssue: { in: input.issues.map((issue) => issue.number) },
    },
    select: { sourceIssue: true },
  });
  const neu = issuesToImport(
    input.issues,
    vorhanden.map((task) => task.sourceIssue),
  );
  if (neu.length === 0) return [];

  let position = await nextPosition(projectId, "TODO");
  const angelegt: Task[] = [];
  for (const issue of neu) {
    try {
      angelegt.push(
        await prisma.task.create({
          data: {
            projectId,
            title: issue.title.slice(0, 200),
            // Der Link ist das Wichtigste – der Text steht im Git-System.
            description: issue.url ? `[Issue #${issue.number}](${issue.url})` : null,
            status: "TODO",
            position: position++,
            labels: issue.labels.slice(0, 8),
            sourceIssue: issue.number,
            sourceUrl: issue.url,
            sourceRepositoryId: repository.id,
          },
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  if (angelegt.length > 0) {
    await refreshDerivedProgress(projectId);
    await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    // Ein Eintrag fuer den Vorgang, nicht einer je Aufgabe: sonst besteht der
    // Verlauf nach einer Uebernahme aus nichts anderem mehr.
    const titel = repoTitle(repository);
    await recordActivity({
      projectId,
      userId: input.userId,
      kind: "TASKS_IMPORTED",
      summary:
        (angelegt.length === 1
          ? `1 Issue aus ${titel} als Aufgabe übernommen`
          : `${angelegt.length} Issues aus ${titel} als Aufgaben übernommen`) +
        (input.userId ? "" : " (automatisch)"),
      meta: {
        repositoryId: repository.id,
        numbers: angelegt.map((task) => task.sourceIssue),
        ...(input.userId ? {} : { source: "abgleich" }),
      },
    });
  }

  return angelegt;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ── Aufgabe als Issue anlegen ────────────────────────────────

export type CreateIssueResult =
  | { ok: true; task: Task; issue: CreatedIssue }
  | {
      ok: false;
      status: number;
      error: string;
      issue?: { number: number | null; url: string | null };
    };

/**
 * Legt zu einer Aufgabe ein Issue im verknuepften Repository an.
 *
 * Der Besitz muss vorher geprueft sein – hier wird nur noch die Aufgabe
 * selbst geladen. Aufrufer sind der Knopf im Dialog und das automatische
 * Anlegen neuer Aufgaben.
 *
 * **Wettlauf mit der Uebernahme.** Das Git-System meldet das neue Issue per
 * Webhook, und der Abgleich dahinter koennte es als Aufgabe uebernehmen,
 * bevor die Nummer hier gespeichert ist. Dann stuende das Issue zweimal in
 * Nebula. Die Eindeutigkeit je Repository faengt das: scheitert das
 * Speichern daran, wird die eben uebernommene Dublette verworfen und die
 * urspruengliche Aufgabe verknuepft – sie traegt Beschreibung und Zustand,
 * die Dublette nur den Titel.
 */
export async function createIssueForTask(
  taskId: string,
  options: { repositoryId?: string; userId?: string } = {},
): Promise<CreateIssueResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      description: true,
      projectId: true,
      sourceIssue: true,
      sourceUrl: true,
      project: { select: { name: true } },
    },
  });
  if (!task) return { ok: false, status: 404, error: "Aufgabe nicht gefunden" };

  // Schon verknuepft: nicht noch einmal anlegen. Ein zweites Issue zur
  // selben Aufgabe waere genau die Dublette, die die Uebernahme vermeidet.
  if (task.sourceIssue !== null) {
    return {
      ok: false,
      status: 409,
      error: "Diese Aufgabe haengt bereits an einem Issue.",
      issue: { number: task.sourceIssue, url: task.sourceUrl },
    };
  }

  // Die Besitzerbedingung laeuft ueber das Projekt der Aufgabe – eine
  // fremde Repository-ID trifft hier also nichts.
  const repository = await prisma.repository.findFirst({
    where: {
      projectId: task.projectId,
      ...(options.repositoryId ? { id: options.repositoryId } : {}),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { connection: true },
  });

  if (!repository) {
    return { ok: false, status: 422, error: "Das Projekt hat kein verknuepftes Repository." };
  }
  if (!repository.connection) {
    return {
      ok: false,
      status: 422,
      error:
        "Das Repository haengt an keiner Git-Verbindung – ohne Token laesst sich nichts anlegen.",
    };
  }
  if (!repository.repoOwner || !repository.repoName) {
    return { ok: false, status: 422, error: "Am Repository fehlen Owner oder Name." };
  }

  const client = clientForConnection(repository.connection);

  // Rueckverweis in den Rumpf: wer das Issue im Git-System liest, soll
  // wissen, wo es herkommt und wo der Rest der Notizen liegt.
  const rumpf = [
    task.description?.trim() || null,
    `_Angelegt aus [${task.project.name}](${APP_URL}/projects/${task.projectId}) in Nebula._`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let issue: CreatedIssue;
  try {
    issue = await client.createIssue(
      { owner: repository.repoOwner, name: repository.repoName },
      { title: task.title, body: rumpf },
    );
  } catch (error) {
    // Der Aufruf ging nach draussen; die Meldung des Git-Systems ist
    // hilfreicher als ein pauschales "hat nicht geklappt".
    return {
      ok: false,
      status: 502,
      error:
        error instanceof GitApiError
          ? `Issue konnte nicht angelegt werden: ${error.message}`
          : "Issue konnte nicht angelegt werden.",
    };
  }

  const verknuepfen = {
    sourceIssue: issue.number,
    sourceUrl: issue.url,
    sourceRepositoryId: repository.id,
  };

  let aktualisiert: Task;
  try {
    aktualisiert = await prisma.task.update({ where: { id: task.id }, data: verknuepfen });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    aktualisiert = await prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({
        where: {
          projectId: task.projectId,
          sourceRepositoryId: repository.id,
          sourceIssue: issue.number,
          id: { not: task.id },
        },
      });
      return tx.task.update({ where: { id: task.id }, data: verknuepfen });
    });
    await refreshDerivedProgress(task.projectId);
  }

  await recordActivity({
    projectId: task.projectId,
    userId: options.userId,
    kind: "TASK_ADDED",
    summary: `Issue #${issue.number} angelegt zu: ${shorten(task.title, 50)}`,
    meta: { taskId: task.id, issue: issue.number, url: issue.url },
  });

  return { ok: true, task: aktualisiert, issue };
}
