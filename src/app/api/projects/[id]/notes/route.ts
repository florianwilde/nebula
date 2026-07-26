import { NextResponse } from "next/server";
import { recordActivity, shorten } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { formatZodError, noteCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Prueft in einem Zug Existenz und Besitz des Projekts. */
async function ownedProject(projectId: string, ownerId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true },
  });
}

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownedProject(id, auth.user.id))) {
    return jsonError("Projekt nicht gefunden", 404);
  }

  const notes = await prisma.note.findMany({
    where: { projectId: id },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ notes });
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

  const parsed = noteCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const note = await prisma.note.create({
    data: {
      projectId: id,
      title: parsed.data.title ?? null,
      content: parsed.data.content,
      pinned: parsed.data.pinned,
    },
  });

  // Projekt "anfassen", damit die Sortierung nach Aktivitaet stimmt.
  await prisma.project.update({ where: { id }, data: { updatedAt: new Date() } });

  await recordActivity({
    projectId: id,
    userId: auth.user.id,
    kind: "NOTE_ADDED",
    summary: `Notiz angelegt: ${shorten(note.title || note.content)}`,
    meta: { noteId: note.id },
  });

  return NextResponse.json({ note }, { status: 201 });
}
