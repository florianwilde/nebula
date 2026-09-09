import { describe, expect, it, vi } from "vitest";
import {
  CALENDAR_MAX_PAGES,
  CALENDAR_PAGE_SIZE,
  calendarByPaging,
  calendarSince,
  calendarTotal,
  dayKey,
} from "./calendar";

/**
 * Der Kalender darf ueber den Zeitraum nicht luegen. Reichen die geholten
 * Seiten nur ein paar Monate zurueck, faengt die Heatmap dort an – sie zeigt
 * dann keine leeren Felder fuer Zeiten, ueber die schlicht nichts bekannt ist.
 * Genau diesen Fehler hatte die Verlaufslinie schon einmal.
 */

const JETZT = new Date("2026-07-26T12:00:00.000Z");
const TAG = 86_400_000;

/**
 * Eine Quelle, die es nur eine Seite lang gibt.
 *
 * Diese Tests pruefen das Zaehlen und Filtern, nicht das Blaettern. Ihr
 * Fixture lieferte urspruenglich fuer *jede* Seite dieselben Daten und hielt
 * nur deshalb an, weil die alte Regel eine kurze Seite fuer die letzte hielt
 * – genau der Fehler, um den es hier geht. Kein Server verhaelt sich so;
 * nach der letzten Seite kommt nichts mehr.
 */
function eineSeite(daten: Array<string | null>) {
  return async (seite: number) => (seite === 1 ? daten : []);
}

/** Erzeugt n Commit-Zeitpunkte, beginnend vor `abTagen` Tagen, einer je Tag. */
function commits(anzahl: number, abTagen: number): string[] {
  return Array.from({ length: anzahl }, (_, index) =>
    new Date(JETZT.getTime() - (abTagen + index) * TAG).toISOString(),
  );
}

describe("dayKey", () => {
  it("liefert das Datum ohne Uhrzeit", () => {
    expect(dayKey(new Date("2026-07-26T23:59:00.000Z"))).toBe("2026-07-26");
  });
});

describe("calendarSince", () => {
  it("liegt ein Jahr zurueck", () => {
    const seit = calendarSince(JETZT);
    expect(Math.round((JETZT.getTime() - seit.getTime()) / TAG)).toBe(365);
  });
});

describe("calendarByPaging", () => {
  it("liefert null, wenn es keine Commits gibt", async () => {
    expect(await calendarByPaging(async () => [], JETZT)).toBeNull();
  });

  it("zaehlt mehrere Commits desselben Tages zusammen", async () => {
    const heute = JETZT.toISOString();
    const kalender = await calendarByPaging(eineSeite([heute, heute, heute]), JETZT);
    expect(kalender?.days["2026-07-26"]).toBe(3);
    expect(calendarTotal(kalender!)).toBe(3);
  });

  it("beginnt beim aeltesten bekannten Commit, nicht vor einem Jahr", async () => {
    // Nur eine halbe Seite, zehn Tage zurueck: alles davor ist unbekannt.
    const kalender = await calendarByPaging(eineSeite(commits(10, 0)), JETZT);
    expect(kalender?.from).toBe("2026-07-17");
    expect(kalender?.to).toBe("2026-07-26");
    expect(kalender?.truncated).toBe(false);
  });

  it("hoert auf, sobald eine Seite nicht mehr voll ist", async () => {
    const ladeSeite = vi.fn(async (seite: number) =>
      seite === 1 ? commits(CALENDAR_PAGE_SIZE, 0) : commits(5, CALENDAR_PAGE_SIZE),
    );
    await calendarByPaging(ladeSeite, JETZT);
    expect(ladeSeite).toHaveBeenCalledTimes(2);
  });

  it("deckelt die Zahl der Seiten und sagt es", async () => {
    // Immer volle Seiten innerhalb des Zeitraums: ohne Deckel liefe das ewig.
    const ladeSeite = vi.fn(async () =>
      Array.from({ length: CALENDAR_PAGE_SIZE }, () =>
        new Date(JETZT.getTime() - 3 * TAG).toISOString(),
      ),
    );
    const kalender = await calendarByPaging(ladeSeite, JETZT);
    expect(ladeSeite).toHaveBeenCalledTimes(CALENDAR_MAX_PAGES);
    expect(kalender?.truncated).toBe(true);
  });

  it("bricht ab, wenn eine ganze Seite aelter ist als der Zeitraum", async () => {
    const ladeSeite = vi.fn(async (seite: number) =>
      seite === 1
        ? commits(CALENDAR_PAGE_SIZE, 0)
        : Array.from({ length: CALENDAR_PAGE_SIZE }, () =>
            new Date(JETZT.getTime() - 400 * TAG).toISOString(),
          ),
    );
    await calendarByPaging(ladeSeite, JETZT);
    expect(ladeSeite).toHaveBeenCalledTimes(2);
  });

  it("uebergeht Commits mit Datum in der Zukunft", async () => {
    // Falsch gestellte Uhren gibt es; sie duerfen den Zeitraum nicht verlaengern.
    const kalender = await calendarByPaging(
      eineSeite([
        new Date(JETZT.getTime() + 5 * TAG).toISOString(),
        JETZT.toISOString(),
      ]),
      JETZT,
    );
    expect(kalender?.to).toBe("2026-07-26");
    expect(calendarTotal(kalender!)).toBe(1);
  });

  it("uebergeht Unbrauchbares, statt daran zu scheitern", async () => {
    const kalender = await calendarByPaging(
      eineSeite([null, "gestern", "", JETZT.toISOString()]),
      JETZT,
    );
    expect(calendarTotal(kalender!)).toBe(1);
  });

  it("laesst Tage ohne Commits weg", async () => {
    // Ein Jahr als Liste waeren 365 Eintraege, die meisten davon Nullen.
    const kalender = await calendarByPaging(
      eineSeite([JETZT.toISOString(), new Date(JETZT.getTime() - 30 * TAG).toISOString()]),
      JETZT,
    );
    expect(Object.keys(kalender!.days)).toHaveLength(2);
  });
});

