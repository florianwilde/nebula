import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { projectDetailInclude } from "@/lib/projects";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, tooManyRequests } from "@/lib/security/request";
import { syncProject } from "@/lib/sync";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Holt Branches, Tags, Commits und Releases beim Git-System ab. */
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

  const owned = await prisma.project.findFirst({
    where: { id, ownerId: auth.user.id },
    select: { id: true },
  });
  if (!owned) return jsonError("Projekt nicht gefunden", 404);

  const result = await syncProject(id);

  const project = await prisma.project.findFirst({
    where: { id, ownerId: auth.user.id },
    include: projectDetailInclude,
  });

  return NextResponse.json({ ...result, project }, { status: result.ok ? 200 : 502 });
}
