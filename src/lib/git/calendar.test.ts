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
    const kalender = await calendarByPaging(async () => [heute, heute, heute], JETZT);
    expect(kalender?.days["2026-07-26"]).toBe(3);
    expect(calendarTotal(kalender!)).toBe(3);
  });

  it("beginnt beim aeltesten bekannten Commit, nicht vor einem Jahr", async () => {
    // Nur eine halbe Seite, zehn Tage zurueck: alles davor ist unbekannt.
    const kalender = await calendarByPaging(async () => commits(10, 0), JETZT);
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
      async () => [
        new Date(JETZT.getTime() + 5 * TAG).toISOString(),
        JETZT.toISOString(),
      ],
      JETZT,
    );
    expect(kalender?.to).toBe("2026-07-26");
    expect(calendarTotal(kalender!)).toBe(1);
  });

  it("uebergeht Unbrauchbares, statt daran zu scheitern", async () => {
    const kalender = await calendarByPaging(
      async () => [null, "gestern", "", JETZT.toISOString()],
      JETZT,
    );
    expect(calendarTotal(kalender!)).toBe(1);
  });

  it("laesst Tage ohne Commits weg", async () => {
    // Ein Jahr als Liste waeren 365 Eintraege, die meisten davon Nullen.
    const kalender = await calendarByPaging(
      async () => [JETZT.toISOString(), new Date(JETZT.getTime() - 30 * TAG).toISOString()],
      JETZT,
    );
    expect(Object.keys(kalender!.days)).toHaveLength(2);
  });
});
