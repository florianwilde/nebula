import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Zeitbasierte Einmalkennwoerter nach RFC 6238 (TOTP über HMAC-SHA1).
 *
 * Selbst gerechnet statt als Abhaengigkeit: es sind wenige Zeilen, das
 * Verfahren steht seit 2011 fest, und der RFC bringt Testvektoren mit –
 * die Richtigkeit laesst sich also beweisen statt nur behaupten
 * (siehe totp.test.ts).
 *
 * SHA-1 ist hier kein Mangel. Es geht nicht um Kollisionsresistenz, sondern
 * um HMAC mit einem geheimen Schluessel, und jede Authenticator-App der Welt
 * erwartet genau diese Voreinstellung.
 */

/** Stellenzahl des Codes. */
export const TOTP_DIGITS = 6;
/** Laenge eines Zeitfensters in Sekunden. */
export const TOTP_PERIOD = 30;
/**
 * Wie viele Fenster in jede Richtung zusaetzlich gelten. Eines deckt eine um
 * bis zu 30 Sekunden falsch gehende Uhr ab – mehr wuerde den Zeitraum
 * unnoetig verbreitern, in dem ein abgefangener Code noch taugt.
 */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 nach RFC 4648, ohne Auffuellzeichen – so erwarten es die Apps. */
export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  // Leerzeichen und Auffuellzeichen grosszuegig hinnehmen: Benutzer tippen
  // den Schluessel gelegentlich aus einer Anzeige in Vierergruppen ab.
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Ungueltiges Zeichen im Base32-Schluessel");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Neuer Schluessel. 20 Byte entsprechen der Empfehlung des RFC fuer
 * HMAC-SHA1 und ergeben 32 Base32-Zeichen.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Der Code fuer ein bestimmtes Zeitfenster. */
export function totpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);

  // Zaehler als 8-Byte-Zahl in Big-Endian. BigInt, weil er theoretisch
  // ueber 2^32 hinausgeht – praktisch erst in einigen tausend Jahren, aber
  // die Bitschieberei mit Zahlen waere hier ohnehin heikel.
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", key).update(buffer).digest();

  // Dynamic Truncation nach RFC 4226, Abschnitt 5.3.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Das Zeitfenster, in dem ein Zeitpunkt liegt. */
export function counterFor(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / TOTP_PERIOD);
}

/**
 * Prueft einen eingegebenen Code und gibt das Zeitfenster zurueck, das
 * gepasst hat – oder null.
 *
 * Das Fenster wird gebraucht, um einen verbrauchten Code zu entwerten:
 * RFC 6238 verlangt in Abschnitt 5.2 ausdruecklich, dass derselbe Code kein
 * zweites Mal angenommen wird. Ohne diese Zahl liesse sich ein abgefangener
 * Code die restliche Gueltigkeitsdauer ueber wiederverwenden.
 *
 * Verglichen wird in konstanter Zeit, und die Nachbarfenster werden
 * mitprobiert, damit eine leicht abweichende Uhr nicht stoert.
 */
export function matchTotp(
  secret: string,
  code: string,
  at: Date = new Date(),
  window: number = TOTP_WINDOW,
): number | null {
  const eingabe = code.replace(/\s/g, "");
  if (!/^\d+$/.test(eingabe) || eingabe.length !== TOTP_DIGITS) return null;

  const jetzt = counterFor(at);
  let treffer: number | null = null;
  for (let schritt = -window; schritt <= window; schritt += 1) {
    // Nicht fruehzeitig abbrechen: sonst haengt die Laufzeit davon ab,
    // welches Fenster gepasst hat.
    if (constantEquals(totpCode(secret, jetzt + schritt), eingabe)) treffer = jetzt + schritt;
  }
  return treffer;
}

/** Wie matchTotp, wenn nur interessiert *ob* der Code stimmt. */
export function verifyTotp(
  secret: string,
  code: string,
  at: Date = new Date(),
  window: number = TOTP_WINDOW,
): boolean {
  return matchTotp(secret, code, at, window) !== null;
}

function constantEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Die URI, die als QR-Code angezeigt wird. Das Label enthaelt sowohl den
 * Aussteller als auch das Konto – so schreiben es die Authenticator-Apps
 * vor, sonst steht in der Liste nur ein nackter Benutzername.
 */
export function otpauthUri(options: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = `${options.issuer}:${options.account}`;
  const query = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

/** Der Schluessel in Vierergruppen – zum Abtippen, wenn die Kamera streikt. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
