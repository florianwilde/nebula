import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Wiederherstellungscodes fuer den Fall, dass der Authenticator verloren geht.
 *
 * Ohne sie waere die Zwei-Faktor-Anmeldung eine Falle: ein neues Handy, und
 * das Konto ist zu. Ein Administrator kann zwar aushelfen – im
 * Einzelbenutzerbetrieb ist der Administrator aber genau die ausgesperrte
 * Person.
 */

/** Wie viele Codes bei der Einrichtung erzeugt werden. */
export const RECOVERY_CODE_COUNT = 10;

/**
 * Alphabet ohne die Paare, die man beim Abschreiben verwechselt: kein O/0,
 * kein I/l/1, kein B/8. Die Codes werden von Hand aus einem Ausdruck oder
 * Passwortmanager uebertragen, oft unter Zeitdruck.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUP = 5;

/** Ein Code der Form "a7k2m-p9xqd" – rund 50 Bit Zufall. */
function generateCode(): string {
  const zeichen = Array.from(
    { length: GROUP * 2 },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
  return `${zeichen.slice(0, GROUP)}-${zeichen.slice(GROUP)}`;
}

/** Vereinheitlicht Eingaben: Grossschreibung und fehlender Bindestrich. */
export function normalizeCode(input: string): string {
  const clean = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.length !== GROUP * 2) return clean;
  return `${clean.slice(0, GROUP)}-${clean.slice(GROUP)}`;
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("base64url");
}

/**
 * Erzeugt einen frischen Satz und verwirft den alten. Gibt die Codes im
 * Klartext zurueck – das ist die einzige Gelegenheit, sie zu sehen.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateCode);

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashCode(code) })),
    }),
  ]);

  return codes;
}

/**
 * Loest einen Code ein. Ein Code gilt genau einmal; verbraucht wird er auch
 * dann, wenn die Anmeldung danach aus anderem Grund scheitert – lieber ein
 * Code zu viel verbraucht als einer, der zweimal geht.
 */
export async function redeemRecoveryCode(userId: string, input: string): Promise<boolean> {
  const eingabe = normalizeCode(input);
  if (eingabe.length < GROUP * 2) return false;

  const offen = await prisma.recoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  const gesucht = Buffer.from(hashCode(eingabe), "utf8");
  let treffer: string | null = null;
  for (const code of offen) {
    const vorhanden = Buffer.from(code.codeHash, "utf8");
    // Nicht abbrechen, sobald es passt: die Laufzeit soll nicht verraten,
    // an welcher Stelle der Liste der Code stand.
    if (vorhanden.length === gesucht.length && timingSafeEqual(vorhanden, gesucht)) {
      treffer = code.id;
    }
  }

  if (!treffer) return false;

  // updateMany mit der Bedingung "noch unbenutzt": zwei gleichzeitige
  // Versuche mit demselben Code koennen so nicht beide durchkommen.
  const result = await prisma.recoveryCode.updateMany({
    where: { id: treffer, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count === 1;
}

/** Wie viele Codes noch ungenutzt sind – fuer den Hinweis im Konto. */
export async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}