/**
 * Gitea deckelt jede Antwort auf MAX_RESPONSE_ITEMS (Voreinstellung 50),
 * egal was angefragt wurde. Wer gegen die angefragten 100 vergleicht, haelt
 * dort jede erste Seite fuer die letzte: die Heatmap kannte nur die
 * juengsten 50 Commits und gab deren aeltesten als Anfang des Zeitraums aus.
 */
describe("calendarByPaging gegen eine deckelnde Gegenseite", () => {
  /** Antwortet nie mit mehr als `deckel` Eintraegen – wie Gitea. */
  function gedeckelteQuelle(gesamt: number, deckel: number) {
    const alle = commits(gesamt, 0);
    return vi.fn(async (seite: number) =>
      alle.slice((seite - 1) * deckel, seite * deckel),
    );
  }

  it("blaettert weiter, obwohl die Seite kleiner ist als angefragt", async () => {
    // 76 Commits bei einem Deckel von 50 – der Fall aus florian.wilde/flimmer.
    const ladeSeite = gedeckelteQuelle(76, 50);
    const kalender = await calendarByPaging(ladeSeite, JETZT);

    // Vorher: eine Seite, 50 Commits, "seit" beim 50. – und truncated false.
    expect(ladeSeite).toHaveBeenCalledTimes(2);
    expect(calendarTotal(kalender!)).toBe(76);
    expect(kalender?.truncated).toBe(false);
  });

  it("nimmt die erste Antwort als Maßstab, nicht die angefragte Groesse", async () => {
    // Selbst ein sehr kleiner Deckel darf nicht dazu fuehren, dass nach der
    // ersten Seite Schluss ist.
    const ladeSeite = gedeckelteQuelle(25, 10);
    const kalender = await calendarByPaging(ladeSeite, JETZT);

    expect(ladeSeite).toHaveBeenCalledTimes(3);
    expect(calendarTotal(kalender!)).toBe(25);
  });

  it("haelt den Deckel weiterhin ein", async () => {
    // Mehr Commits als CALENDAR_MAX_PAGES Seiten fassen: abbrechen, aber
    // ehrlich sein.
    const ladeSeite = gedeckelteQuelle(50 * CALENDAR_MAX_PAGES + 20, 50);
    const kalender = await calendarByPaging(ladeSeite, JETZT);

    expect(ladeSeite).toHaveBeenCalledTimes(CALENDAR_MAX_PAGES);
    expect(kalender?.truncated).toBe(true);
    expect(calendarTotal(kalender!)).toBe(50 * CALENDAR_MAX_PAGES);
  });

  it("meldet keine Kuerzung, wenn die Daten einfach zu Ende sind", async () => {
    // Genau eine volle Seite und dann nichts mehr: das ist kein Deckel.
    const ladeSeite = gedeckelteQuelle(50, 50);
    const kalender = await calendarByPaging(ladeSeite, JETZT);

    expect(ladeSeite).toHaveBeenCalledTimes(2);
    expect(kalender?.truncated).toBe(false);
  });
});
