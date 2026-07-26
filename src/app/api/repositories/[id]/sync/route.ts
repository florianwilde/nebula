import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { connectionSafeSelect } from "@/lib/projects";
import { ownedRepository } from "@/lib/repositories";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, tooManyRequests } from "@/lib/security/request";
import { syncRepository } from "@/lib/sync";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Gleicht ein einzelnes Repository ab. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  // Dieser Endpunkt loest ausgehende Verbindungen aus – hier wird enger
  // begrenzt als bei reinen Datenbankzugriffen.
  const limited = rateLimit(
    `outbound:${auth.user.id}:${clientIp(request)}`,
    LIMITS.outbound.limit,
    LIMITS.outbound.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  if (!(await ownedRepository(id, auth.user.id))) {
    return jsonError("Repository nicht gefunden", 404);
  }

  const result = await syncRepository(id);

  const repository = await prisma.repository.findUnique({
    where: { id },
    include: { connection: { select: connectionSafeSelect }, snapshot: true },
  });

  return NextResponse.json({ ...result, repository }, { status: result.ok ? 200 : 502 });
}
