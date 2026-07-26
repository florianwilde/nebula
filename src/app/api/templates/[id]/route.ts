import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { formatZodError, templateUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.projectTemplate.findFirst({
    where: { id, ownerId: auth.user.id },
    select: { id: true },
  });
  if (!existing) return jsonError("Vorlage nicht gefunden", 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = templateUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const data = parsed.data;

  if (data.name) {
    const doppelt = await prisma.projectTemplate.findFirst({
      where: { ownerId: auth.user.id, name: data.name, id: { not: id } },
      select: { id: true },
    });
    if (doppelt) return jsonError(`Eine Vorlage „${data.name}“ gibt es bereits.`, 409);
  }

  const template = await prisma.projectTemplate.update({ where: { id }, data });
  return NextResponse.json({ template });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // deleteMany mit Besitzerbedingung: trifft fremde Vorlagen gar nicht erst.
  const result = await prisma.projectTemplate.deleteMany({
    where: { id, ownerId: auth.user.id },
  });
  if (result.count === 0) return jsonError("Vorlage nicht gefunden", 404);

  return NextResponse.json({ ok: true });
}
