import { NextResponse } from "next/server";
import { createPendingLogin, setMfaCookie } from "@/lib/auth/mfa";
import { fakeVerifyDelay, hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
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

  /**
   * Erst das Passwort pruefen, dann ueber den Kontozustand reden.
   *
   * Frueher standen die Abfragen auf gesperrt, deaktiviert und
   * "kein Passwort hinterlegt" **vor** der Pruefung und beantworteten sich
   * damit ohne jede Kenntnis des Passworts. Wer einen Benutzernamen riet,
   * bekam an der Antwort gesagt, ob es ihn gibt – genau die Aufzaehlbarkeit,
   * die der einheitliche Text GENERIC sonst verhindert.
   *
   * Jetzt gilt: falsches Passwort → immer dieselbe Antwort. Die
   * hilfreichere Auskunft bekommt nur, wer das Passwort kennt.
   */
  const valid = user.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : // Kein Passwort hinterlegt (reines Passkey-Konto): trotzdem Zeit
      // verbrennen, damit sich der Fall nicht an der Antwortdauer zeigt.
      await fakeVerifyDelay().then(() => false);

  if (!valid) {
    // Fehlversuche nur zaehlen, wo es ein Passwort zu erraten gibt.
    if (user.passwordHash) await noteFailedLogin(user.id);
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
    return jsonError("Dieses Konto ist deaktiviert.", 403);
  }

  /**
   * Der Aufwand beim Hashen ist gestiegen. Wer sich mit einem Passwort
   * anmeldet, dessen Hash noch nach den alten Vorgaben erzeugt wurde,
   * bekommt hier still einen neuen – es ist der einzige Moment, in dem das
   * Klartextpasswort vorliegt. Nebenlaeufig, damit die Anmeldung nicht auf
   * die halbe Sekunde wartet.
   */
  if (needsRehash(user.passwordHash)) {
    void hashPassword(password)
      .then((neu) => prisma.user.update({ where: { id: user.id }, data: { passwordHash: neu } }))
      .catch(() => undefined);
  }

  // Das Passwort stimmt. Ist ein zweiter Faktor eingerichtet, entsteht hier
  // noch keine Sitzung, sondern nur ein Vorgang mit kurzer Frist.
  if (user.totpEnabledAt) {
    // Die Zaehler bleiben stehen, bis die Anmeldung wirklich durch ist:
    // sonst liesse sich ueber wiederholte Passworteingaben die Sperre
    // umgehen, die falsche Passwoerter aufbaut.
    const token = await createPendingLogin(user.id);
    const response = NextResponse.json({ ok: false, mfaRequired: true });
    setMfaCookie(response, token);
    return response;
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
