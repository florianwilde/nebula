import { NextResponse } from "next/server";
import { encryptSecret, tokenHint } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { normalizeBaseUrl } from "@/lib/git/http";
import { connectionSafeSelect } from "@/lib/projects";
import { connectionUpdateSchema, formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const safeSelect = {
  ...connectionSafeSelect,
  _count: { select: { projects: true } },
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const parsed = connectionUpdateSchema.safeParse(body);
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
  if (data.baseUrl !== undefined) update.baseUrl = normalizeBaseUrl(data.baseUrl);
  if (data.username !== undefined) update.username = data.username;

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

  try {
    const connection = await prisma.gitConnection.update({
      where: { id },
      data: update,
      select: safeSelect,
    });
    return NextResponse.json({ connection });
  } catch {
    return NextResponse.json({ error: "Verbindung nicht gefunden oder Name vergeben" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    // Projekte bleiben erhalten, connectionId wird per onDelete: SetNull geleert.
    await prisma.gitConnection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Verbindung nicht gefunden" }, { status: 404 });
  }
}
