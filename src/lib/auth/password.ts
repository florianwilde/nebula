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

/**
 * Arbeitsaufwand nach der Empfehlung des OWASP Password Storage Cheat Sheet:
 * N = 2^17, r = 8, p = 1. Frueher stand hier N = 2^15 mit p = 1 – das liegt
 * unter *jeder* der dort genannten zulaessigen Kombinationen (zu 2^15
 * gehoerte p = 3) und war damit rund dreimal billiger zu knacken als
 * vorgesehen.
 *
 * Gemessen kostet das rund 0,5 s je Pruefung und 128 MiB. Der Speicher
 * klingt nach viel, ist aber gedeckelt: Node rechnet scrypt im
 * libuv-Threadpool, standardmaessig vier Faeden parallel. Mehr als rund
 * 512 MiB koennen also nicht gleichzeitig belegt sein, und davor liegen
 * noch die Ratenbegrenzungen je IP und je Benutzername.
 */
const PARAMS = { N: 131072, r: 8, p: 1 };
const KEY_LENGTH = 64;
// scrypt braucht rund 128 * N * r Bytes – bei diesen Werten 128 MiB.
// Etwas Luft nach oben, damit die Pruefung nicht am Deckel scheitert.
const MAX_MEM = 192 * 1024 * 1024;

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
 * Ist der gespeicherte Hash mit schwaecheren Parametern erzeugt worden als
 * heute ueblich?
 *
 * Der Aufwand laesst sich nur fuer neue Passwoerter anheben – bestehende
 * Hashes bleiben sonst fuer immer auf dem alten Stand. OWASP empfiehlt
 * deshalb, bei der naechsten erfolgreichen Anmeldung still neu zu hashen.
 * Das geht nur dort, weil das Klartextpasswort ausschliesslich in diesem
 * Moment vorliegt.
 */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;

  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return true;

  // Verglichen wird der Gesamtaufwand, nicht Feld fuer Feld: N=2^16 mit p=2
  // ist nach OWASP genauso zulaessig wie N=2^17 mit p=1.
  return N * r * p < PARAMS.N * PARAMS.r * PARAMS.p;
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

/**
 * Naheliegende Passwoerter.
 *
 * ASVS 2.1.7 verlangt einen Abgleich gegen bekannte geleakte Passwoerter.
 * Ein Dienst wie Have-I-Been-Pwned schiede dafuer aus – Nebula ruft
 * grundsaetzlich nichts von aussen, und ein Passwort-Praefix nach draussen
 * zu geben widerspraeche dem erst recht. Diese Liste ist der Kompromiss:
 * die haeufigsten deutschen und englischen Kandidaten, dazu weiter unten
 * Muster statt Einzelwoerter, was mehr abdeckt als jede Liste dieser Groesse.
 */
const OBVIOUS = new Set([
  // Klassiker
  "password", "password1", "password123", "passwort", "passwort1",
  "passwort123", "kennwort", "geheim", "geheim123", "changeme", "letmein",
  "welcome", "willkommen", "willkommen1", "administrator", "admin1234",
  "iloveyou", "sunshine", "princess", "dragon", "monkey", "football",
  "baseball", "superman", "trustno1", "starwars", "whatever", "freedom",
  // Zahlen und Tastaturlaeufe
  "12345678", "123456789", "1234567890", "87654321", "11111111",
  "qwertzuiop", "qwertyuiop", "asdfghjkl", "qwertz123", "qwerty123",
  "1qay2wsx", "1q2w3e4r", "1q2w3e4r5t", "asdf1234", "qwer1234",
  // Deutsch
  "sommer2024", "sommer2025", "sommer2026", "winter2024", "winter2025",
  "winter2026", "fussball", "deutschland", "hallowelt", "sonnenschein",
  "schatz123", "liebling", "blumen123", "internet", "computer",
  // Projektnah
  "nebula", "nebula123", "nebula2026", "dashboard", "vibecoding",
]);

export { PASSWORD_MIN_LENGTH };

/**
 * Laenge der laengsten auf- oder absteigenden Zeichenfolge ("abcd", "4321").
 *
 * Zurueckgegeben wird die Laenge und nicht nur ein Ja/Nein: entscheidend ist,
 * *wie viel* des Passworts aus der Folge besteht. Ein "de" mitten in einem
 * Wort ist harmlos, "abcdefghijkl" ist das ganze Passwort.
 */
function laengsteFolge(wert: string): number {
  if (wert.length < 2) return wert.length;
  let beste = 1;
  let auf = 1;
  let ab = 1;
  for (let i = 1; i < wert.length; i += 1) {
    const schritt = wert.charCodeAt(i) - wert.charCodeAt(i - 1);
    auf = schritt === 1 ? auf + 1 : 1;
    ab = schritt === -1 ? ab + 1 : 1;
    beste = Math.max(beste, auf, ab);
  }
  return beste;
}

/**
 * Gibt eine Fehlermeldung zurueck oder null, wenn das Passwort taugt.
 *
 * Bewusst **keine** Zusammensetzungsregeln ("mindestens ein Sonderzeichen").
 * ASVS 2.1.9 raet ausdruecklich davon ab: sie treiben Leute zu "Passwort1!"
 * und senken die Entropie, statt sie zu heben. Geprueft wird stattdessen
 * auf Laenge und auf das, was nachweislich schwach ist.
 */
export function validatePasswordStrength(
  password: string,
  /** Benutzername des Kontos, falls bekannt – er darf nicht im Passwort stehen. */
  username?: string | null,
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen haben.`;
  }
  if (password.length > 200) {
    return "Das Passwort darf hoechstens 200 Zeichen haben.";
  }

  const klein = password.toLowerCase();

  if (OBVIOUS.has(klein)) {
    return "Dieses Passwort ist zu naheliegend.";
  }
  if (/^\d+$/.test(password)) {
    return "Nur Ziffern reichen nicht – bitte Buchstaben oder Zeichen ergaenzen.";
  }
  // Zu wenig verschiedene Zeichen – deckt "aaaaaaaa" ebenso ab wie
  // "abababab" oder "12121212", ohne dafuer je ein eigenes Muster zu
  // brauchen.
  if (new Set(klein).size <= 4) {
    return "Das Passwort benutzt zu wenige verschiedene Zeichen.";
  }
  // Und wenn der groesste Teil des Passworts eine durchlaufende Folge ist.
  if (laengsteFolge(klein) >= Math.max(6, Math.ceil(password.length * 0.6))) {
    return "Zeichenfolgen wie „abcd“ oder „4321“ sind zu leicht zu raten.";
  }
  // Ein Passwort, das den Benutzernamen enthaelt, ist der erste Versuch
  // jedes Angreifers.
  const name = username?.trim().toLowerCase();
  if (name && name.length >= 3 && klein.includes(name)) {
    return "Das Passwort darf den Benutzernamen nicht enthalten.";
  }

  return null;
}
