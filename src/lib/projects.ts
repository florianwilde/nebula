import { Prisma } from "@prisma/client";
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

export const projectListInclude = Prisma.validator<Prisma.ProjectInclude>()({
  connection: { select: connectionSafeSelect },
  snapshot: true,
  _count: { select: { notes: true, tasks: true } },
  // Nur die offenen Aufgaben zaehlen – fuer die Anzeige "3 von 8" auf der
  // Karte, ohne die Aufgaben selbst mitzuladen.
  tasks: { where: { status: "DONE" }, select: { id: true } },
});

export const projectDetailInclude = Prisma.validator<Prisma.ProjectInclude>()({
  connection: { select: connectionSafeSelect },
  snapshot: true,
  notes: {
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  },
  tasks: {
    orderBy: [{ status: "asc" }, { position: "asc" }],
  },
  _count: { select: { notes: true, tasks: true } },
});
