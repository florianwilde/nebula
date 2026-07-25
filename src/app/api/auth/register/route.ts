import { NextResponse } from "next/server";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getInstanceState } from "@/lib/auth/settings";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";
import { formatZodError, registerSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Selbstregistrierung. Nur moeglich, wenn die Instanz im Mehrbenutzerbetrieb
 * laeuft und ein Administrator die Registrierung freigeschaltet hat.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const state = await getInstanceState();
  if (state.needsSetup) {
    return jsonError("Die Instanz ist noch nicht eingerichtet.", 409);
  }
  if (!state.registrationOpen) {
    return jsonError("Die Registrierung ist auf dieser Instanz deaktiviert.", 403);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = registerSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen", fields: formatZodError(parsed.error) },
      { status: 422 },
    );
  }

  const { username, displayName, email, password } = parsed.data;

  const weak = validatePasswordStrength(password);
  if (weak) {
    return NextResponse.json({ error: weak, fields: { password: weak } }, { status: 422 });
  }

  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (taken) {
    return NextResponse.json(
      { error: "Dieser Benutzername ist bereits vergeben.", fields: { username: "Bereits vergeben" } },
      { status: 409 },
    );
  }

  if (email) {
    const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse wird bereits verwendet.", fields: { email: "Bereits vergeben" } },
        { status: 409 },
      );
    }
  }

  const user = await prisma.user.create({
    data: {
      username,
      displayName: displayName ?? null,
      email: email ?? null,
      passwordHash: await hashPassword(password),
      role: "USER",
      // Die Registrierung meldet direkt an.
      lastLoginAt: new Date(),
    },
  });

  const session = await createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ip,
  });

  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
  });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
