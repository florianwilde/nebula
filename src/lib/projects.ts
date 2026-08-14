import { Prisma, type ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

/**
 * Erzeugt einen je Besitzer eindeutigen Slug, notfalls mit angehaengtem
 * Zaehler. Zwei Benutzer duerfen also beide ein Projekt "dashboard" haben.
 */
export async function uniqueSlug(
  name: string,
  ownerId: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(name) || "projekt";
  let candidate = base;
  let counter = 2;

  // In der Praxis endet die Schleife nach wenigen Runden.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const existing = await prisma.project.findFirst({
      where: { slug: candidate, ownerId },
      select: { id: true },
    });
    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Naechste freie Position am Ende einer Statusspalte im Brett.
 *
 * Muss bei jedem Anlegen und bei jedem Statuswechsel gesetzt werden – sonst
 * stehen alle auf 0 und das Brett zeigt eine Reihenfolge, die sich bei jedem
 * Laden anders ergeben kann.
 */
export async function nextProjectPosition(
  ownerId: string,
  status: ProjectStatus,
): Promise<number> {
  const last = await prisma.project.findFirst({
    where: { ownerId, status },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

/**
 * Verbindungsfelder, die an den Browser gehen duerfen.
 * tokenCipher ist bewusst nicht dabei.
 */
export const connectionSafeSelect = Prisma.validator<Prisma.GitConnectionSelect>()({
  id: true,
  name: true,
  provider: true,
  baseUrl: true,
  username: true,
  tokenHint: true,
  lastCheckedAt: true,
  lastCheckOk: true,
  lastCheckMessage: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Felder eines Repositories, die nach aussen duerfen.
 *
 * Ausdruecklich als Liste und nicht als "include": ein include liefert jedes
 * Skalarfeld mit, auch neu hinzugekommene. Das Webhook-Geheimnis waere so
 * still in jede Projektantwort und in jede Seite gewandert – verschluesselt
 * zwar, aber nach aussen gehoert es trotzdem nicht. Dieselbe Ueberlegung wie
 * bei connectionSafeSelect.
 *
 * Ob ein Webhook eingerichtet ist, sagt webhookLastAt nicht zuverlaessig
 * (frisch eingerichtet ist es null). Diese Angabe holt die Projektseite
 * deshalb getrennt – siehe webhookRepositoryIds.
 */
export const repositorySafeSelect = Prisma.validator<Prisma.RepositorySelect>()({
  id: true,
  projectId: true,
  label: true,
  repoUrl: true,
  repoOwner: true,
  repoName: true,
  defaultBranch: true,
  connectionId: true,
  position: true,
  lastSyncedAt: true,
  syncError: true,
  autoSync: true,
  syncFailureCount: true,
  notifiedSyncError: true,
  notifiedCiState: true,
  notifiedRelease: true,
  webhookLastAt: true,
  createdAt: true,
  updatedAt: true,
  connection: { select: connectionSafeSelect },
  snapshot: true,
});

/**
 * Ein Repository mitsamt Verbindung und Stand. Die Reihenfolge ist ueberall
 * dieselbe: das fuehrende zuerst, denn auf der Karte ist nur fuer eines Platz.
 */
export const repositoryInclude = Prisma.validator<Prisma.ProjectInclude>()({
  repositories: {
    select: repositorySafeSelect,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  },
});

/**
 * IDs der Repositories eines Projekts, fuer die ein Webhook hinterlegt ist.
 * Getrennt geholt, damit das Geheimnis selbst nirgends mitgereicht wird.
 */
export async function webhookRepositoryIds(projectId: string): Promise<string[]> {
  const treffer = await prisma.repository.findMany({
    where: { projectId, webhookSecret: { not: null } },
    select: { id: true },
  });
  return treffer.map((eintrag) => eintrag.id);
}

export const projectListInclude = Prisma.validator<Prisma.ProjectInclude>()({
  ...repositoryInclude,
  _count: { select: { notes: true, tasks: true } },
  // Nur die offenen Aufgaben zaehlen – fuer die Anzeige "3 von 8" auf der
  // Karte, ohne die Aufgaben selbst mitzuladen.
  tasks: { where: { status: "DONE" }, select: { id: true } },
});

export const projectDetailInclude = Prisma.validator<Prisma.ProjectInclude>()({
  ...repositoryInclude,
  notes: {
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  },
  tasks: {
    orderBy: [{ status: "asc" }, { position: "asc" }],
  },
  // Erste Seite des Verlaufs; weitere holt die Anzeige bei Bedarf nach.
  activities: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      kind: true,
      summary: true,
      createdAt: true,
      user: { select: { username: true, displayName: true } },
    },
  },
  _count: { select: { notes: true, tasks: true } },
});
