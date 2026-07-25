import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { formatZodError, passkeyNameSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Umbenennen – nur der eigene Passkey. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = passkeyNameSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  // Der Besitzvergleich steht in der where-Klausel, damit fremde Passkeys
  // gar nicht erst getroffen werden.
  const result = await prisma.credential.updateMany({
    where: { id, userId: auth.user.id },
    data: { name: parsed.data.name ?? null },
  });

  if (result.count === 0) return jsonError("Passkey nicht gefunden.", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { passwordHash: true, _count: { select: { credentials: true } } },
  });
  if (!user) return jsonError("Konto nicht gefunden.", 404);

  // Nicht das letzte Anmeldemittel entfernen.
  if (!user.passwordHash && user._count.credentials <= 1) {
    return jsonError(
      "Das ist der letzte Passkey und es ist kein Passwort gesetzt. " +
        "Bitte zuerst ein Passwort vergeben.",
      409,
    );
  }

  const result = await prisma.credential.deleteMany({ where: { id, userId: auth.user.id } });
  if (result.count === 0) return jsonError("Passkey nicht gefunden.", 404);

  return NextResponse.json({ ok: true });
}
