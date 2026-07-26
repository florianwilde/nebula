import { NextResponse } from "next/server";
import type { Prisma, TaskStatus } from "@prisma/client";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { ownedProject, refreshDerivedProgress } from "@/lib/tasks";
import { formatZodError, taskReorderSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Neue Reihenfolge nach dem Ziehen.
 *
 * Uebergeben wird je betroffener Spalte die vollstaendige Liste der Aufgaben
 * in ihrer neuen Reihenfolge. Daraus ergeben sich Status und Position
 * eindeutig – der Aufruf ist damit wiederholbar, ohne Schaden anzurichten,
 * und ein verlorener Aufruf laesst sich einfach erneut senden.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownedProject(id, auth.user.id))) {
    return jsonError("Projekt nicht gefunden", 404);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = taskReorderSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const columns = parsed.data.columns as Partial<Record<TaskStatus, string[]>>;
  const requestedIds = Object.values(columns).flat();

  // Nur Aufgaben anfassen, die wirklich zu diesem Projekt gehoeren – sonst
  // liessen sich fremde Aufgaben ueber untergeschobene IDs verschieben.
  const owned = await prisma.task.findMany({
    where: { projectId: id, id: { in: requestedIds } },
    select: { id: true, status: true },
  });
  const ownedIds = new Set(owned.map((task) => task.id));
  const previousStatus = new Map(owned.map((task) => [task.id, task.status]));

  const now = new Date();
  const updates: Prisma.PrismaPromise<unknown>[] = [];

  for (const [status, ids] of Object.entries(columns) as Array<[TaskStatus, string[]]>) {
    ids.forEach((taskId, index) => {
      if (!ownedIds.has(taskId)) return;
      const before = previousStatus.get(taskId);
      updates.push(
        prisma.task.update({
          where: { id: taskId },
          data: {
            status,
            position: index,
            // doneAt nur beim tatsaechlichen Wechsel setzen oder loeschen,
            // damit ein Umsortieren innerhalb von "Erledigt" das Datum nicht
            // immer wieder erneuert.
            ...(before !== status
              ? { doneAt: status === "DONE" ? now : null }
              : {}),
          },
        }),
      );
    });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
    await refreshDerivedProgress(id);
  }

  const tasks = await prisma.task.findMany({
    where: { projectId: id },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });

  return NextResponse.json({
    tasks,
    updated: updates.length,
    ignored: requestedIds.length - updates.length,
  });
}
