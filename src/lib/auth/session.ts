import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import {
  COOKIES_SECURE,
  SESSION_COOKIE,
  SESSION_IDLE_MS,
  SESSION_TTL_MS,
} from "@/lib/config";
import { prisma } from "@/lib/db";

/**
 * Serverseitige Sitzungen.
 *
 * Der Cookie enthaelt ein Zufallstoken, die Datenbank nur dessen SHA-256-Hash.
 * Wer die Datenbank liest, kann damit keine Sitzung uebernehmen. Abmelden und
 * Sperren wirken sofort, weil bei jeder Anfrage nachgeschlagen wird – anders
 * als bei einem selbsttragenden Token.
 */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: User["role"];
  hasPassword: boolean;
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    hasPassword: Boolean(user.passwordHash),
  };
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 60) ?? null,
    },
  });

  // Gelegenheit nutzen und abgelaufene Sitzungen wegraeumen.
  void prisma.session
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);

  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    // Strict statt Lax: Nebula hat keinen Einstieg von aussen, den eine
    // fremde Seite anstossen duerfte. Der Preis ist, dass ein Klick von
    // einer anderen Seite auf die Anmeldung fuehrt – ein Neuladen genuegt.
    sameSite: "strict",
    secure: COOKIES_SECURE,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    // Strict statt Lax: Nebula hat keinen Einstieg von aussen, den eine
    // fremde Seite anstossen duerfte. Der Preis ist, dass ein Klick von
    // einer anderen Seite auf die Anmeldung fuehrt – ein Neuladen genuegt.
    sameSite: "strict",
    secure: COOKIES_SECURE,
    path: "/",
    maxAge: 0,
  });
}

/**
 * Liest die Sitzung aus dem Cookie und prueft sie gegen die Datenbank.
 * Gibt null zurueck, wenn kein oder ein ungueltiges Token vorliegt oder das
 * Konto deaktiviert wurde.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  // Leerlaufgrenze. Vorher wurde lastSeenAt zwar gefuehrt, aber nie
  // ausgewertet – ein abgegriffener Cookie galt damit bis zum absoluten
  // Ablauf, auch wenn das Konto wochenlang unberuehrt war.
  const untaetig = Date.now() - session.lastSeenAt.getTime();
  if (SESSION_IDLE_MS > 0 && untaetig > SESSION_IDLE_MS) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (!session.user.isActive) return null;

  /**
   * lastSeenAt nachfuehren, aber nicht bei jeder Anfrage schreiben.
   *
   * Das Intervall muss deutlich unter der Leerlaufgrenze liegen, sonst
   * verkuerzt die Schreibbremse sie: bei stuendlichem Schreiben und einer
   * Grenze von einer Stunde waere die Sitzung schon nach Sekunden faellig.
   * Ein Zwanzigstel der Frist, hoechstens fuenf Minuten.
   */
  const intervall = SESSION_IDLE_MS > 0 ? Math.min(SESSION_IDLE_MS / 20, 5 * 60 * 1000) : 60 * 60 * 1000;
  if (untaetig > intervall) {
    void prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return toSessionUser(session.user);
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await prisma.session
    .deleteMany({ where: { tokenHash: hashToken(token) } })
    .catch(() => undefined);
}

/** Meldet ein Konto ueberall ab – nach Passwortwechsel oder Sperrung. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
