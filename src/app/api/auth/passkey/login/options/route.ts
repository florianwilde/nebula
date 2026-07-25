import { NextResponse } from "next/server";
import { WebAuthnUnavailableError, buildAuthenticationOptions } from "@/lib/auth/webauthn";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, tooManyRequests } from "@/lib/security/request";

export const dynamic = "force-dynamic";

/**
 * Optionen fuer navigator.credentials.get(). Ohne allowCredentials – der
 * Browser bietet alle passenden Passkeys an, ein Benutzername ist nicht
 * noetig. Der Endpunkt verraet dadurch auch nichts ueber vorhandene Konten.
 */
export async function POST(request: Request) {
  const limited = rateLimit(
    `webauthn:auth:${clientIp(request)}`,
    LIMITS.webauthn.limit,
    LIMITS.webauthn.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const options = await buildAuthenticationOptions();
    return NextResponse.json({ options });
  } catch (error) {
    if (error instanceof WebAuthnUnavailableError) return jsonError(error.message, 501);
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
