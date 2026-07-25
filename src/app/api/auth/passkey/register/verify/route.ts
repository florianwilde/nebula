import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { requireUserApi } from "@/lib/auth/guard";
import { WebAuthnUnavailableError, confirmRegistration } from "@/lib/auth/webauthn";
import { jsonError, readJsonBody } from "@/lib/security/request";

export const dynamic = "force-dynamic";

interface Payload {
  response?: RegistrationResponseJSON;
  name?: string | null;
}

/** Nimmt die Antwort des Authenticators entgegen und speichert den Passkey. */
export async function POST(request: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody<Payload>(request);
  if (!body.ok) return body.response;

  const attestation = body.data?.response;
  if (!attestation || typeof attestation !== "object") {
    return jsonError("Die Antwort des Authenticators fehlt.", 400);
  }

  try {
    const credential = await confirmRegistration(
      auth.user.id,
      attestation,
      typeof body.data?.name === "string" ? body.data.name : null,
    );
    return NextResponse.json({
      ok: true,
      credential: {
        id: credential.id,
        name: credential.name,
        deviceType: credential.deviceType,
        backedUp: credential.backedUp,
        createdAt: credential.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof WebAuthnUnavailableError) return jsonError(error.message, 501);
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }
}
