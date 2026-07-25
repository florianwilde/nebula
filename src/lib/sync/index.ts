import type { Project } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clientForConnection, createClient, parseRepoUrl } from "@/lib/git";
import type { RepoSnapshotData } from "@/lib/git/types";

export interface SyncResult {
  ok: boolean;
  message: string;
  fetchedAt?: string;
}

/**
 * Holt den aktuellen Stand des verknuepften Repositories und schreibt ihn
 * als Snapshot in die Datenbank. Fehler werden am Projekt vermerkt statt
 * geworfen, damit ein kaputtes Repo nicht das ganze Dashboard blockiert.
 */
export async function syncProject(projectId: string): Promise<SyncResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { connection: true },
  });

  if (!project) {
    return { ok: false, message: "Projekt nicht gefunden." };
  }

  const ref = resolveRepoRef(project);
  if (!ref) {
    return {
      ok: false,
      message: "Kein Repository hinterlegt – bitte Repo-URL oder Owner/Name setzen.",
    };
  }

  let client;
  if (project.connection) {
    client = clientForConnection(project.connection);
  } else {
    // Ohne gespeicherte Verbindung: anonymer Zugriff anhand der URL.
    const parsed = project.repoUrl ? parseRepoUrl(project.repoUrl) : null;
    if (!parsed) {
      return {
        ok: false,
        message: "Keine Git-Verbindung ausgewaehlt und die Repo-URL ist nicht auswertbar.",
      };
    }
    client = createClient({
      provider: parsed.guessedProvider,
      baseUrl: parsed.baseUrl,
      token: null,
    });
  }

  try {
    const data = await client.fetchRepo(ref);
    await persistSnapshot(project.id, data);
    return {
      ok: true,
      message: `Snapshot aktualisiert: ${data.branches.length} Branches, ${data.tags.length} Tags.`,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.project.update({
      where: { id: project.id },
      data: {
        syncError: message,
        lastSyncedAt: new Date(),
        // Zaehler fuers Zurueckhalten beim automatischen Abgleich.
        syncFailureCount: { increment: 1 },
      },
    });
    return { ok: false, message };
  }
}

/** Owner/Name aus den Feldern oder ersatzweise aus der URL bestimmen. */
export function resolveRepoRef(project: Project) {
  if (project.repoOwner && project.repoName) {
    return { owner: project.repoOwner, name: project.repoName };
  }
  if (project.repoUrl) {
    const parsed = parseRepoUrl(project.repoUrl);
    if (parsed) return { owner: parsed.owner, name: parsed.name };
  }
  return null;
}

async function persistSnapshot(projectId: string, data: RepoSnapshotData) {
  const latestCommit = data.commits[0] ?? null;
  const latestRelease =
    data.releases.find((release) => !release.draft && !release.prerelease) ?? data.releases[0] ?? null;
  const latestTag = data.tags[0]?.name ?? latestRelease?.tag ?? null;

  const payload = {
    fullName: data.fullName,
    description: data.description,
    defaultBranch: data.defaultBranch,
    htmlUrl: data.htmlUrl,
    visibility: data.visibility,
    stars: data.stars,
    forks: data.forks,
    openIssues: data.openIssues,
    openPullRequests: data.openPullRequests,
    sizeKb: data.sizeKb,
    lastCommitSha: latestCommit?.sha ?? null,
    lastCommitMessage: latestCommit?.message ?? null,
    lastCommitAuthor: latestCommit?.author ?? null,
    lastCommitAt: latestCommit?.date ? new Date(latestCommit.date) : null,
    latestTag,
    latestRelease: latestRelease?.name ?? null,
    latestReleaseAt: latestRelease?.publishedAt ? new Date(latestRelease.publishedAt) : null,
    branchCount: data.branches.length,
    tagCount: data.tags.length,
    branches: data.branches as unknown as object,
    tags: data.tags as unknown as object,
    commits: data.commits as unknown as object,
    releases: data.releases as unknown as object,
    languages: data.languages as unknown as object,
    pushedAt: data.pushedAt ? new Date(data.pushedAt) : null,
    fetchedAt: new Date(),
  };

  await prisma.$transaction([
    prisma.repoSnapshot.upsert({
      where: { projectId },
      create: { projectId, ...payload },
      update: payload,
    }),
    prisma.project.update({
      where: { id: projectId },
      data: {
        lastSyncedAt: new Date(),
        syncError: null,
        syncFailureCount: 0,
        defaultBranch: data.defaultBranch,
        repoUrl: data.htmlUrl ?? undefined,
      },
    }),
  ]);
}
