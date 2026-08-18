import { describe, expect, it } from "vitest";
import { SEITE, SEITE_MAX, cursorAus, seitenBedingung, seitenGroesse } from "./timeline";

const ID = "cmstxnrzs00011cx4nd5tiqbt";

describe("cursorAus", () => {
  it("liest Zeitpunkt und ID", () => {
    const cursor = cursorAus("2026-08-17T22:30:00.000Z", ID);
    expect(cursor?.id).toBe(ID);
    expect(cursor?.createdAt.toISOString()).toBe("2026-08-17T22:30:00.000Z");
  });

  it("faengt ohne Cursor von vorn an", () => {
    expect(cursorAus(null, null)).toBeNull();
    expect(cursorAus("2026-08-17T22:30:00.000Z", null)).toBeNull();
    expect(cursorAus(null, ID)).toBeNull();
  });

  it("weist Unbrauchbares ab, statt es in die Abfrage zu geben", () => {
    expect(cursorAus("kein datum", ID)).toBeNull();
    expect(cursorAus("2026-08-17T22:30:00.000Z", "kurz")).toBeNull();
    expect(cursorAus("2026-08-17T22:30:00.000Z", "'; DROP TABLE x --")).toBeNull();
  });
});

describe("seitenBedingung", () => {
  it("filtert immer auf den Besitzer", () => {
    expect(seitenBedingung("u1", null)).toEqual({ project: { ownerId: "u1" } });
  });

  it("behaelt den Besitzer auch mit Cursor", () => {
    const wo = seitenBedingung("u1", { createdAt: new Date("2026-08-17T22:30:00Z"), id: ID });
    expect(wo.project).toEqual({ ownerId: "u1" });
  });

  it("fasst gleichzeitige Eintraege ueber die ID auseinander", () => {
    // Der eigentliche Zweck: beim Uebernehmen von Issues entstehen mehrere
    // Zeilen mit identischem createdAt. Ohne den zweiten Zweig wuerde die
    // naechste Seite sie ueberspringen oder wiederholen.
    const zeitpunkt = new Date("2026-08-17T22:30:00Z");
    const wo = seitenBedingung("u1", { createdAt: zeitpunkt, id: ID });
    expect(wo.OR).toEqual([
      { createdAt: { lt: zeitpunkt } },
      { createdAt: zeitpunkt, id: { lt: ID } },
    ]);
  });
});

describe("seitenGroesse", () => {
  it("nimmt die Vorgabe, wenn nichts angefragt wurde", () => {
    expect(seitenGroesse(null)).toBe(SEITE);
    expect(seitenGroesse("unsinn")).toBe(SEITE);
  });

  it("deckelt nach oben und unten", () => {
    expect(seitenGroesse("1000")).toBe(SEITE_MAX);
    expect(seitenGroesse("0")).toBe(1);
    expect(seitenGroesse("-5")).toBe(1);
  });

  it("nimmt einen gueltigen Wert an", () => {
    expect(seitenGroesse("25")).toBe(25);
  });
});
