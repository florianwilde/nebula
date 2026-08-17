import type { ActivityKind } from "@prisma/client";

/**
 * Wochenrueckblick: welche Woche, und was zaehlt darin.
 *
 * Die Wochenrechnung steht hier als reine Funktion und nicht in der Seite –
 * Wochengrenzen sind der Teil, der still falsch wird, und so laesst er sich
 * pruefen.
 */

/** Wochenbeginn ist Montag, wie in Deutschland ueblich (ISO 8601). */
export const WOCHENBEGINN = 1;

/**
 * Kalendertag in fester Zeitzone.
 *
 * Dieselbe Ueberlegung wie bei den Faelligkeiten in lib/tasks: im Container
 * laeuft die Anwendung nach UTC. Um 23:30 Berliner Zeit waere dort noch der
 * Vortag, und ein Eintrag von Sonntagabend fiele in die falsche Woche.
 */
const TAG_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-08-17" in Berliner Zeit. */
export function tagesschluessel(wert: Date): string {
  return TAG_FORMAT.format(wert);
}

/** Wochentag in Berliner Zeit, 0 = Sonntag. */
function wochentag(wert: Date): number {
  const [jahr, monat, tag] = tagesschluessel(wert).split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, tag)).getUTCDay();
}

export interface Woche {
  /** Beginn des Montags, als Zeitpunkt fuer die Abfrage. */
  von: Date;
  /** Beginn des folgenden Montags – ausschliesslich. */
  bis: Date;
  /** 0 = laufende Woche, -1 = vorige, … */
  versatz: number;
  /** Die sieben Kalendertage der Woche, Montag zuerst. */
  tage: string[];
}

/**
 * Grenzen der Woche, in der `jetzt` liegt – um `versatz` Wochen verschoben.
 *
 * Gerechnet wird ueber die Kalendertage in Berliner Zeit und dann in UTC
 * zurueckgerechnet. Der Umweg ist noetig, weil zwischen zwei Montagen eine
 * Zeitumstellung liegen kann: "sieben mal 24 Stunden" waere dann um eine
 * Stunde daneben.
 */
