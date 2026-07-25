import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Credential, User } from "@prisma/client";
import { APP_NAME, WEBAUTHN_AVAILABLE, WEBAUTHN_ORIGIN, WEBAUTHN_RP_ID } from "@/lib/config";
import { prisma } from "@/lib/db";

/**
 * Passkeys (WebAuthn).
 *
 * Die Challenge liegt in der Datenbank statt in einem Cookie: so laesst sie
 * sich nach einmaligem Gebrauch sicher loeschen und kann nicht erneut
 * eingespielt werden. Ausserdem funktioniert das ueber mehrere Prozesse.
 *
 * rpID und Origin kommen aus APP_URL. Passkeys sind an die rpID gebunden –
 * wird APP_URL auf einen anderen Hostnamen geaendert, muessen die Passkeys
 * neu angelegt werden.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export class WebAuthnUnavailableError extends Error {
  constructor() {
    super(
      "Passkeys benoetigen einen sicheren Kontext. Bitte APP_URL auf eine " +
        "https-Adresse (oder http://localhost) setzen.",
    );
    this.name = "WebAuthnUnavailableError";
  }
}

function assertAvailable() {
  if (!WEBAUTHN_AVAILABLE) throw new WebAuthnUnavailableError();
}

async function storeChallenge(
  challenge: string,
  purpose: "registration" | "authentication",
  userId: string | null,
) {
  // Abgelaufene Challenges bei der Gelegenheit entfernen.
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.webAuthnChallenge.create({
    data: {
      challenge,
      purpose,
      userId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

/** Holt die Challenge und loescht sie sofort – jede gilt genau einmal. */
async function consumeChallenge(
  challenge: string,
  purpose: "registration" | "authentication",
): Promise<{ userId: string | null } | null> {
  const stored = await prisma.webAuthnChallenge.findUnique({ where: { challenge } });
  if (!stored) return null;

  await prisma.webAuthnChallenge.delete({ where: { id: stored.id } }).catch(() => undefined);

  if (stored.purpose !== purpose) return null;
  if (stored.expiresAt.getTime() <= Date.now()) return null;

  return { userId: stored.userId };
}

// ── Registrierung eines neuen Passkeys ───────────────────────

export async function buildRegistrationOptions(
  user: Pick<User, "id" | "username" | "displayName">,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  assertAvailable();

  const existing = await prisma.credential.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: APP_NAME,
    rpID: WEBAUTHN_RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.username,
    userDisplayName: user.displayName ?? user.username,
    attestationType: "none",
    // Bereits registrierte Passkeys ausschliessen, damit derselbe
    // Authenticator nicht doppelt hinterlegt wird.
    excludeCredentials: existing.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await storeChallenge(options.challenge, "registration", user.id);
  return options;
}

export async function confirmRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  name: string | null,
): Promise<Credential> {
  assertAvailable();

  const expectedChallenge = response.response.clientDataJSON
    ? decodeChallenge(response.response.clientDataJSON)
    : null;
  if (!expectedChallenge) {
    throw new Error("Die Antwort des Authenticators enthaelt keine Challenge.");
  }

  const stored = await consumeChallenge(expectedChallenge, "registration");
  if (!stored) {
    throw new Error("Die Challenge ist abgelaufen oder wurde bereits verwendet.");
  }
  if (stored.userId !== userId) {
    throw new Error("Die Challenge gehoert zu einem anderen Konto.");
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: WEBAUTHN_ORIGIN,
    expectedRPID: WEBAUTHN_RP_ID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Der Passkey konnte nicht bestaetigt werden.");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  return prisma.credential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? []) as string[],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: name?.trim() || null,
    },
  });
}

// ── Anmeldung per Passkey ────────────────────────────────────

/**
 * Ohne allowCredentials: der Browser bietet alle passenden, auffindbaren
 * Passkeys an. Der Benutzername muss also nicht eingegeben werden.
 */
export async function buildAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  assertAvailable();

  const options = await generateAuthenticationOptions({
    rpID: WEBAUTHN_RP_ID,
    userVerification: "preferred",
  });

  await storeChallenge(options.challenge, "authentication", null);
  return options;
}

export interface PasskeyLoginResult {
  userId: string;
  credentialId: string;
}

export async function confirmAuthentication(
  response: AuthenticationResponseJSON,
): Promise<PasskeyLoginResult> {
  assertAvailable();

  const expectedChallenge = decodeChallenge(response.response.clientDataJSON);
  if (!expectedChallenge) {
    throw new Error("Die Antwort des Authenticators enthaelt keine Challenge.");
  }

  const stored = await consumeChallenge(expectedChallenge, "authentication");
  if (!stored) {
    throw new Error("Die Challenge ist abgelaufen oder wurde bereits verwendet.");
  }

  const credential = await prisma.credential.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  });
  if (!credential) {
    throw new Error("Dieser Passkey ist hier nicht hinterlegt.");
  }
  if (!credential.user.isActive) {
    throw new Error("Das Konto ist deaktiviert.");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: WEBAUTHN_ORIGIN,
    expectedRPID: WEBAUTHN_RP_ID,
    requireUserVerification: false,
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransportFuture[],
    },
  });

  if (!verification.verified) {
    throw new Error("Der Passkey konnte nicht bestaetigt werden.");
  }

  // Zaehler fortschreiben – ein Ruecksprung deutet auf einen Klon hin,
  // SimpleWebAuthn wirft in dem Fall bereits oben.
  await prisma.credential.update({
    where: { id: credential.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  return { userId: credential.userId, credentialId: credential.credentialId };
}

/**
 * Liest die Challenge aus clientDataJSON. Die Bibliothek prueft sie zwar
 * selbst, wir brauchen sie aber vorher, um den passenden Datenbankeintrag
 * zu finden und zu entwerten.
 */
function decodeChallenge(clientDataJSON: string): string | null {
  try {
    const json = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as {
      challenge?: string;
    };
    return typeof json.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}
