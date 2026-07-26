import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { nextPosition, ownedProject, refreshDerivedProgress } from "@/lib/tasks";
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
  if (!(await ownedProject(id, auth.user.id))) {
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

  const { title, description, status, dueDate, labels } = parsed.data;

  const task = await prisma.task.create({
    data: {
      projectId: id,
      title,
      description: description ?? null,
      status,
      // Neue Aufgaben landen unten in ihrer Spalte.
      position: await nextPosition(id, status),
      dueDate: dueDate ? new Date(dueDate) : null,
      labels,
      doneAt: status === "DONE" ? new Date() : null,
    },
  });

  await refreshDerivedProgress(id);
  // Damit die Sortierung nach Aktivitaet stimmt.
  await prisma.project.update({ where: { id }, data: { updatedAt: new Date() } });

  return NextResponse.json({ task }, { status: 201 });
}
