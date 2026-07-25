import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { formatZodError, noteUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Eine Notiz gehoert dem, dem das zugehoerige Projekt gehoert. */
async function ownedNote(noteId: string, ownerId: string) {
  return prisma.note.findFirst({
    where: { id: noteId, project: { ownerId } },
    select: { id: true, projectId: true },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const note = await ownedNote(id, auth.user.id);
  if (!note) return jsonError("Notiz nicht gefunden", 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = noteUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const updated = await prisma.note.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
      ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
    },
  });

  return NextResponse.json({ note: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const result = await prisma.note.deleteMany({
    where: { id, project: { ownerId: auth.user.id } },
  });
  if (result.count === 0) return jsonError("Notiz nicht gefunden", 404);

  return NextResponse.json({ ok: true });
}
