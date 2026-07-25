import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatZodError, noteCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const notes = await prisma.note.findMany({
    where: { projectId: id },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ notes });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const parsed = noteCreateSchema.safeParse(body);
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

  return NextResponse.json({ note }, { status: 201 });
}
