import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { deliver } from "@/lib/notify/channels";
import { testMessage } from "@/lib/notify";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, tooManyRequests } from "@/lib/security/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Schickt eine Testnachricht an genau dieses Ziel. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  // Loest einen ausgehenden Aufruf aus – entsprechend begrenzt.
  const limited = rateLimit(
    `notify-test:${auth.user.id}:${clientIp(request)}`,
    LIMITS.outbound.limit,
    LIMITS.outbound.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const target = await prisma.notificationTarget.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!target) return jsonError("Ziel nicht gefunden", 404);

  const result = await deliver(target, testMessage());

  await prisma.notificationTarget.update({
    where: { id },
    data: { lastSentAt: new Date(), lastOk: result.ok, lastMessage: result.message },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
