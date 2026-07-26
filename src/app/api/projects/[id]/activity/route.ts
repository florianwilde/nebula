import { NextResponse } from "next/server";
import { ACTIVITY_LIMIT } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/security/request";
import { ownedProject } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Der Verlauf eines Projekts, neueste Eintraege zuerst. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownedProject(id, auth.user.id))) {
    return jsonError("Projekt nicht gefunden", 404);
  }

  // Number(null) waere 0 und damit endlich – ohne die Pruefung auf den
  // fehlenden Parameter kaeme genau ein Eintrag zurueck.
  const roh = new URL(request.url).searchParams.get("limit");
  const angefragt = roh === null ? Number.NaN : Number(roh);
  const take = Number.isFinite(angefragt)
    ? Math.min(Math.max(angefragt, 1), ACTIVITY_LIMIT)
    : 30;

  const activities = await prisma.activity.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      summary: true,
      createdAt: true,
      user: { select: { username: true, displayName: true } },
    },
  });

  return NextResponse.json({ activities });
}
