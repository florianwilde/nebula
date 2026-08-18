import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import {
  SEITEN_ORDNUNG,
  cursorAus,
  seitenBedingung,
  seitenGroesse,
} from "@/lib/timeline";

export const dynamic = "force-dynamic";

/**
 * Der Verlauf ueber alle Projekte, neueste Eintraege zuerst.
 *
 * Geblaettert wird per Cursor (`vor` = Zeitpunkt, `id` = Eintrag), nicht per
 * Offset – siehe lib/timeline. Zurueck kommt der Cursor fuer die naechste
 * Seite gleich mit, damit der Aufrufer ihn nicht selbst zusammensetzen muss.
 */
export async function GET(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const cursor = cursorAus(params.get("vor"), params.get("id"));
  const take = seitenGroesse(params.get("limit"));

  /**
   * Einen mehr holen als angefragt: daran laesst sich ablesen, ob es
   * weitergeht, ohne dafuer zaehlen zu muessen.
   */
  const gefunden = await prisma.activity.findMany({
    where: seitenBedingung(auth.user.id, cursor),
    orderBy: SEITEN_ORDNUNG,
    take: take + 1,
    select: {
      id: true,
      kind: true,
      summary: true,
      createdAt: true,
      project: { select: { id: true, name: true, accent: true } },
      user: { select: { username: true, displayName: true } },
    },
  });

  const weitere = gefunden.length > take;
  const activities = weitere ? gefunden.slice(0, take) : gefunden;
  const letzter = activities[activities.length - 1];

  return NextResponse.json({
    activities: activities.map((eintrag) => ({
      ...eintrag,
      createdAt: eintrag.createdAt.toISOString(),
    })),
    weitere,
    naechster: weitere && letzter ? { vor: letzter.createdAt.toISOString(), id: letzter.id } : null,
  });
}
