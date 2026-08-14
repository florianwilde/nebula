import type { Metadata } from "next";
import { TaskOverview } from "@/components/tasks/TaskOverview";
import { requireUserPage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { dueBucket } from "@/lib/tasks";
import type { TaskOverviewItem } from "@/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Aufgaben" };

export default async function TasksPage() {
  const user = await requireUserPage();

  /**
   * Die Aufgabe kennt keinen Besitzer – die Trennung laeuft ueber das
   * Projekt. Die Bedingung steht deshalb als einzige und erste in der
   * where-Klausel; eine fremde Aufgabe kann hier gar nicht auftauchen.
   */
  const tasks = await prisma.task.findMany({
    where: { project: { ownerId: user.id } },
    include: {
      project: { select: { id: true, name: true, accent: true, status: true } },
    },
    // NULL-Termine sortiert Postgres bei ASC ans Ende – genau richtig,
    // Aufgaben ohne Termin gehoeren nicht nach oben.
    orderBy: [{ dueDate: "asc" }, { position: "asc" }],
  });

  /**
   * Das Fach wird auf dem Server bestimmt, nicht im Browser. "Heute" haengt
   * an der Uhr, und zwei verschiedene Antworten zwischen Server-Render und
   * Hydration waeren genau der Fehler, den die feste Zeitzone in lib/utils
   * sonst vermeidet.
   */
  const jetzt = new Date();
  const items: TaskOverviewItem[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    labels: task.labels,
    recurrence: task.recurrence,
    sourceIssue: task.sourceIssue,
    sourceUrl: task.sourceUrl,
    bucket: dueBucket(task.dueDate, jetzt),
    project: task.project,
  }));

  return <TaskOverview tasks={items} />;
}
