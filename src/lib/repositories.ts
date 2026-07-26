import { prisma } from "@/lib/db";
import { parseRepoUrl } from "@/lib/git";
import { repoTitle } from "@/lib/git/meta";

// Der Titel steht in lib/git/meta, weil ihn auch Client-Komponenten
// brauchen – dieses Modul zieht Prisma nach. Hier weitergereicht, damit
// serverseitiger Code nur eine Anlaufstelle hat.
export { repoTitle };

/**
 * Ein Projekt kann mehrere Repositories haben – Frontend und Backend etwa,
 * aber ein Vorhaben.
 *
 * Das erste (position 0) ist das fuehrende. Wo nur eines dargestellt werden
 * kann, ist es dieses: auf der Karte im Dashboard, im Kopf der Projektseite
 * und in allem, was die alte Projekt-API weiterhin annimmt.
 */

/** Angaben, aus denen ein Repository entsteht. */
export interface RepoInput {
  label?: string | null;
  repoUrl?: string | null;
  repoOwner?: string | null;
  repoName?: string | null;
  connectionId?: string | null;
  autoSync?: boolean;
}

/**
 * Ergaenzt Owner und Name aus der URL, wenn sie nicht angegeben wurden.
 * Ohne das muesste man beides von Hand eintragen, obwohl es in der URL steht.
 */
export function completeRepoInput(input: RepoInput): RepoInput {
  if (!input.repoUrl || (input.repoOwner && input.repoName)) return input;

  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) return input;

  return {
    ...input,
    repoOwner: input.repoOwner ?? parsed.owner,
    repoName: input.repoName ?? parsed.name,
  };
}

/** Hat die Eingabe ueberhaupt ein Repository benannt? */
export function namesRepository(input: RepoInput): boolean {
  return Boolean(input.repoUrl || (input.repoOwner && input.repoName));
}

/** Prueft Existenz und Besitz in einem Zug – ueber das Projekt. */
export async function ownedRepository(repositoryId: string, ownerId: string) {
  return prisma.repository.findFirst({
    where: { id: repositoryId, project: { ownerId } },
  });
}

/** Naechste freie Position am Ende der Liste. */
export async function nextRepoPosition(projectId: string): Promise<number> {
  const last = await prisma.repository.findFirst({
    where: { projectId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

/**
 * Setzt die Angaben am fuehrenden Repository – und legt es an, falls es noch
 * keines gibt.
 *
 * Damit bleibt die Projekt-API unveraendert bedienbar: wer beim Anlegen oder
 * Bearbeiten eine Repo-URL mitgibt, bekommt weiterhin das erwartete Ergebnis,
 * ohne von der neuen Tabelle wissen zu muessen.
 *
 * Eine geleerte URL entfernt das Repository nicht, sondern raeumt nur seine
 * Felder – der gesammelte Stand haengt daran, und ein versehentlich
 * geleertes Feld soll ihn nicht mitnehmen.
 */
export async function applyLeadingRepo(projectId: string, input: RepoInput): Promise<void> {
  const vollstaendig = completeRepoInput(input);

  const fuehrend = await prisma.repository.findFirst({
    where: { projectId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (!fuehrend) {
    if (!namesRepository(vollstaendig)) return;
    await prisma.repository.create({
      data: {
        projectId,
        label: vollstaendig.label ?? null,
        repoUrl: vollstaendig.repoUrl ?? null,
        repoOwner: vollstaendig.repoOwner ?? null,
        repoName: vollstaendig.repoName ?? null,
        connectionId: vollstaendig.connectionId ?? null,
        autoSync: vollstaendig.autoSync ?? true,
        position: 0,
      },
    });
    return;
  }

  const data: Record<string, unknown> = {};
  if (vollstaendig.label !== undefined) data.label = vollstaendig.label;
  if (vollstaendig.repoUrl !== undefined) data.repoUrl = vollstaendig.repoUrl;
  if (vollstaendig.repoOwner !== undefined) data.repoOwner = vollstaendig.repoOwner;
  if (vollstaendig.repoName !== undefined) data.repoName = vollstaendig.repoName;
  if (vollstaendig.connectionId !== undefined) data.connectionId = vollstaendig.connectionId;
  if (vollstaendig.autoSync !== undefined) data.autoSync = vollstaendig.autoSync;

  if (Object.keys(data).length === 0) return;
  await prisma.repository.update({ where: { id: fuehrend.id }, data });
}
