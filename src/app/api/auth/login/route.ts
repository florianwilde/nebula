import { NextResponse } from "next/server";
import { fakeVerifyDelay, verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { lockRemainingSeconds, noteFailedLogin, noteSuccessfulLogin } from "@/lib/auth/users";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit, resetRateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Immer dieselbe Meldung – sonst verraet sie, welche Konten existieren. */
const GENERIC = "Benutzername oder Passwort ist falsch.";

export async function POST(request: Request) {
  const ip = clientIp(request);

  const byIp = rateLimit(`login:ip:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfter);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = loginSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(GENERIC, 401);

  const { username, password } = parsed.data;

  const byUser = rateLimit(
    `login:user:${username}`,
    LIMITS.loginUser.limit,
    LIMITS.loginUser.windowMs,
  );
  if (!byUser.ok) return tooManyRequests(byUser.retryAfter);

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    // Gleiche Rechenzeit verbrennen wie bei einem echten Konto.
    await fakeVerifyDelay();
    return jsonError(GENERIC, 401);
  }

  const locked = lockRemainingSeconds(user.lockedUntil);
  if (locked > 0) {
    return jsonError(
      `Das Konto ist nach mehreren Fehlversuchen noch ${Math.ceil(locked / 60)} Minuten gesperrt.`,
      423,
    );
  }

  if (!user.isActive) {
    await fakeVerifyDelay();
    return jsonError("Dieses Konto ist deaktiviert.", 403);
  }

  if (!user.passwordHash) {
    await fakeVerifyDelay();
    return jsonError(
      "Fuer dieses Konto ist kein Passwort hinterlegt – bitte mit Passkey anmelden.",
      401,
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await noteFailedLogin(user.id);
    return jsonError(GENERIC, 401);
  }

  await noteSuccessfulLogin(user.id);
  resetRateLimit(`login:user:${username}`);
  resetRateLimit(`login:ip:${ip}`);

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
