import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";

/**
 * Passwort-Hashing mit scrypt aus der Node-Standardbibliothek – kein
 * zusaetzliches natives Modul noetig, und scrypt ist speicherhart, also
 * deutlich unangenehmer fuer GPU-Angriffe als PBKDF2.
 *
 * Ablageformat:  scrypt$<N>$<r>$<p>$<salt>$<hash>   (salt/hash base64url)
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 64;
// scrypt braucht rund 128 * N * r Bytes; der Standardwert von 32 MB reicht
// dafuer nicht ganz.
const MAX_MEM = 96 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");

  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM,
    });
  } catch {
    return false;
  }

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Verbrennt vergleichbar viel Zeit wie eine echte Pruefung. Wird aufgerufen,
 * wenn es den Benutzernamen gar nicht gibt – sonst liesse sich an der
 * Antwortzeit ablesen, welche Konten existieren.
 */
export async function fakeVerifyDelay(): Promise<void> {
  await scrypt("nebula-dummy-password", "nebula-dummy-salt", KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });
}

const OBVIOUS = new Set([
  "password", "passwort", "12345678", "123456789", "1234567890",
  "qwertzuiop", "qwertyuiop", "administrator", "changeme", "letmein",
  "willkommen", "nebula123", "geheim123",
]);

export { PASSWORD_MIN_LENGTH };

/** Gibt eine Fehlermeldung zurueck oder null, wenn das Passwort taugt. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen haben.`;
  }
  if (password.length > 200) {
    return "Das Passwort darf hoechstens 200 Zeichen haben.";
  }
  if (OBVIOUS.has(password.toLowerCase())) {
    return "Dieses Passwort ist zu naheliegend.";
  }
  if (/^\d+$/.test(password)) {
    return "Nur Ziffern reichen nicht – bitte Buchstaben oder Zeichen ergaenzen.";
  }
  return null;
}
