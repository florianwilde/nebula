import { describe, expect, it } from "vitest";
import {
  berlinMitternacht,
  tagesschluessel,
  wocheUm,
  wochenName,
  wochenTitel,
  zaehleWoche,
} from "./review";

describe("tagesschluessel", () => {
  it("rechnet in Berliner Kalendertagen, nicht in UTC", () => {
    // 22:30 UTC ist in Berlin schon der Folgetag (Sommerzeit, UTC+2).
    expect(tagesschluessel(new Date("2026-08-17T22:30:00Z"))).toBe("2026-08-18");
    expect(tagesschluessel(new Date("2026-08-17T21:00:00Z"))).toBe("2026-08-17");
  });
});

describe("berlinMitternacht", () => {
  it("trifft den Sommerzeit-Beginn des Tages", () => {
    // Sommerzeit: Berlin = UTC+2, Mitternacht dort ist 22:00 UTC am Vortag.
    expect(berlinMitternacht("2026-08-17").toISOString()).toBe("2026-08-16T22:00:00.000Z");
  });

  it("trifft den Winterzeit-Beginn des Tages", () => {
    // Winterzeit: UTC+1.
    expect(berlinMitternacht("2026-01-12").toISOString()).toBe("2026-01-11T23:00:00.000Z");
  });
});

describe("wocheUm", () => {
  /** Ein Dienstag. */
  const DIENSTAG = new Date("2026-08-18T09:00:00Z");

  it("beginnt am Montag und endet am folgenden Montag", () => {
    const woche = wocheUm(DIENSTAG);
    expect(woche.tage[0]).toBe("2026-08-17");
    expect(woche.tage[6]).toBe("2026-08-23");
    expect(woche.tage).toHaveLength(7);
    expect(woche.von.toISOString()).toBe("2026-08-16T22:00:00.000Z");
    expect(woche.bis.toISOString()).toBe("2026-08-23T22:00:00.000Z");
  });

  it("zaehlt den Montag selbst zur laufenden Woche", () => {
    const montag = new Date("2026-08-17T06:00:00Z");
    expect(wocheUm(montag).tage[0]).toBe("2026-08-17");
  });

  it("zaehlt den Sonntagabend noch zur ablaufenden Woche", () => {
    // 21:00 UTC am Sonntag ist in Berlin 23:00 – noch derselbe Tag.
    const sonntagAbend = new Date("2026-08-23T21:00:00Z");
    expect(wocheUm(sonntagAbend).tage[0]).toBe("2026-08-17");
    // Zwei Stunden spaeter ist Montag und damit die naechste Woche.
    const montagFrueh = new Date("2026-08-23T22:30:00Z");
    expect(wocheUm(montagFrueh).tage[0]).toBe("2026-08-24");
  });

  it("blättert rückwärts", () => {
    expect(wocheUm(DIENSTAG, -1).tage[0]).toBe("2026-08-10");
    expect(wocheUm(DIENSTAG, -3).tage[0]).toBe("2026-07-27");
  });

  it("kommt über den Monats- und Jahreswechsel", () => {
    const neujahr = new Date("2027-01-01T12:00:00Z"); // ein Freitag
    const woche = wocheUm(neujahr);
    expect(woche.tage[0]).toBe("2026-12-28");
    expect(woche.tage[6]).toBe("2027-01-03");
  });

  it("bleibt über die Zeitumstellung hinweg sieben Tage lang", () => {
    // Am 25.10.2026 wird auf Winterzeit zurueckgestellt – die Woche hat
    // dann 169 Stunden. "von + 7 Tage" waere hier eine Stunde daneben.
    const inDerWoche = new Date("2026-10-21T12:00:00Z");
    const woche = wocheUm(inDerWoche);
    expect(woche.tage[0]).toBe("2026-10-19");
    expect(woche.tage[6]).toBe("2026-10-25");
    const stunden = (woche.bis.getTime() - woche.von.getTime()) / 3_600_000;
    expect(stunden).toBe(169);
  });

  it("liefert bei der Umstellung im Fruehjahr 167 Stunden", () => {
    // Vorgestellt wird am letzten Sonntag im Maerz – 2026 ist das der 29.,
    // er liegt also in der Woche ab Montag, dem 23.
    const inDerWoche = new Date("2026-03-25T12:00:00Z");
    const woche = wocheUm(inDerWoche);
    expect(woche.tage[0]).toBe("2026-03-23");
    expect(woche.tage[6]).toBe("2026-03-29");
    const stunden = (woche.bis.getTime() - woche.von.getTime()) / 3_600_000;
    expect(stunden).toBe(167);
  });

  it("hat in einer Woche ohne Umstellung genau 168 Stunden", () => {
    const woche = wocheUm(new Date("2026-03-31T12:00:00Z"));
    expect(woche.tage[0]).toBe("2026-03-30");
    expect((woche.bis.getTime() - woche.von.getTime()) / 3_600_000).toBe(168);
  });
});

