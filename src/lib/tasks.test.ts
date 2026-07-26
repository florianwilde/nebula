import { describe, expect, it } from "vitest";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  nextDueDate,
  progressFromTasks,
} from "./tasks";

describe("progressFromTasks", () => {
  it("rechnet den Anteil erledigter Aufgaben in Prozent um", () => {
    expect(progressFromTasks(4, 1)).toBe(25);
    expect(progressFromTasks(8, 3)).toBe(38);
    expect(progressFromTasks(3, 3)).toBe(100);
    expect(progressFromTasks(5, 0)).toBe(0);
  });

  it("gibt null zurueck, wenn es nichts zu rechnen gibt", () => {
    // Ohne Aufgaben bleibt der von Hand gesetzte Wert stehen.
    expect(progressFromTasks(0, 0)).toBeNull();
    expect(progressFromTasks(-1, 0)).toBeNull();
  });

  it("rundet kaufmaennisch statt abzuschneiden", () => {
    // 1/3 sind 33,33 % und 2/3 sind 66,67 %.
    expect(progressFromTasks(3, 1)).toBe(33);
    expect(progressFromTasks(3, 2)).toBe(67);
  });
});

describe("Spaltenreihenfolge", () => {
  it("fuehrt von offen nach erledigt", () => {
    expect(TASK_STATUS_ORDER).toEqual(["TODO", "DOING", "BLOCKED", "DONE"]);
  });

  it("hat zu jeder Spalte eine Beschriftung und eine Farbe", () => {
    for (const status of TASK_STATUS_ORDER) {
      expect(TASK_STATUS_META[status].label).toBeTruthy();
      expect(TASK_STATUS_META[status].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("nextDueDate", () => {
  const abhaken = (iso: string) => new Date(iso);

  it("rechnet vom bisherigen Termin, nicht vom Abhaken", () => {
    // Woechentlich, faellig Montag, erledigt erst Mittwoch: der naechste
    // Termin bleibt der Montag darauf, nicht der uebernaechste Mittwoch.
    const next = nextDueDate("WEEKLY", new Date("2026-07-06T12:00:00Z"), abhaken("2026-07-08T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-07-13");
  });

  it("nimmt ohne bisherigen Termin den Zeitpunkt des Abhakens", () => {
    const next = nextDueDate("DAILY", null, abhaken("2026-07-26T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-07-27");
  });

  it("schiebt so lange weiter, bis der Termin in der Zukunft liegt", () => {
    // Ein halbes Jahr liegengeblieben: die naechste Fassung darf nicht
    // schon bei ihrer Entstehung ueberfaellig sein.
    const next = nextDueDate("WEEKLY", new Date("2026-01-05T12:00:00Z"), abhaken("2026-07-26T09:00:00Z"));
    expect(next.getTime()).toBeGreaterThan(abhaken("2026-07-26T09:00:00Z").getTime());
    // Und es bleibt ein Montag.
    expect(next.getUTCDay()).toBe(1);
  });

  it("haelt beim Monatsintervall den Tag im Monat", () => {
    const next = nextDueDate("MONTHLY", new Date("2026-03-15T12:00:00Z"), abhaken("2026-03-16T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("rollt beim Monatsintervall nicht ueber kurze Monate hinweg", () => {
    // Der 31. Januar plus ein Monat ist der 28. Februar, nicht der 3. Maerz.
    const next = nextDueDate("MONTHLY", new Date("2026-01-31T12:00:00Z"), abhaken("2026-02-01T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("kennt zwei Wochen", () => {
    const next = nextDueDate("BIWEEKLY", new Date("2026-07-01T12:00:00Z"), abhaken("2026-07-02T09:00:00Z"));
    expect(next.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("endet auch bei einem absurd alten Termin", () => {
    // Ohne Deckel liefe die Schleife bei einem taeglichen Intervall und
    // einem Datum von 1970 sehr lange.
    const next = nextDueDate("DAILY", new Date("1970-01-01T00:00:00Z"), abhaken("2026-07-26T09:00:00Z"));
    expect(next instanceof Date).toBe(true);
    expect(Number.isNaN(next.getTime())).toBe(false);
  });
});
