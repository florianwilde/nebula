import { describe, expect, it } from "vitest";
import { daysSince, isStaleDue } from "./stale";

/**
 * Die Entscheidung, wann ein Projekt als eingeschlafen gilt – und vor allem,
 * wann es *nicht* erneut gemeldet wird.
 */

const TAG = 86_400_000;
const jetzt = new Date("2026-07-26T12:00:00Z");
const vorTagen = (tage: number) => new Date(jetzt.getTime() - tage * TAG);
/** Schwelle: 60 Tage. */
const cutoff = vorTagen(60);

describe("isStaleDue", () => {
  it("meldet ein Projekt, dessen letzter Commit laenger zurueckliegt", () => {
    expect(isStaleDue({ notifiedStaleAt: null }, vorTagen(90), cutoff)).toBe(true);
  });

  it("meldet nichts innerhalb der Frist", () => {
    expect(isStaleDue({ notifiedStaleAt: null }, vorTagen(30), cutoff)).toBe(false);
  });

  it("meldet nichts genau an der Schwelle", () => {
    expect(isStaleDue({ notifiedStaleAt: null }, cutoff, cutoff)).toBe(false);
  });

  it("meldet nichts ohne bekannten letzten Commit", () => {
    // Ein Projekt ohne Repository oder ohne Snapshot laesst sich nicht
    // beurteilen – lieber schweigen als raten.
    expect(isStaleDue({ notifiedStaleAt: null }, null, cutoff)).toBe(false);
  });

  it("meldet dasselbe Projekt kein zweites Mal", () => {
    expect(isStaleDue({ notifiedStaleAt: vorTagen(5) }, vorTagen(90), cutoff)).toBe(false);
  });

  it("meldet erneut, wenn zwischendurch gearbeitet wurde und es wieder still ist", () => {
    // Gemeldet vor 200 Tagen, danach ein Commit vor 90 Tagen, seitdem Ruhe.
    expect(isStaleDue({ notifiedStaleAt: vorTagen(200) }, vorTagen(90), cutoff)).toBe(true);
  });

  it("meldet nicht erneut, wenn der Commit vor der letzten Meldung lag", () => {
    expect(isStaleDue({ notifiedStaleAt: vorTagen(10) }, vorTagen(90), cutoff)).toBe(false);
  });
});

describe("daysSince", () => {
  it("zaehlt volle Tage", () => {
    expect(daysSince(vorTagen(60), jetzt)).toBe(60);
    expect(daysSince(vorTagen(1), jetzt)).toBe(1);
  });

  it("rundet angebrochene Tage ab", () => {
    expect(daysSince(new Date(jetzt.getTime() - 1.9 * TAG), jetzt)).toBe(1);
  });

  it("liefert null fuer soeben", () => {
    expect(daysSince(jetzt, jetzt)).toBe(0);
  });
});