describe("Beschriftung", () => {
  const DIENSTAG = new Date("2026-08-18T09:00:00Z");

  it("nennt die laufende und die vorige Woche beim Namen", () => {
    expect(wochenName(wocheUm(DIENSTAG))).toBe("Diese Woche");
    expect(wochenName(wocheUm(DIENSTAG, -1))).toBe("Vorige Woche");
  });

  it("nennt weiter zurueckliegende Wochen mit Zeitraum", () => {
    expect(wochenName(wocheUm(DIENSTAG, -2))).toMatch(/\d/);
  });

  it("nennt den Monat nur einmal, wenn die Woche nicht darueber hinausgeht", () => {
    expect(wochenTitel(wocheUm(DIENSTAG))).toBe("17.–23. August 2026");
  });

  it("nennt beide Monate, wenn die Woche sie ueberspannt", () => {
    // 31.08. bis 06.09.2026.
    const woche = wocheUm(new Date("2026-09-02T12:00:00Z"));
    expect(wochenTitel(woche)).toBe("31. August–6. September 2026");
  });
});

describe("zaehleWoche", () => {
  const eintrag = (
    kind: Parameters<typeof zaehleWoche>[0][number]["kind"],
    projectId: string,
    meta?: unknown,
  ) => ({ kind, projectId, meta });

  it("zaehlt Erledigtes am meta-Feld, nicht am Text", () => {
    const zahlen = zaehleWoche([
      eintrag("TASK_MOVED", "p1", { from: "TODO", to: "DONE" }),
      // Verschoben, aber nicht erledigt – darf nicht mitzaehlen.
      eintrag("TASK_MOVED", "p1", { from: "TODO", to: "DOING" }),
    ]);
    expect(zahlen.erledigt).toBe(1);
  });

  it("zaehlt einen Eintrag ohne meta nicht als erledigt", () => {
    // Aeltere Eintraege koennen kein "to" haben. Lieber untertreiben als
    // eine Zahl behaupten, die aus dem Anzeigetext geraten waere.
    expect(zaehleWoche([eintrag("TASK_MOVED", "p1")]).erledigt).toBe(0);
    expect(zaehleWoche([eintrag("TASK_MOVED", "p1", "unsinn")]).erledigt).toBe(0);
  });

  it("zaehlt neue Aufgaben aus beiden Quellen", () => {
    const zahlen = zaehleWoche([
      eintrag("TASK_ADDED", "p1"),
      eintrag("TASKS_IMPORTED", "p2"),
    ]);
    expect(zahlen.neueAufgaben).toBe(2);
  });

  it("zaehlt beruehrte Projekte ohne Dubletten", () => {
    const zahlen = zaehleWoche([
      eintrag("NOTE_ADDED", "p1"),
      eintrag("NOTE_ADDED", "p1"),
      eintrag("REPO_COMMITS", "p2"),
    ]);
    expect(zahlen.projekte).toBe(2);
    expect(zahlen.notizen).toBe(2);
    expect(zahlen.gesamt).toBe(3);
  });

  it("kommt mit einer leeren Woche zurecht", () => {
    expect(zaehleWoche([])).toEqual({
      gesamt: 0,
      projekte: 0,
      erledigt: 0,
      neueAufgaben: 0,
      notizen: 0,
    });
  });
});
