import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { ownedProject } from "@/lib/tasks";
import { importIssuesAsTasks } from "@/lib/tasks/issues";
import { asArray, type TicketInfo } from "@/types";
import { formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  /** Leer heisst: alle offenen Issues aus dem Snapshot. */
  numbers: z.array(z.number().int()).max(200).optional(),
  /** Aus welchem Repository. Leer heisst: dem fuehrenden. */
  repositoryId: z.string().optional(),
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
 * wurde. Derselbe Weg laeuft beim Abgleich von selbst, wenn das Projekt
 * autoImportIssues gesetzt hat.
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

  // Die Besitzerbedingung laeuft ueber das Projekt, dessen Besitz eben
  // geprueft wurde – eine fremde Repository-ID trifft hier also nichts.
  const repository = await prisma.repository.findFirst({
    where: { projectId: id, ...(parsed.data.repositoryId ? { id: parsed.data.repositoryId } : {}) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { snapshot: true },
  });

  if (!repository) {
    // 404 nur, wenn nach einem bestimmten gefragt wurde. Wer nichts angibt,
    // hat schlicht noch keines verknuepft – und das ist kein "nicht gefunden".
    return parsed.data.repositoryId
      ? jsonError("Repository nicht gefunden", 404)
      : jsonError("Kein Repository verknuepft. Bitte zuerst eines hinterlegen.", 409);
  }

  const snapshot = repository.snapshot;
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

  const angelegt = await importIssuesAsTasks({
    projectId: id,
    repository,
    issues: auswahl,
    userId: auth.user.id,
  });

  return NextResponse.json({
    created: angelegt.length,
    skipped: auswahl.length - angelegt.length,
    tasks: angelegt,
  });
}
