import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Verschluesselung der Git-Access-Tokens.
 *
 * Format des Chiffrats:  v1.<iv>.<authTag>.<ciphertext>   (jeweils base64url)
 *
 * Der Schluessel wird per scrypt aus APP_SECRET abgeleitet. Ohne gesetztes
 * APP_SECRET wird ein Entwicklungs-Fallback benutzt – dann warnt die App
 * beim Start, weil Tokens sonst faktisch im Klartext liegen.
 */

const DEV_FALLBACK_SECRET = "nebula-dev-secret-please-set-APP_SECRET";
const SALT = "nebula.token.v1";
const VERSION = "v1";

let warned = false;

function secret(): string {
  const value = process.env.APP_SECRET;
  if (value && value.length >= 16) return value;

  if (!warned) {
    warned = true;
    console.warn(
      "[nebula] APP_SECRET ist nicht (ausreichend) gesetzt – es wird ein unsicherer " +
        "Entwicklungsschluessel verwendet. Bitte APP_SECRET in der .env setzen.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

function key(): Buffer {
  return scryptSync(secret(), SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Ungueltiges Token-Format");
  }
  const [, ivPart, tagPart, dataPart] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Entschluesselt und schluckt Fehler – z. B. wenn APP_SECRET gewechselt wurde. */
export function tryDecryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decryptSecret(payload);
  } catch {
    return null;
  }
}

/** Verkuerzte Darstellung fuer die UI: "ghp_…9f3a". */
export function tokenHint(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
