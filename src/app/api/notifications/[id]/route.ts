import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { encryptSecret, tokenHint } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { BlockedHostError, assertAllowedUrl } from "@/lib/security/ssrf";
import { targetSafeSelect } from "@/lib/notify/types";
import { formatZodError, notificationTargetUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await prisma.notificationTarget.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!existing) return jsonError("Ziel nicht gefunden", 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = notificationTargetUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const update: Record<string, unknown> = {};

  if (data.name !== undefined) update.name = data.name;
  if (data.events !== undefined) update.events = data.events;
  if (data.isActive !== undefined) update.isActive = data.isActive;

  if (data.target !== undefined) {
    if (existing.channel !== "EMAIL") {
      try {
        await assertAllowedUrl(data.target);
      } catch (error) {
        if (error instanceof BlockedHostError) {
          return NextResponse.json(
            { error: error.message, fields: { target: error.message } },
            { status: 422 },
          );
        }
        throw error;
      }
    }
    update.target = data.target;
  }

  // Leeres Feld heisst "unveraendert", null heisst "entfernen".
  if (data.secret !== undefined) {
    if (data.secret) {
      update.secretCipher = encryptSecret(data.secret);
      update.secretHint = tokenHint(data.secret);
    } else {
      update.secretCipher = null;
      update.secretHint = null;
    }
  }

  try {
    const target = await prisma.notificationTarget.update({
      where: { id },
      data: update,
      select: targetSafeSelect,
    });
    return NextResponse.json({ target });
  } catch {
    return jsonError("Name bereits vergeben.", 409);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await prisma.notificationTarget.deleteMany({
    where: { id, userId: auth.user.id },
  });
  if (result.count === 0) return jsonError("Ziel nicht gefunden", 404);

  return NextResponse.json({ ok: true });
}
