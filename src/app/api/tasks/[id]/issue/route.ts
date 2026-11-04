import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { createIssueForTask } from "@/lib/tasks/issues";
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
 * Ausdruecklich angestossen per Knopf. Dasselbe passiert beim Anlegen einer
 * Aufgabe von selbst, wenn das Projekt es so eingestellt hat – beide Wege
 * laufen ueber createIssueForTask. Umgekehrt gibt es die Uebernahme von
 * Issues als Aufgaben (tasks/from-issues); die Felder sourceIssue, sourceUrl
 * und sourceRepositoryId sind dieselben, und die Eindeutigkeit je Repository
 * verhindert, dass beide Wege dasselbe doppelt anlegen.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Besitz haengt am Projekt – die Aufgabe selbst kennt keinen Besitzer.
  const owned = await prisma.task.findFirst({
    where: { id, project: { ownerId: auth.user.id } },
    select: { id: true },
  });
  if (!owned) return jsonError("Aufgabe nicht gefunden", 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.data ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const result = await createIssueForTask(owned.id, {
    repositoryId: parsed.data.repositoryId,
    userId: auth.user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.issue ? { issue: result.issue } : {}) },
      { status: result.status },
    );
  }
  return NextResponse.json({ task: result.task, issue: result.issue }, { status: 201 });
}
