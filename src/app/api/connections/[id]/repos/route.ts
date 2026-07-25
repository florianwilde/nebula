import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { clientForConnection } from "@/lib/git";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, tooManyRequests } from "@/lib/security/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Listet Repositories, auf die der hinterlegte Token Zugriff hat. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(
    `outbound:${auth.user.id}:${clientIp(request)}`,
    LIMITS.outbound.limit,
    LIMITS.outbound.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { id } = await params;
  const query = new URL(request.url).searchParams.get("q") ?? undefined;

  const connection = await prisma.gitConnection.findFirst({
    where: { id, ownerId: auth.user.id },
  });
  if (!connection) return jsonError("Verbindung nicht gefunden", 404);

  try {
    const repos = await clientForConnection(connection).listRepos(query);
    return NextResponse.json({ repos });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
