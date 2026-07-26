import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { COOKIES_SECURE, MFA_COOKIE, MFA_TTL_MS } from "@/lib/config";
import { tryDecryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";

/**
 * Der Zwischenzustand zwischen Passwort und zweitem Faktor.
 *
 * Bewusst nicht als halbfertige Sitzung: eine Sitzungszeile mit einem
 * "noch nicht gueltig"-Merker waere eine Zeile, die bei einem vergessenen
 * Filter irgendwo doch als Anmeldung durchgeht. Ein eigenes Modell kann
 * dieses Versehen nicht passieren.
 */

/** Nach so vielen Fehlversuchen ist der Vorgang verbrannt. */
export const MFA_MAX_ATTEMPTS = 5;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createPendingLogin(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  // Aeltere Vorgaenge desselben Kontos verwerfen: es kann nur einen geben,
  // sonst sammeln sich bei jedem Anlauf neue Rateversuche an.
  await prisma.pendingLogin.deleteMany({
    where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] },
  });

  await prisma.pendingLogin.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + MFA_TTL_MS),
    },
  });

  return token;
}

export function setMfaCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: MFA_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIES_SECURE,
    path: "/",
    maxAge: Math.floor(MFA_TTL_MS / 1000),
  });
}

export function clearMfaCookie(response: NextResponse) {
  response.cookies.set({
    name: MFA_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIES_SECURE,
    path: "/",
    maxAge: 0,
  });
}

export interface PendingLoginState {
  id: string;
  attempts: number;
  user: {
    id: string;
    username: string;
    role: "ADMIN" | "USER";
    isActive: boolean;
    /** Entschluesselter TOTP-Schluessel; null, wenn er nicht lesbar ist. */
    totpSecret: string | null;
    /** Zuletzt eingeloestes Zeitfenster – gegen die Wiederverwendung. */
    totpLastCounter: number | null;
  };
}

/** Liest den laufenden Vorgang aus dem Cookie. */
export async function readPendingLogin(): Promise<PendingLoginState | null> {
  const store = await cookies();
  const token = store.get(MFA_COOKIE)?.value;
  if (!token) return null;

  const pending = await prisma.pendingLogin.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!pending) return null;

  if (pending.expiresAt.getTime() <= Date.now()) {
    await prisma.pendingLogin.delete({ where: { id: pending.id } }).catch(() => undefined);
    return null;
  }

  return {
    id: pending.id,
    attempts: pending.attempts,
    user: {
      id: pending.user.id,
      username: pending.user.username,
      role: pending.user.role,
      isActive: pending.user.isActive,
      totpSecret: tryDecryptSecret(pending.user.totpSecretCipher),
      totpLastCounter: pending.user.totpLastCounter,
    },
  };
}

/** Zaehlt einen Fehlversuch. Gibt zurueck, ob noch Versuche offen sind. */
export async function noteMfaFailure(id: string): Promise<boolean> {
  const updated = await prisma.pendingLogin.update({
    where: { id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });

  if (updated.attempts >= MFA_MAX_ATTEMPTS) {
    await prisma.pendingLogin.delete({ where: { id } }).catch(() => undefined);
    return false;
  }
  return true;
}

export async function discardPendingLogin(id: string): Promise<void> {
  await prisma.pendingLogin.delete({ where: { id } }).catch(() => undefined);
}
