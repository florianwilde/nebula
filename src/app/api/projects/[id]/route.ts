import type { ProjectStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { describeFields, describeStatus, recordActivities, shorten } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { parseRepoUrl } from "@/lib/git";
import { projectDetailInclude, projectListInclude, uniqueSlug } from "@/lib/projects";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { refreshDerivedProgress } from "@/lib/tasks";
import { formatZodError, projectUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, ownerId: auth.user.id },
    include: projectDetailInclude,
  });

  // Fremde Projekte werden wie nicht vorhandene behandelt – die Antwort
  // verraet also nicht, dass es die ID gibt.
  if (!project) return jsonError("Projekt nicht gefunden", 404);

  return NextResponse.json({ project });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = projectUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const existing = await prisma.project.findFirst({
    where: { id, ownerId: auth.user.id },
  });
  if (!existing) return jsonError("Projekt nicht gefunden", 404);

  const data = parsed.data;

  if (data.connectionId) {
    const connection = await prisma.gitConnection.findFirst({
      where: { id: data.connectionId, ownerId: auth.user.id },
      select: { id: true },
    });
    if (!connection) return jsonError("Git-Verbindung nicht gefunden.", 404);
  }

  const update: Record<string, unknown> = {};

  if (data.name !== undefined && data.name !== existing.name) {
    update.name = data.name;
    update.slug = await uniqueSlug(data.name, auth.user.id, id);
  }
  for (const key of [
    "summary",
    "description",
    "status",
    "priority",
    "progress",
    "accent",
    "tags",
    "favorite",
    "autoSync",
    "progressFromTasks",
    "connectionId",
  ] as const) {
    if (data[key] !== undefined) update[key] = data[key];
  }

  if (data.repoUrl !== undefined) {
    update.repoUrl = data.repoUrl;
    const parsedUrl = data.repoUrl ? parseRepoUrl(data.repoUrl) : null;
    if (parsedUrl) {
      update.repoOwner = data.repoOwner ?? parsedUrl.owner;
      update.repoName = data.repoName ?? parsedUrl.name;
    } else if (!data.repoUrl) {
      update.repoOwner = null;
      update.repoName = null;
    }
  }
  if (data.repoOwner !== undefined) update.repoOwner = data.repoOwner;
  if (data.repoName !== undefined) update.repoName = data.repoName;

  await prisma.project.update({ where: { id }, data: update });

  await noteChanges(id, auth.user.id, existing, update);

  // Wird die Ableitung eingeschaltet, soll der Wert sofort stimmen und nicht
  // erst beim naechsten Aufgabenwechsel.
  if (data.progressFromTasks === true) {
    await refreshDerivedProgress(id);
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id },
    include: projectListInclude,
  });

  return NextResponse.json({ project });
}

/**
 * Haelt fest, was sich geaendert hat. Status und Repo-Verknuepfung bekommen
 * einen eigenen Eintrag – sie sind die Vorgaenge, die man spaeter sucht. Alles
 * uebrige fasst ein Eintrag zusammen, sonst ertraenkt eine Feinjustage der
 * Farbe den Verlauf.
 */
async function noteChanges(
  projectId: string,
  userId: string,
  before: { status: ProjectStatus; repoUrl: string | null },
  update: Record<string, unknown>,
) {
  const rest = Object.keys(update).filter(
    (key) => key !== "status" && key !== "slug" && !key.startsWith("repo"),
  );
  const entries: Parameters<typeof recordActivities>[0] = [];

  if (update.status !== undefined && update.status !== before.status) {
    const to = update.status as ProjectStatus;
    entries.push({
      projectId,
      userId,
      kind: "STATUS_CHANGED",
      summary: describeStatus(before.status, to),
      meta: { from: before.status, to },
    });
  }

  if (update.repoUrl !== undefined && update.repoUrl !== before.repoUrl) {
    const url = update.repoUrl as string | null;
    entries.push({
      projectId,
      userId,
      kind: "REPO_LINKED",
      summary: url ? `Repository verknüpft: ${shorten(url)}` : "Repository-Verknüpfung entfernt",
      meta: { repoUrl: url },
    });
  }

  const felder = describeFields(rest);
  if (felder) {
    entries.push({
      projectId,
      userId,
      kind: "PROJECT_UPDATED",
      summary: felder,
      meta: { fields: rest },
    });
  }

  await recordActivities(entries);
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // deleteMany mit Besitzerbedingung: trifft fremde Projekte gar nicht erst.
  const result = await prisma.project.deleteMany({
    where: { id, ownerId: auth.user.id },
  });
  if (result.count === 0) return jsonError("Projekt nicht gefunden", 404);

  return NextResponse.json({ ok: true });
}
