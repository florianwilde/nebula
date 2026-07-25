import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatZodError, noteUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const parsed = noteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const note = await prisma.note.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
        ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
      },
    });
    return NextResponse.json({ note });
  } catch {
    return NextResponse.json({ error: "Notiz nicht gefunden" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.note.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Notiz nicht gefunden" }, { status: 404 });
  }
}
