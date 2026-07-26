import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { nextProjectPosition, projectListInclude, uniqueSlug } from "@/lib/projects";
import { applyLeadingRepo } from "@/lib/repositories";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";
import { statusOf } from "@/lib/status";
import { formatZodError, projectCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const query = searchParams.get("q");

  const projects = await prisma.project.findMany({
    where: {
      // Die Besitzerbedingung steht immer zuerst und ist nicht optional.
      ownerId: auth.user.id,
      ...(status ? { status: status as never } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { summary: { contains: query, mode: "insensitive" as const } },
              { tags: { has: query.toLowerCase() } },
            ],
          }
        : {}),
    },
    include: projectListInclude,
    orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ projects });
}

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

  const parsed = projectCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Eine fremde Verbindung darf nicht untergeschoben werden.
  if (data.connectionId) {
    const connection = await prisma.gitConnection.findFirst({
      where: { id: data.connectionId, ownerId: auth.user.id },
      select: { id: true },
    });
    if (!connection) return jsonError("Git-Verbindung nicht gefunden.", 404);
  }

  // Aus der Vorlage kommen nur Notizen und Aufgaben. Die Stammdaten hat die
  // Oberflaeche schon in die Felder uebernommen, damit man sie vor dem
  // Speichern noch sieht und aendern kann.
  const vorlage = data.templateId
    ? await prisma.projectTemplate.findFirst({
        where: { id: data.templateId, ownerId: auth.user.id },
        select: { name: true, notes: true, tasks: true },
      })
    : null;
  if (data.templateId && !vorlage) return jsonError("Vorlage nicht gefunden.", 404);

  const notes = templateNotes(vorlage?.notes);
  const tasks = templateTasks(vorlage?.tasks);

  const angelegt = await prisma.project.create({
    data: {
      ownerId: auth.user.id,
      name: data.name,
      slug: await uniqueSlug(data.name, auth.user.id),
      summary: data.summary ?? null,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      progress: data.progress,
      accent: data.accent,
      tags: data.tags,
      favorite: data.favorite,
      progressFromTasks: data.progressFromTasks,
      // Hinten an die Statusspalte des Bretts.
      position: await nextProjectPosition(auth.user.id, data.status),
      notes: { create: notes },
      tasks: { create: tasks },
    },
    select: { id: true },
  });

  // Die Git-Angaben werden zum fuehrenden Repository – falls welche kamen.
  await applyLeadingRepo(angelegt.id, {
    repoUrl: data.repoUrl,
    repoOwner: data.repoOwner,
    repoName: data.repoName,
    connectionId: data.connectionId,
    autoSync: data.autoSync,
  });

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: angelegt.id },
    include: projectListInclude,
  });

  await recordActivity({
    projectId: project.id,
    userId: auth.user.id,
    kind: "PROJECT_CREATED",
    summary: vorlage
      ? `Aus Vorlage „${vorlage.name}“ angelegt`
      : data.status === "IDEA"
        ? "Als Idee angelegt"
        : `Angelegt mit Status „${statusOf(data.status).label}“`,
    meta: {
      status: data.status,
      ...(vorlage ? { template: vorlage.name, notes: notes.length, tasks: tasks.length } : {}),
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}

/**
 * Die Vorlage kommt als JSON aus der Datenbank und ist damit fuer TypeScript
 * unbekannt. Hier wird sie auf das Noetige zurechtgeschnitten – lieber einen
 * Eintrag auslassen als am Anlegen scheitern.
 */
function templateNotes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .filter((entry) => typeof entry.content === "string" && entry.content.trim().length > 0)
    .slice(0, 50)
    .map((entry) => ({
      title: typeof entry.title === "string" ? entry.title : null,
      content: entry.content as string,
      pinned: entry.pinned === true,
    }));
}

function templateTasks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .filter((entry) => typeof entry.title === "string" && entry.title.trim().length > 0)
    .slice(0, 100)
    .map((entry, index) => ({
      title: entry.title as string,
      description: typeof entry.description === "string" ? entry.description : null,
      status: (["TODO", "DOING", "BLOCKED"] as const).includes(
        entry.status as "TODO" | "DOING" | "BLOCKED",
      )
        ? (entry.status as "TODO" | "DOING" | "BLOCKED")
        : ("TODO" as const),
      // Reihenfolge wie in der Vorlage.
      position: index,
      labels: Array.isArray(entry.labels)
        ? entry.labels.filter((label): label is string => typeof label === "string").slice(0, 8)
        : [],
    }));
}
