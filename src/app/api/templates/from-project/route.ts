import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";
import { formatZodError, templateFromProjectSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Aus einem vorhandenen Projekt eine Vorlage machen.
 *
 * Das ist der Weg, auf dem Vorlagen ueblicherweise entstehen: man richtet ein
 * Projekt so ein, wie es passt, und haelt das dann fest. Eine Vorlage von
 * Grund auf zu tippen kann man auch – ueber POST /api/templates.
 *
 * Nicht mitgenommen wird alles Projektbezogene: Name, Slug, Fortschritt,
 * Favorit und vor allem die Repositories. Eine Vorlage, die jedes neue
 * Projekt an dasselbe Repository haengt, waere eine Falle.
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

  const parsed = templateFromProjectSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { projectId, name, description, withNotes, withTasks } = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: auth.user.id },
    include: {
      notes: { orderBy: [{ pinned: "desc" }, { createdAt: "asc" }] },
      tasks: { orderBy: [{ status: "asc" }, { position: "asc" }] },
    },
  });
  if (!project) return jsonError("Projekt nicht gefunden", 404);

  const doppelt = await prisma.projectTemplate.findFirst({
    where: { ownerId: auth.user.id, name },
    select: { id: true },
  });
  if (doppelt) return jsonError(`Eine Vorlage „${name}“ gibt es bereits.`, 409);

  const template = await prisma.projectTemplate.create({
    data: {
      ownerId: auth.user.id,
      name,
      description: description ?? null,
      summary: project.summary,
      projectDescription: project.description,
      status: project.status,
      priority: project.priority,
      accent: project.accent,
      tags: project.tags,
      progressFromTasks: project.progressFromTasks,
      notes: withNotes
        ? project.notes.map((note) => ({
            title: note.title,
            content: note.content,
            pinned: note.pinned,
          }))
        : [],
      // Erledigte Aufgaben kommen nicht mit: eine Vorlage beschreibt, was zu
      // tun ist, nicht was einmal getan wurde.
      tasks: withTasks
        ? project.tasks
            .filter((task) => task.status !== "DONE")
            .map((task) => ({
              title: task.title,
              description: task.description,
              status: task.status,
              labels: task.labels,
            }))
        : [],
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
