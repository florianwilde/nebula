import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { nextPosition, ownedProject, refreshDerivedProgress } from "@/lib/tasks";
import { asArray, type TicketInfo } from "@/types";
import { formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  /** Leer heisst: alle offenen Issues aus dem Snapshot. */
  numbers: z.array(z.number().int()).max(200).optional(),
});

/**
 * Uebernimmt offene Issues des verknuepften Repositories als Aufgaben.
 *
 * Grundlage ist der zuletzt geholte Snapshot – hier wird nichts nachgeladen,
 * damit ein Klick nicht ungefragt fremde APIs anspricht. Wer den neuesten
 * Stand will, gleicht vorher ab.
 *
 * Bereits uebernommene Issues werden uebersprungen: die Nummer steht an der
 * Aufgabe und ist je Projekt eindeutig. Ein zweiter Aufruf legt also keine
 * Dubletten an, auch wenn die Aufgabe inzwischen verschoben oder umbenannt
 * wurde.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownedProject(id, auth.user.id))) {
    return jsonError("Projekt nicht gefunden", 404);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.data ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const snapshot = await prisma.repoSnapshot.findUnique({ where: { projectId: id } });
  if (!snapshot) {
    return jsonError(
      "Noch kein Repo-Stand vorhanden. Bitte zuerst synchronisieren.",
      409,
    );
  }

  const alle = asArray<TicketInfo>(snapshot.issues);
  const gewuenscht = parsed.data.numbers;
  const auswahl = gewuenscht?.length
    ? alle.filter((issue) => gewuenscht.includes(issue.number))
    : alle;

  if (auswahl.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, tasks: [] });
  }

  const vorhanden = await prisma.task.findMany({
    where: { projectId: id, sourceIssue: { in: auswahl.map((issue) => issue.number) } },
    select: { sourceIssue: true },
  });
  const bekannt = new Set(vorhanden.map((task) => task.sourceIssue));

  const neu = auswahl.filter((issue) => !bekannt.has(issue.number));
  let position = await nextPosition(id, "TODO");

  const angelegt = [];
  for (const issue of neu) {
    angelegt.push(
      await prisma.task.create({
        data: {
          projectId: id,
          title: issue.title.slice(0, 200),
          // Der Link ist das Wichtigste – der Text steht im Git-System.
          description: issue.url ? `[Issue #${issue.number}](${issue.url})` : null,
          status: "TODO",
          position: position++,
          labels: issue.labels.slice(0, 8),
          sourceIssue: issue.number,
          sourceUrl: issue.url,
        },
      }),
    );
  }

  if (angelegt.length > 0) {
    await refreshDerivedProgress(id);
    await prisma.project.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  return NextResponse.json({
    created: angelegt.length,
    skipped: auswahl.length - angelegt.length,
    tasks: angelegt,
  });
}
