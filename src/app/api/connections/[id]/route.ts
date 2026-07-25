import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { encryptSecret, tokenHint } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { normalizeBaseUrl } from "@/lib/git/http";
import { connectionSafeSelect } from "@/lib/projects";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { BlockedHostError, assertAllowedUrl } from "@/lib/security/ssrf";
import { connectionUpdateSchema, formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const safeSelect = {
  ...connectionSafeSelect,
  _count: { select: { projects: true } },
};

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const existing = await prisma.gitConnection.findFirst({
    where: { id, ownerId: auth.user.id },
    select: { id: true },
  });
  if (!existing) return jsonError("Verbindung nicht gefunden", 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = connectionUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.provider !== undefined) update.provider = data.provider;
  if (data.username !== undefined) update.username = data.username;

  if (data.baseUrl !== undefined) {
    const normalized = normalizeBaseUrl(data.baseUrl);
    try {
      await assertAllowedUrl(normalized);
    } catch (error) {
      if (error instanceof BlockedHostError) {
        return NextResponse.json(
          { error: error.message, fields: { baseUrl: error.message } },
          { status: 422 },
        );
      }
      throw error;
    }
    update.baseUrl = normalized;
  }

  // token === null  -> Token entfernen
  // token === ""    -> vom Schema zu null normalisiert
  // token undefined -> unveraendert lassen
  if (data.token !== undefined) {
    if (data.token) {
      update.tokenCipher = encryptSecret(data.token);
      update.tokenHint = tokenHint(data.token);
    } else {
      update.tokenCipher = null;
      update.tokenHint = null;
    }
  }

  if (data.name !== undefined) {
    const duplicate = await prisma.gitConnection.findFirst({
      where: { name: data.name, ownerId: auth.user.id, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Name bereits vergeben.", fields: { name: "Name bereits vergeben" } },
        { status: 409 },
      );
    }
  }

  const connection = await prisma.gitConnection.update({
    where: { id },
    data: update,
    select: safeSelect,
  });
  return NextResponse.json({ connection });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Projekte bleiben erhalten, connectionId wird per onDelete: SetNull geleert.
  const result = await prisma.gitConnection.deleteMany({
    where: { id, ownerId: auth.user.id },
  });
  if (result.count === 0) return jsonError("Verbindung nicht gefunden", 404);

  return NextResponse.json({ ok: true });
}
