import { NextResponse } from "next/server";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { describeStatus, recordActivities } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/security/request";
import { formatZodError, projectReorderSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Neue Reihenfolge im Brett nach dem Ziehen.
 *
 * Wie beim Aufgabenbrett wird je betroffener Spalte die vollstaendige Liste
 * uebergeben. Status und Position ergeben sich daraus eindeutig; ein
 * verlorener Aufruf laesst sich einfach erneut senden, ohne Schaden
 * anzurichten.
 */
export async function PATCH(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = projectReorderSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const columns = parsed.data.columns as Partial<Record<ProjectStatus, string[]>>;
  const requestedIds = Object.values(columns).flat();

  // Nur eigene Projekte anfassen – sonst liessen sich fremde ueber
  // untergeschobene IDs verschieben.
  const owned = await prisma.project.findMany({
    where: { ownerId: auth.user.id, id: { in: requestedIds } },
    select: { id: true, status: true, updatedAt: true },
  });
  const ownedIds = new Set(owned.map((project) => project.id));
  const vorher = new Map(owned.map((project) => [project.id, project]));

  const updates: Prisma.PrismaPromise<unknown>[] = [];
  const entries: Parameters<typeof recordActivities>[0] = [];

  for (const [status, ids] of Object.entries(columns) as Array<[ProjectStatus, string[]]>) {
    ids.forEach((projectId, index) => {
      const before = vorher.get(projectId);
      if (!ownedIds.has(projectId) || !before) return;

      const gewandert = before.status !== status;

      updates.push(
        prisma.project.update({
          where: { id: projectId },
          data: {
            status,
            position: index,
            // Beim reinen Umsortieren das Aenderungsdatum festhalten. Sonst
            // schoebe ein Aufraeumen im Brett saemtliche Projekte in der
            // Sortierung "Zuletzt geaendert" nach oben – das Brett wuerde die
            // Liste umsortieren, ohne dass sich inhaltlich etwas geaendert hat.
            ...(gewandert ? {} : { updatedAt: before.updatedAt }),
          },
        }),
      );

      // Ein Statuswechsel gehoert in den Verlauf, ein blosses Umsortieren
      // nicht – sonst besteht er bald nur noch aus Rangaenderungen.
      if (gewandert) {
        entries.push({
          projectId,
          userId: auth.user.id,
          kind: "STATUS_CHANGED",
          summary: describeStatus(before.status, status),
          meta: { from: before.status, to: status },
        });
      }
    });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
    await recordActivities(entries);
  }

  return NextResponse.json({
    updated: updates.length,
    ignored: requestedIds.length - updates.length,
  });
}
