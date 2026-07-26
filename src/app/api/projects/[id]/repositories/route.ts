import { NextResponse } from "next/server";
import { recordActivity, shorten } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { connectionSafeSelect } from "@/lib/projects";
import {
  completeRepoInput,
  namesRepository,
  nextRepoPosition,
  repoTitle,
} from "@/lib/repositories";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { ownedProject } from "@/lib/tasks";
import { formatZodError, repositoryCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Hoechstzahl je Projekt. Wer mehr braucht, hat mehrere Vorhaben. */
const MAX_REPOS = 20;

const include = {
  connection: { select: connectionSafeSelect },
  snapshot: true,
} as const;

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownedProject(id, auth.user.id))) {
    return jsonError("Projekt nicht gefunden", 404);
  }

  const repositories = await prisma.repository.findMany({
    where: { projectId: id },
    include,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ repositories });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!(await ownedProject(id, auth.user.id))) {
    return jsonError("Projekt nicht gefunden", 404);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = repositoryCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const eingabe = completeRepoInput(parsed.data);
  if (!namesRepository(eingabe)) {
    return jsonError("Bitte eine Repo-URL oder Owner und Name angeben.", 422);
  }

  // Eine fremde Verbindung darf nicht untergeschoben werden.
  if (eingabe.connectionId) {
    const connection = await prisma.gitConnection.findFirst({
      where: { id: eingabe.connectionId, ownerId: auth.user.id },
      select: { id: true },
    });
    if (!connection) return jsonError("Git-Verbindung nicht gefunden.", 404);
  }

  const vorhanden = await prisma.repository.count({ where: { projectId: id } });
  if (vorhanden >= MAX_REPOS) {
    return jsonError(`Mehr als ${MAX_REPOS} Repositories je Projekt sind nicht vorgesehen.`, 409);
  }

  // Dasselbe Repo zweimal am selben Projekt ist immer ein Versehen.
  if (eingabe.repoOwner && eingabe.repoName) {
    const doppelt = await prisma.repository.findFirst({
      where: { projectId: id, repoOwner: eingabe.repoOwner, repoName: eingabe.repoName },
      select: { id: true },
    });
    if (doppelt) {
      return jsonError(
        `${eingabe.repoOwner}/${eingabe.repoName} ist mit diesem Projekt bereits verknuepft.`,
        409,
      );
    }
  }

  const repository = await prisma.repository.create({
    data: {
      projectId: id,
      label: eingabe.label ?? null,
      repoUrl: eingabe.repoUrl ?? null,
      repoOwner: eingabe.repoOwner ?? null,
      repoName: eingabe.repoName ?? null,
      connectionId: eingabe.connectionId ?? null,
      autoSync: eingabe.autoSync ?? true,
      position: await nextRepoPosition(id),
    },
    include,
  });

  await recordActivity({
    projectId: id,
    userId: auth.user.id,
    kind: "REPO_LINKED",
    summary: `Repository verknüpft: ${shorten(repoTitle(repository))}`,
    meta: { repositoryId: repository.id },
  });

  return NextResponse.json({ repository }, { status: 201 });
}
