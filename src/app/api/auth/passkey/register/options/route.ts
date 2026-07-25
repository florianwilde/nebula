import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/guard";
import { WebAuthnUnavailableError, buildRegistrationOptions } from "@/lib/auth/webauthn";
import { LIMITS, rateLimit } from "@/lib/security/rateLimit";
import { clientIp, jsonError, tooManyRequests } from "@/lib/security/request";

export const dynamic = "force-dynamic";

/** Liefert die Optionen fuer navigator.credentials.create(). */
export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(
    `webauthn:reg:${clientIp(request)}`,
    LIMITS.webauthn.limit,
    LIMITS.webauthn.windowMs,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const options = await buildRegistrationOptions({
      id: auth.user.id,
      username: auth.user.username,
      displayName: auth.user.displayName,
    });
    return NextResponse.json({ options });
  } catch (error) {
    if (error instanceof WebAuthnUnavailableError) return jsonError(error.message, 501);
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
}
