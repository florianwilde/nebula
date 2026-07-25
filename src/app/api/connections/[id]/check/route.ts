import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { clientForConnection } from "@/lib/git";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, tooManyRequests } from "@/lib/security/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Testet Erreichbarkeit und Token einer Verbindung und merkt sich das Ergebnis. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(
    `outbound:${auth.user.id}:${clientIp(request)}`,
    LIMITS.outbound.limit,
    LIMITS.outbound.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;

  const connection = await prisma.gitConnection.findFirst({
    where: { id, ownerId: auth.user.id },
  });
  if (!connection) return jsonError("Verbindung nicht gefunden", 404);

  const result = await clientForConnection(connection).check();

  await prisma.gitConnection.update({
    where: { id },
    data: {
      lastCheckedAt: new Date(),
      lastCheckOk: result.ok,
      lastCheckMessage: result.message,
      username: result.user ?? connection.username,
    },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
