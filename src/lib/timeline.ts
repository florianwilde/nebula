import type { Prisma } from "@prisma/client";

/**
 * Fortlaufender Verlauf ueber alle Projekte.
 *
 * Geblaettert wird per Cursor, nicht per `skip`. Der Verlauf schreibt
 * mehrere Eintraege im selben Augenblick – beim Uebernehmen von Issues etwa
 * entstehen zehn Zeilen mit identischem `createdAt`. Ein Offset ueber eine
 * solche Grenze hinweg ueberspringt Zeilen oder zeigt sie zweimal, und zwar
 * lautlos. Der Cursor aus (createdAt, id) ist dagegen eindeutig.
 */

/** Wie viele Eintraege eine Seite hat. */
export const SEITE = 40;
/** Deckel gegen einen Aufrufer, der sich alles auf einmal holen will. */
export const SEITE_MAX = 100;

export interface Cursor {
  /** Zeitpunkt des letzten gezeigten Eintrags. */
  createdAt: Date;
  /** Seine ID – entscheidet bei gleichem Zeitpunkt. */
  id: string;
}

/**
 * Liest einen Cursor aus Abfrageparametern.
 *
 * Gibt null zurueck, wenn nichts oder Unbrauchbares ankommt – dann faengt
 * die Seite eben von vorn an. Ein Fehler waere hier die schlechtere Antwort:
 * ein abgeschnittener Verweis soll die Seite nicht sperren.
 */
export function cursorAus(vor: string | null, id: string | null): Cursor | null {
  if (!vor || !id) return null;
  const zeitpunkt = new Date(vor);
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  // Die ID ist eine cuid; alles andere weisen wir ab, statt es in die
  // Abfrage zu geben.
  if (!/^[a-z0-9]{20,32}$/i.test(id)) return null;
  return { createdAt: zeitpunkt, id };
}

/**
 * Die where-Bedingung fuer eine Seite.
 *
 * Besitzer zuerst – wie ueberall im Projekt, damit fremde Datensaetze gar
 * nicht erst getroffen werden. Der Verlauf selbst kennt keinen Besitzer, die
 * Bedingung laeuft deshalb ueber das Projekt.
 *
 * Der Cursor bedeutet "aelter als der letzte gezeigte Eintrag": entweder
 * frueher, oder gleichzeitig und mit kleinerer ID. Genau so sortiert auch
 * die Abfrage, weshalb beides zusammenpasst.
 */
export function seitenBedingung(ownerId: string, cursor: Cursor | null): Prisma.ActivityWhereInput {
  const basis: Prisma.ActivityWhereInput = { project: { ownerId } };
  if (!cursor) return basis;

  return {
    ...basis,
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/** Sortierung, die zur Cursor-Bedingung passt. Beide muessen gleich sein. */
export const SEITEN_ORDNUNG: Prisma.ActivityOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

/** Begrenzt eine gewuenschte Seitengroesse auf das Erlaubte. */
export function seitenGroesse(roh: string | null): number {
  const angefragt = roh === null ? Number.NaN : Number(roh);
  if (!Number.isFinite(angefragt)) return SEITE;
  return Math.min(Math.max(Math.trunc(angefragt), 1), SEITE_MAX);
}
