import { NextResponse } from "next/server";
import { recordActivity, shorten } from "@/lib/activity";
import { requireUserApi } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { connectionSafeSelect } from "@/lib/projects";
import { completeRepoInput, ownedRepository, repoTitle } from "@/lib/repositories";
import { jsonError, readJsonBody } from "@/lib/security/request";
import { formatZodError, repositoryUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await ownedRepository(id, auth.user.id);
  if (!existing) return jsonError("Repository nicht gefunden", 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = repositoryUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const eingabe = completeRepoInput(parsed.data);

  if (eingabe.connectionId) {
    const connection = await prisma.gitConnection.findFirst({
      where: { id: eingabe.connectionId, ownerId: auth.user.id },
      select: { id: true },
    });
    if (!connection) return jsonError("Git-Verbindung nicht gefunden.", 404);
  }

  const data: Record<string, unknown> = {};
  for (const key of ["label", "repoUrl", "repoOwner", "repoName", "connectionId", "autoSync"] as const) {
    if (eingabe[key] !== undefined) data[key] = eingabe[key];
  }
  if (parsed.data.position !== undefined) data.position = parsed.data.position;

  // Zeigt das Repo woandershin, taugt der gesammelte Stand nicht mehr. Ihn
  // stehen zu lassen waere schlimmer als ihn zu verlieren: er saehe echt aus.
  const zieltWoandershin =
    (eingabe.repoOwner !== undefined && eingabe.repoOwner !== existing.repoOwner) ||
    (eingabe.repoName !== undefined && eingabe.repoName !== existing.repoName);
  if (zieltWoandershin) {
    data.lastSyncedAt = null;
    data.syncError = null;
    data.syncFailureCount = 0;
    data.notifiedSyncError = null;
    data.notifiedCiState = null;
    data.notifiedRelease = null;
    await prisma.repoSnapshot.deleteMany({ where: { repositoryId: id } });
  }

  const repository = await prisma.repository.update({
    where: { id },
    data,
    include: { connection: { select: connectionSafeSelect }, snapshot: true },
  });

  return NextResponse.json({ repository });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Vor dem Loeschen lesen: danach ist nicht mehr feststellbar, worum es ging.
  const vorher = await ownedRepository(id, auth.user.id);
  if (!vorher) return jsonError("Repository nicht gefunden", 404);

  await prisma.repository.delete({ where: { id } });

  await recordActivity({
    projectId: vorher.projectId,
    userId: auth.user.id,
    kind: "REPO_LINKED",
    summary: `Repository entfernt: ${shorten(repoTitle(vorher))}`,
  });

  return NextResponse.json({ ok: true });
}
