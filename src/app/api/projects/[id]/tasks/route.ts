import { NextResponse } from "next/server";
import { recordActivity, shorten } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { nextPosition, ownedProject, refreshDerivedProgress } from "@/lib/tasks";
import { createIssueForTask } from "@/lib/tasks/issues";
import { formatZodError, taskCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownedProject(id, auth.user.id))) {
    return jsonError("Projekt nicht gefunden", 404);
  }

  const tasks = await prisma.task.findMany({
    where: { projectId: id },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
  return NextResponse.json({ tasks });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { ownerId: auth.user.id, id },
    select: { id: true, autoCreateIssues: true },
  });
  if (!project) {
    return jsonError("Projekt nicht gefunden", 404);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = taskCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { title, description, status, dueDate, labels, recurrence } = parsed.data;

  let task = await prisma.task.create({
    data: {
      projectId: id,
      title,
      description: description ?? null,
      status,
      // Neue Aufgaben landen unten in ihrer Spalte.
      position: await nextPosition(id, status),
      dueDate: dueDate ? new Date(dueDate) : null,
      labels,
      recurrence: recurrence ?? null,
      doneAt: status === "DONE" ? new Date() : null,
    },
  });

  await refreshDerivedProgress(id);
  // Damit die Sortierung nach Aktivitaet stimmt.
  await prisma.project.update({ where: { id }, data: { updatedAt: new Date() } });

  await recordActivity({
    projectId: id,
    userId: auth.user.id,
    kind: "TASK_ADDED",
    summary: `Aufgabe angelegt: ${shorten(task.title, 50)}`,
    meta: { taskId: task.id },
  });

  /**
   * Will das Projekt jede neue Aufgabe auch im Git-System haben, entsteht
   * das Issue gleich mit. Eine erledigt angelegte Aufgabe bekommt keines –
   * ein Issue, das sofort wieder zugeht, will niemand lesen.
   *
   * Scheitert das, bleibt die Aufgabe trotzdem stehen: ein nicht
   * erreichbares Git-System darf das Erfassen nicht verhindern. Der Knopf
   * im Dialog holt es nach, und der Verlauf haelt fest, warum es fehlt.
   */
  let issueError: string | undefined;
  if (project.autoCreateIssues && task.status !== "DONE") {
    const result = await createIssueForTask(task.id, { userId: auth.user.id });
    if (result.ok) {
      task = result.task;
    } else {
      issueError = result.error;
      await recordActivity({
        projectId: id,
        userId: auth.user.id,
        kind: "TASK_ADDED",
        summary: `Kein Issue zu „${shorten(task.title, 40)}“: ${shorten(result.error, 80)}`,
        meta: { taskId: task.id, issueError: result.error },
      });
    }
  }

  return NextResponse.json({ task, ...(issueError ? { issueError } : {}) }, { status: 201 });
}
