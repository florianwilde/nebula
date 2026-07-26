import type { Recurrence, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Spaltenreihenfolge des Aufgabenbretts. */
export const TASK_STATUS_ORDER: TaskStatus[] = ["TODO", "DOING", "BLOCKED", "DONE"];

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; color: string; className: string }
> = {
  TODO: {
    label: "Offen",
    color: "#94a3b8",
    className: "bg-slate-500/12 text-slate-300 ring-slate-400/25",
  },
  DOING: {
    label: "In Arbeit",
    color: "#a78bfa",
    className: "bg-violet-500/12 text-violet-200 ring-violet-400/30",
  },
  BLOCKED: {
    label: "Blockiert",
    color: "#fb7185",
    className: "bg-rose-500/12 text-rose-200 ring-rose-400/30",
  },
  DONE: {
    label: "Erledigt",
    color: "#34d399",
    className: "bg-emerald-500/12 text-emerald-200 ring-emerald-400/30",
  },
};

/**
 * Berechnet den Fortschritt aus dem Verhaeltnis erledigter Aufgaben.
 * Ohne Aufgaben gibt es nichts zu berechnen – dann bleibt der Wert, wie er ist.
 */
export function progressFromTasks(total: number, done: number): number | null {
  if (total <= 0) return null;
  return Math.round((done / total) * 100);
}

/**
 * Schreibt den abgeleiteten Fortschritt, falls das Projekt es so eingestellt
 * hat. Wird nach jeder Aenderung an Aufgaben aufgerufen.
 */
export async function refreshDerivedProgress(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { progressFromTasks: true },
  });
  if (!project?.progressFromTasks) return;

  const [total, done] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: "DONE" } }),
  ]);

  const value = progressFromTasks(total, done);
  if (value === null) return;

  await prisma.project.update({
    where: { id: projectId },
    data: { progress: value },
  });
}

// ── Wiederkehrende Aufgaben ──────────────────────────────────

export const RECURRENCE_META: Record<Recurrence, { label: string; short: string }> = {
  DAILY: { label: "Täglich", short: "1 T" },
  WEEKLY: { label: "Wöchentlich", short: "1 W" },
  BIWEEKLY: { label: "Alle zwei Wochen", short: "2 W" },
  MONTHLY: { label: "Monatlich", short: "1 M" },
};

/** Einen Termin um ein Intervall weiterschieben. */
function addInterval(from: Date, recurrence: Recurrence): Date {
  const next = new Date(from);
  switch (recurrence) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
    case "MONTHLY": {
      // setMonth rollt ueber: der 31. Januar wuerde zum 3. Maerz. Bei einem
      // kuerzeren Folgemonat gehoert der Termin auf dessen letzten Tag.
      const tag = next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      const letzterTag = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(tag, letzterTag));
      break;
    }
  }
  return next;
}

/**
 * Wann die naechste Fassung faellig ist.
 *
 * Gerechnet wird vom bisherigen Termin, nicht vom Zeitpunkt des Abhakens:
 * eine woechentliche Aufgabe soll auf ihrem Montag bleiben, auch wenn sie
 * einmal erst am Mittwoch erledigt wurde.
 *
 * Wurde sie lange liegengelassen, laege der naechste Termin allerdings
 * immer noch in der Vergangenheit – dann wird so lange weitergeschoben, bis
 * er in der Zukunft liegt. Sonst entstuende eine Aufgabe, die schon bei
 * ihrer Entstehung ueberfaellig ist.
 *
 * Ohne bisherigen Termin zaehlt der Zeitpunkt des Abhakens.
 */
export function nextDueDate(
  recurrence: Recurrence,
  previousDue: Date | null,
  completedAt: Date = new Date(),
): Date {
  if (!previousDue) return addInterval(completedAt, recurrence);

  let next = addInterval(previousDue, recurrence);
  // Deckel gegen eine Endlosschleife bei absurden Datumsangaben.
  for (let schritt = 0; schritt < 500 && next <= completedAt; schritt += 1) {
    next = addInterval(next, recurrence);
  }
  return next;
}

/**
 * Legt die naechste Fassung einer wiederkehrenden Aufgabe an.
 *
 * Wird genau beim Uebergang nach ERLEDIGT aufgerufen – aus dem Dialog wie
 * aus dem Ziehen im Brett. Ein erneutes Speichern einer bereits erledigten
 * Aufgabe darf keine zweite Fassung erzeugen.
 *
 * Gibt die neue Aufgabe zurueck oder null, wenn nichts zu tun war.
 */
export async function spawnRecurrence(taskId: string) {
  const erledigt = await prisma.task.findUnique({ where: { id: taskId } });
  if (!erledigt?.recurrence) return null;

  const faellig = nextDueDate(erledigt.recurrence, erledigt.dueDate, erledigt.doneAt ?? new Date());

  return prisma.task.create({
    data: {
      projectId: erledigt.projectId,
      title: erledigt.title,
      description: erledigt.description,
      status: "TODO",
      position: await nextPosition(erledigt.projectId, "TODO"),
      dueDate: faellig,
      labels: erledigt.labels,
      recurrence: erledigt.recurrence,
      recurredFrom: erledigt.id,
      // Die Herkunft aus einem Issue wandert nicht mit: das Issue ist
      // abgearbeitet, und die Eindeutigkeit je Repository verboete es ohnehin.
    },
  });
}

/** Naechste freie Position am Ende einer Spalte. */
export async function nextPosition(
  projectId: string,
  status: TaskStatus,
): Promise<number> {
  const last = await prisma.task.findFirst({
    where: { projectId, status },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

/** Prueft Existenz und Besitz in einem Zug. */
export async function ownedProject(projectId: string, ownerId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true },
  });
}
