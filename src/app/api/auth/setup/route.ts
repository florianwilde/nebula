import { NextResponse } from "next/server";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { claimOrphanedData } from "@/lib/auth/users";
import { prisma } from "@/lib/db";
import { clientIp, jsonError, readJsonBody } from "@/lib/security/request";
import { formatZodError, setupSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Erstmalige Einrichtung: legt das Administratorkonto an.
 *
 * Funktioniert nur, solange es noch keinen Benutzer gibt – danach ist der
 * Endpunkt tot. Damit kann sich niemand nachtraeglich ein Adminkonto
 * erschleichen.
 */
export async function POST(request: Request) {
  const existing = await prisma.user.count();
  if (existing > 0) {
    return jsonError("Die Einrichtung ist bereits abgeschlossen.", 409);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = setupSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { username, displayName, email, password, mode } = parsed.data;

  const weak = validatePasswordStrength(password);
  if (weak) {
    return NextResponse.json(
      { error: weak, fields: { password: weak } },
      { status: 422 },
    );
  }

  const user = await prisma.user.create({
    data: {
      username,
      displayName: displayName ?? null,
      email: email ?? null,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      // Die Einrichtung meldet direkt an – sonst stuende im Adminbereich
      // "noch nie angemeldet", obwohl gerade eine Sitzung laeuft.
      lastLoginAt: new Date(),
    },
  });

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", mode },
    update: { mode },
  });

  const claimed = await claimOrphanedData(user.id);

  const session = await createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ip: clientIp(request),
  });

  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
    claimed,
  });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
