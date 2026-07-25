import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Benutzerfelder, die an den Browser gehen duerfen. */
export const userSafeSelect = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  _count: { select: { credentials: true, projects: true, sessions: true } },
} satisfies Prisma.UserSelect;

export type UserListEntry = Prisma.UserGetPayload<{ select: typeof userSafeSelect }>;

/** Sperre nach zu vielen Fehlversuchen. */
const LOCK_THRESHOLD = 8;
const LOCK_MINUTES = 15;

export async function noteFailedLogin(userId: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });

  if (user.failedLoginCount >= LOCK_THRESHOLD) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
        failedLoginCount: 0,
      },
    });
  }
}

export async function noteSuccessfulLogin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
}

export function lockRemainingSeconds(lockedUntil: Date | null): number {
  if (!lockedUntil) return 0;
  const remaining = lockedUntil.getTime() - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Uebernimmt Projekte und Verbindungen ohne Besitzer.
 *
 * Greift genau einmal: beim Anlegen des ersten Kontos. So gehen Daten, die
 * vor der Einfuehrung der Benutzerverwaltung entstanden sind, nicht verloren.
 */
export async function claimOrphanedData(userId: string): Promise<{
  projects: number;
  connections: number;
}> {
  const [projects, connections] = await prisma.$transaction([
    prisma.project.updateMany({ where: { ownerId: null }, data: { ownerId: userId } }),
    prisma.gitConnection.updateMany({ where: { ownerId: null }, data: { ownerId: userId } }),
  ]);
  return { projects: projects.count, connections: connections.count };
}
