import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { APP_URL } from "@/lib/config";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { ownedRepository } from "@/lib/repositories";
import { jsonError } from "@/lib/security/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Richtet den Webhook eines Repositories ein oder nimmt ihn zurueck.
 *
 * Das Geheimnis wird hier erzeugt und **genau einmal** im Klartext
 * zurueckgegeben – danach liegt es nur noch verschluesselt in der Datenbank,
 * wie die Zugangstoken. Wer es verliert, erzeugt ein neues; das alte gilt
 * dann nicht mehr.
 *
 * Eingetragen wird der Haken im Git-System von Hand. Ihn ueber die API
 * anzulegen waere machbar, verlangte aber Administrationsrechte am
 * Repository – deutlich mehr, als Nebula sonst braucht.
 */
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const repository = await ownedRepository(id, auth.user.id);
  if (!repository) return jsonError("Repository nicht gefunden", 404);

  // 32 Byte, hexadezimal. Lang genug, dass Raten aussichtslos ist, und
  // ohne Sonderzeichen, die in Formularfeldern Aerger machen.
  const secret = randomBytes(32).toString("hex");

  await prisma.repository.update({
    where: { id: repository.id },
    data: { webhookSecret: encryptSecret(secret), webhookLastAt: null },
  });

  return NextResponse.json({
    secret,
    url: `${APP_URL}/api/webhooks/${repository.id}`,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const repository = await ownedRepository(id, auth.user.id);
  if (!repository) return jsonError("Repository nicht gefunden", 404);

  await prisma.repository.update({
    where: { id: repository.id },
    data: { webhookSecret: null, webhookLastAt: null },
  });

  return NextResponse.json({ ok: true });
}
