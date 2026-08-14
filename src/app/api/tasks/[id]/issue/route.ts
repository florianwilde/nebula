import { NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity, shorten } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { APP_URL } from "@/lib/config";
import { prisma } from "@/lib/db";
import { GitApiError, clientForConnection } from "@/lib/git";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { formatZodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  /** Aus welchem Repository. Leer heisst: dem fuehrenden. */
  repositoryId: z.string().optional(),
});

/**
 * Legt zu einer Aufgabe ein Issue im verknuepften Repository an.
 *
 * Der einzige Weg, auf dem Nebula von sich aus etwas in ein fremdes System
 * schreibt – deshalb ausdruecklich angestossen und nie nebenbei. Umgekehrt
 * gibt es die Uebernahme von Issues als Aufgaben schon laenger
 * (tasks/from-issues); die Felder sourceIssue, sourceUrl und
 * sourceRepositoryId sind dieselben, und die Eindeutigkeit je Repository
 * verhindert, dass beide Wege dasselbe doppelt anlegen.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Besitz haengt am Projekt – die Aufgabe selbst kennt keinen Besitzer.
  const task = await prisma.task.findFirst({
    where: { id, project: { ownerId: auth.user.id } },
    select: {
      id: true,
      title: true,
      description: true,
      projectId: true,
      sourceIssue: true,
      sourceUrl: true,
      project: { select: { name: true } },
    },
  });
  if (!task) return jsonError("Aufgabe nicht gefunden", 404);

  // Schon verknuepft: nicht noch einmal anlegen. Ein zweites Issue zur
  // selben Aufgabe waere genau die Dublette, die from-issues vermeidet.
  if (task.sourceIssue !== null) {
    return NextResponse.json(
      {
        error: "Diese Aufgabe haengt bereits an einem Issue.",
        issue: { number: task.sourceIssue, url: task.sourceUrl },
      },
      { status: 409 },
    );
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
    where: {
      projectId: task.projectId,
      ...(parsed.data.repositoryId ? { id: parsed.data.repositoryId } : {}),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { connection: true },
  });

  if (!repository) {
    return jsonError("Das Projekt hat kein verknuepftes Repository.", 422);
  }
  if (!repository.connection) {
    return jsonError(
      "Das Repository haengt an keiner Git-Verbindung – ohne Token laesst sich nichts anlegen.",
      422,
    );
  }
  if (!repository.repoOwner || !repository.repoName) {
    return jsonError("Am Repository fehlen Owner oder Name.", 422);
  }

  const client = clientForConnection(repository.connection);

  // Rueckverweis in den Rumpf: wer das Issue im Git-System liest, soll
  // wissen, wo es herkommt und wo der Rest der Notizen liegt.
  const rumpf = [
    task.description?.trim() || null,
    `_Angelegt aus [${task.project.name}](${APP_URL}/projects/${task.projectId}) in Nebula._`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const issue = await client.createIssue(
      { owner: repository.repoOwner, name: repository.repoName },
      { title: task.title, body: rumpf },
    );

    const aktualisiert = await prisma.task.update({
      where: { id: task.id },
      data: {
        sourceIssue: issue.number,
        sourceUrl: issue.url,
        sourceRepositoryId: repository.id,
      },
    });

    await recordActivity({
      projectId: task.projectId,
      userId: auth.user.id,
      kind: "TASK_ADDED",
      summary: `Issue #${issue.number} angelegt zu: ${shorten(task.title, 50)}`,
      meta: { taskId: task.id, issue: issue.number, url: issue.url },
    });

    return NextResponse.json({ task: aktualisiert, issue }, { status: 201 });
  } catch (error) {
    // Der Aufruf ging nach draussen; die Meldung des Git-Systems ist
    // hilfreicher als ein pauschales "hat nicht geklappt".
    if (error instanceof GitApiError) {
      return jsonError(`Issue konnte nicht angelegt werden: ${error.message}`, 502);
    }
    return jsonError("Issue konnte nicht angelegt werden.", 502);
  }
}
