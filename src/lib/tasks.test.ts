import { describe, expect, it } from "vitest";
import { TASK_STATUS_META, TASK_STATUS_ORDER, progressFromTasks } from "./tasks";

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
