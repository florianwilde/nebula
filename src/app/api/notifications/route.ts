import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { encryptSecret, tokenHint } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/security/request";
import { targetSafeSelect } from "@/lib/notify/types";
import { BlockedHostError, assertAllowedUrl } from "@/lib/security/ssrf";
import { formatZodError, notificationTargetCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const targets = await prisma.notificationTarget.findMany({
    where: { userId: auth.user.id },
    select: targetSafeSelect,
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ targets });
}

export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = notificationTargetCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { name, channel, target, secret, events, isActive } = parsed.data;

  // Webhook und ntfy ruft der Server spaeter selbst auf – gleiche Pruefung
  // wie bei den Git-Verbindungen.
  if (channel !== "EMAIL") {
    try {
      await assertAllowedUrl(target);
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

  const duplicate = await prisma.notificationTarget.findFirst({
    where: { userId: auth.user.id, name },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "Name bereits vergeben.", fields: { name: "Name bereits vergeben" } },
      { status: 409 },
    );
  }

  const created = await prisma.notificationTarget.create({
    data: {
      userId: auth.user.id,
      name,
      channel,
      target,
      secretCipher: secret ? encryptSecret(secret) : null,
      secretHint: secret ? tokenHint(secret) : null,
      events,
      isActive,
    },
    select: targetSafeSelect,
  });

  return NextResponse.json({ target: created }, { status: 201 });
}
