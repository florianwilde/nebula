import type { TaskStatus } from "@prisma/client";
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
