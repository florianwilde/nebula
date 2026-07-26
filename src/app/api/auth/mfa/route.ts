import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearMfaCookie,
  discardPendingLogin,
  noteMfaFailure,
  readPendingLogin,
} from "@/lib/auth/mfa";
import { redeemRecoveryCode } from "@/lib/auth/recovery";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { verifyTotp } from "@/lib/auth/totp";
import { noteSuccessfulLogin } from "@/lib/auth/users";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";

export const dynamic = "force-dynamic";

/**
 * Der zweite Schritt der Anmeldung: Einmalkennwort oder
 * Wiederherstellungscode.
 *
 * Der Vorgang steckt im kurzlebigen Cookie aus Schritt eins. Wer hier ohne
 * diesen Cookie ankommt, hat kein Passwort vorgezeigt und bekommt nichts.
 */

const schema = z.object({
  code: z.string().min(1).max(40),
});

const GENERIC = "Der Code stimmt nicht.";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`mfa:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.data);
  if (!parsed.success) return jsonError(GENERIC, 401);

  const pending = await readPendingLogin();
  if (!pending) {
    const response = jsonError(
      "Die Anmeldung ist abgelaufen. Bitte melde dich neu an.",
      401,
    );
    clearMfaCookie(response);
    return response;
  }

  if (!pending.user.isActive) {
    await discardPendingLogin(pending.id);
    const response = jsonError("Dieses Konto ist deaktiviert.", 403);
    clearMfaCookie(response);
    return response;
  }

  const eingabe = parsed.data.code.trim();

  // Sechs Ziffern sind ein Einmalkennwort, alles andere ein
  // Wiederherstellungscode. Beide Wege zu probieren waere unnoetig – die
  // Formate ueberschneiden sich nicht.
  const istZiffern = /^[\d\s]+$/.test(eingabe);
  const erfolg = istZiffern
    ? Boolean(pending.user.totpSecret) && verifyTotp(pending.user.totpSecret!, eingabe)
    : await redeemRecoveryCode(pending.user.id, eingabe);

  if (!erfolg) {
    const weiterMoeglich = await noteMfaFailure(pending.id);
    if (!weiterMoeglich) {
      const response = jsonError(
        "Zu viele Fehlversuche. Bitte melde dich neu an.",
        429,
      );
      clearMfaCookie(response);
      return response;
    }
    return jsonError(GENERIC, 401);
  }

  await discardPendingLogin(pending.id);
  await noteSuccessfulLogin(pending.user.id);

  const session = await createSession(pending.user.id, {
    userAgent: request.headers.get("user-agent"),
    ip,
  });

  const response = NextResponse.json({
    ok: true,
    user: { id: pending.user.id, username: pending.user.username, role: pending.user.role },
  });
  setSessionCookie(response, session.token, session.expiresAt);
  clearMfaCookie(response);
  return response;
}
