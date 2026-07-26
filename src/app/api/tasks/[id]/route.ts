import type { TaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { recordActivity, shorten } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { TASK_STATUS_META, nextPosition, refreshDerivedProgress } from "@/lib/tasks";
import { formatZodError, taskUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Eine Aufgabe gehoert dem, dem das zugehoerige Projekt gehoert. */
async function ownedTask(taskId: string, ownerId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, project: { ownerId } },
    select: { id: true, projectId: true, status: true, title: true },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await ownedTask(id, auth.user.id);
  if (!existing) return jsonError("Aufgabe nicht gefunden", 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = taskUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const update: Record<string, unknown> = {};

  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.labels !== undefined) update.labels = data.labels;
  if (data.dueDate !== undefined) {
    update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }

  if (data.status !== undefined && data.status !== existing.status) {
    update.status = data.status;
    // Beim Spaltenwechsel ans Ende der neuen Spalte.
    update.position = await nextPosition(existing.projectId, data.status);
    // doneAt nur setzen, wenn die Aufgabe wirklich nach DONE wandert.
    update.doneAt = data.status === "DONE" ? new Date() : null;
  }

  const task = await prisma.task.update({ where: { id }, data: update });
  await refreshDerivedProgress(existing.projectId);

  // Nur der Spaltenwechsel kommt in den Verlauf. Ein umbenannter Titel oder
  // ein neues Label sind zu kleinteilig, um die Geschichte des Projekts zu
  // erzaehlen – und beim Ziehen im Brett ist der Wechsel die eigentliche Tat.
  if (update.status !== undefined) {
    const nach = update.status as TaskStatus;
    await recordActivity({
      projectId: existing.projectId,
      userId: auth.user.id,
      kind: "TASK_MOVED",
      summary: `Aufgabe „${shorten(task.title, 50)}“ → ${TASK_STATUS_META[nach].label}`,
      meta: { taskId: id, from: existing.status, to: nach },
    });
  }

  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await ownedTask(id, auth.user.id);
  if (!existing) return jsonError("Aufgabe nicht gefunden", 404);

  await prisma.task.delete({ where: { id } });
  await refreshDerivedProgress(existing.projectId);

  await recordActivity({
    projectId: existing.projectId,
    userId: auth.user.id,
    kind: "TASK_DELETED",
    summary: `Aufgabe gelöscht: ${shorten(existing.title, 50)}`,
  });

  return NextResponse.json({ ok: true });
}