export function wocheUm(jetzt: Date, versatz = 0): Woche {
  const [jahr, monat, tag] = tagesschluessel(jetzt).split("-").map(Number);
  const heuteUtc = Date.UTC(jahr, monat - 1, tag);

  // Rueckwaerts bis zum Montag.
  const abstandZumMontag = (wochentag(jetzt) - WOCHENBEGINN + 7) % 7;
  const montag = new Date(heuteUtc - (abstandZumMontag - versatz * 7) * 86_400_000);

  const tage: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    tage.push(new Date(montag.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  }

  const von = berlinMitternacht(tage[0]);
  return {
    von,
    // Ende ist die Mitternacht *nach* dem Sonntag – nicht "von + 7 Tage":
    // liegt eine Zeitumstellung dazwischen, ist die Woche 167 oder 169
    // Stunden lang.
    bis: berlinMitternacht(naechsterTag(tage[6])),
    versatz,
    tage,
  };
}

/** Ein Kalendertag weiter, rein auf der Zeichenkette gerechnet. */
function naechsterTag(tag: string): string {
  const [j, m, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Um wie viel geht die Berliner Uhr zu diesem Zeitpunkt der UTC voraus?
 *
 * Ermittelt statt fest verdrahtet, weil zwischen Sommer- und Winterzeit eine
 * Stunde Unterschied liegt und ein Rueckblick ueber die Umstellung hinweg
 * sonst um eine Stunde verrutscht.
 */
function zonenversatzMs(zeitpunkt: Date): number {
  // sv-SE liefert "2026-08-17 14:30:00" – nah genug an ISO, um es nach dem
  // Austausch des Leerzeichens wieder einlesen zu koennen.
  const berlin = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(zeitpunkt);
  return Date.parse(`${berlin.replace(" ", "T")}Z`) - zeitpunkt.getTime();
}

/** Der Zeitpunkt, an dem in Berlin dieser Kalendertag beginnt. */
export function berlinMitternacht(tag: string): Date {
  const basis = new Date(`${tag}T00:00:00Z`);
  // Die Umstellung findet nachts um zwei statt, nie um Mitternacht – der
  // Versatz an dieser Stelle ist also eindeutig.
  return new Date(basis.getTime() - zonenversatzMs(basis));
}

export interface Kennzahlen {
  gesamt: number;
  projekte: number;
  erledigt: number;
  neueAufgaben: number;
  notizen: number;
}

/** Was ein Verlaufseintrag fuer die Zaehlung hergeben muss. */
export interface ZaehlbarerEintrag {
  kind: ActivityKind;
  projectId: string;
  meta?: unknown;
}

/**
 * Kennzahlen einer Woche.
 *
 * "Erledigt" kommt aus dem `meta`-Feld (`to: "DONE"`) und nicht aus dem
 * Anzeigetext. Der Text ist zum Lesen da und aendert sich mit der
 * Formulierung – eine Zaehlung, die daran haengt, wird beim naechsten
 * umformulierten Einzeiler still falsch.
 *
 * Fuer aeltere Eintraege ohne `to` bleibt ein Rueckfall auf den Text: der
 * Verlauf haelt bis zu 200 Eintraege je Projekt, darunter also durchaus
 * welche von vor dieser Aenderung.
 */
export function zaehleWoche(eintraege: ZaehlbarerEintrag[]): Kennzahlen {
  let erledigt = 0;
  let neueAufgaben = 0;
  let notizen = 0;
  const projekte = new Set<string>();

  for (const eintrag of eintraege) {
    projekte.add(eintrag.projectId);

    if (eintrag.kind === "TASK_ADDED" || eintrag.kind === "TASKS_IMPORTED") {
      neueAufgaben += 1;
    } else if (eintrag.kind === "NOTE_ADDED") {
      notizen += 1;
    } else if (eintrag.kind === "TASK_MOVED" && istErledigt(eintrag)) {
      erledigt += 1;
    }
  }

  return { gesamt: eintraege.length, projekte: projekte.size, erledigt, neueAufgaben, notizen };
}

function istErledigt(eintrag: ZaehlbarerEintrag): boolean {
  const meta = eintrag.meta;
  if (meta && typeof meta === "object" && "to" in meta) {
    return (meta as { to?: unknown }).to === "DONE";
  }
  return false;
}

const MONAT_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  month: "long",
});

/**
 * Beschriftung einer Woche: "17.–23. August 2026", ueber einen
 * Monatswechsel hinweg "31. August–6. September 2026".
 *
 * Der Punkt hinter der Tageszahl kommt von Hand: Intl liefert bei
 * `day: "numeric"` nur die Ziffer, und mit `day: "2-digit"` staende dort
 * "07." statt "7.".
 */
export function wochenTitel(woche: Woche): string {
  const teile = (tag: string) => {
    const [j, m, t] = tag.split("-").map(Number);
    return { tag: t, monat: MONAT_FORMAT.format(new Date(Date.UTC(j, m - 1, t, 12))), jahr: j };
  };

  const von = teile(woche.tage[0]);
  const bis = teile(woche.tage[6]);
  const gleicherMonat = von.monat === bis.monat && von.jahr === bis.jahr;

  const links = gleicherMonat ? `${von.tag}.` : `${von.tag}. ${von.monat}`;
  return `${links}–${bis.tag}. ${bis.monat} ${bis.jahr}`;
}

/** "Diese Woche", "Vorige Woche", sonst der Zeitraum. */
export function wochenName(woche: Woche): string {
  if (woche.versatz === 0) return "Diese Woche";
  if (woche.versatz === -1) return "Vorige Woche";
  return wochenTitel(woche);
}
