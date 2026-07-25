import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { noteSuccessfulLogin } from "@/lib/auth/users";
import { WebAuthnUnavailableError, confirmAuthentication } from "@/lib/auth/webauthn";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, readJsonBody, tooManyRequests } from "@/lib/security/request";

export const dynamic = "force-dynamic";

interface Payload {
  response?: AuthenticationResponseJSON;
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`passkey:login:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = await readJsonBody<Payload>(request);
  if (!body.ok) return body.response;

  const assertion = body.data?.response;
  if (!assertion || typeof assertion !== "object") {
    return jsonError("Die Antwort des Authenticators fehlt.", 400);
  }

  try {
    const result = await confirmAuthentication(assertion);

    const user = await prisma.user.findUnique({ where: { id: result.userId } });
    if (!user || !user.isActive) {
      return jsonError("Dieses Konto ist deaktiviert.", 403);
    }

    await noteSuccessfulLogin(user.id);

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
  } catch (error) {
    if (error instanceof WebAuthnUnavailableError) return jsonError(error.message, 501);
    return jsonError(error instanceof Error ? error.message : String(error), 401);
  }
}
