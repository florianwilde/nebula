import { describe, expect, it } from "vitest";
import { issueShouldBeOpen, statusForIssueState } from "./issues";

describe("issueShouldBeOpen", () => {
  it("haelt das Issue offen, solange die Aufgabe nicht erledigt ist", () => {
    expect(issueShouldBeOpen("TODO")).toBe(true);
    expect(issueShouldBeOpen("DOING")).toBe(true);
    expect(issueShouldBeOpen("BLOCKED")).toBe(true);
  });

  it("schliesst es erst bei ERLEDIGT", () => {
    expect(issueShouldBeOpen("DONE")).toBe(false);
  });
});

describe("statusForIssueState", () => {
  it("macht aus einem geschlossenen Issue eine erledigte Aufgabe", () => {
    expect(statusForIssueState(false, "TODO")).toBe("DONE");
    expect(statusForIssueState(false, "DOING")).toBe("DONE");
  });

  it("holt eine erledigte Aufgabe zurueck nach OFFEN", () => {
    expect(statusForIssueState(true, "DONE")).toBe("TODO");
  });

  it("laesst den feineren Zustand stehen, wenn das Issue ohnehin offen ist", () => {
    // Ein "opened"-Ereignis zu einer Aufgabe, die schon in Arbeit ist, darf
    // sie nicht auf OFFEN zuruecksetzen – IN ARBEIT ist mehr Information.
    expect(statusForIssueState(true, "DOING")).toBe("DOING");
    expect(statusForIssueState(true, "BLOCKED")).toBe("BLOCKED");
    expect(statusForIssueState(true, "TODO")).toBe("TODO");
  });

  it("bildet den Rundlauf ab, so verlustbehaftet wie er ist", () => {
    // IN ARBEIT geht nach draussen als "offen". Kommt es zurueck, bleibt es
    // IN ARBEIT – der Zustand ueberlebt also, solange niemand das Issue
    // schliesst. Nach dem Schliessen und Wiederoeffnen ist er weg, und das
    // ist die bewusst hingenommene Grenze.
    const hin = issueShouldBeOpen("DOING");
    expect(statusForIssueState(hin, "DOING")).toBe("DOING");
    expect(statusForIssueState(true, statusForIssueState(false, "DOING"))).toBe("TODO");
  });
});
