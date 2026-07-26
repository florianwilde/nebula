import { NextResponse } from "next/server";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { describeStatus, recordActivities } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, readJsonBody, tooManyRequests } from "@/lib/security/request";
import { formatZodError, projectBulkSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Dieselbe Aenderung fuer mehrere Projekte auf einmal.
 *
 * Der Weg ueber einen eigenen Endpunkt statt vieler einzelner PATCHes hat
 * zwei Gruende: es ist eine Transaktion statt zwanzig Rundgaengen, und der
 * Verlauf bekommt je Projekt genau einen Eintrag statt eines Schwalls.
 */
export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(
    `mutate:${clientIp(request)}`,
    LIMITS.mutation.limit,
    LIMITS.mutation.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = projectBulkSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { ids, action } = parsed.data;

  // Die Besitzerbedingung steht zuerst: fremde IDs werden hier gar nicht
  // erst eingesammelt und fallen damit still unter den Tisch.
  const owned = await prisma.project.findMany({
    where: { ownerId: auth.user.id, id: { in: ids } },
    select: { id: true, status: true, tags: true, favorite: true, updatedAt: true },
  });

  if (owned.length === 0) {
    return NextResponse.json({ changed: 0, ignored: ids.length });
  }

  const eigene = owned.map((project) => project.id);
  const entries: Parameters<typeof recordActivities>[0] = [];

  if (action === "delete") {
    const result = await prisma.project.deleteMany({
      where: { ownerId: auth.user.id, id: { in: eigene } },
    });
    return NextResponse.json({ changed: result.count, ignored: ids.length - result.count });
  }

  const updates: Prisma.PrismaPromise<unknown>[] = [];

  // Einmal vorab bestimmen und hochzaehlen. Je Projekt neu abzufragen ergaebe
  // immer dieselbe Zahl – die Transaktion ist ja noch nicht geschrieben, und
  // alle Verschobenen landeten uebereinander auf derselben Position.
  let position =
    action === "status" ? await nextPosition(auth.user.id, parsed.data.status!) : 0;

  for (const project of owned) {
    if (action === "status") {
      const ziel = parsed.data.status!;
      if (project.status === ziel) continue;
      updates.push(
        prisma.project.update({
          where: { id: project.id },
          // Ans Ende der Zielspalte, wie beim einzelnen Verschieben auch.
          data: { status: ziel, position: position++ },
        }),
      );
      entries.push({
        projectId: project.id,
        userId: auth.user.id,
        kind: "STATUS_CHANGED",
        summary: describeStatus(project.status, ziel),
        meta: { from: project.status, to: ziel, bulk: true },
      });
      continue;
    }

    if (action === "favorite") {
      const ziel = parsed.data.favorite!;
      if (project.favorite === ziel) continue;
      updates.push(
        prisma.project.update({
          where: { id: project.id },
          // Ein Stern ist keine inhaltliche Aenderung.
          data: { favorite: ziel, updatedAt: project.updatedAt },
        }),
      );
      continue;
    }

    // action === "tags"
    const gewuenscht = parsed.data.tags!.map((tag) => tag.toLowerCase());
    const naechste =
      parsed.data.tagMode === "add"
        ? Array.from(new Set([...project.tags, ...gewuenscht])).slice(0, 12)
        : project.tags.filter((tag) => !gewuenscht.includes(tag));

    if (naechste.length === project.tags.length &&
        naechste.every((tag, index) => tag === project.tags[index])) {
      continue;
    }

    updates.push(
      prisma.project.update({ where: { id: project.id }, data: { tags: naechste } }),
    );
    entries.push({
      projectId: project.id,
      userId: auth.user.id,
      kind: "PROJECT_UPDATED",
      summary: "Tags geändert",
      meta: { tags: naechste, bulk: true },
    });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
    await recordActivities(entries);
  }

  return NextResponse.json({
    changed: updates.length,
    // Nicht geaendert, weil schon so, oder weil die ID nicht dem Konto gehoert.
    ignored: ids.length - updates.length,
  });
}

/** Naechste freie Position am Ende einer Statusspalte. */
async function nextPosition(ownerId: string, status: ProjectStatus) {
  const last = await prisma.project.findFirst({
    where: { ownerId, status },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}
