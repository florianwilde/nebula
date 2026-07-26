import { describe, expect, it } from "vitest";
import type { Project, RepoSnapshot } from "@prisma/client";
import { pendingEvents } from "./index";

/**
 * Die Entprellung ist der Kern: gemeldet wird nur bei einer Aenderung
 * gegenueber dem zuletzt gemeldeten Stand. Ohne sie kaeme bei einem Repo mit
 * abgelaufenem Token mit jedem stuendlichen Durchlauf dieselbe Nachricht.
 */

function projekt(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Testprojekt",
    slug: "testprojekt",
    syncError: null,
    notifiedSyncError: null,
    notifiedCiState: null,
    notifiedRelease: null,
    ...overrides,
  } as Project;
}

function snapshot(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    ciState: null,
    ciBranch: "main",
    ciName: null,
    ciUrl: null,
    latestTag: null,
    latestRelease: null,
    htmlUrl: null,
    ...overrides,
  } as RepoSnapshot;
}

const events = (p: Project, s: RepoSnapshot | null) =>
  pendingEvents(p, s).map((entry) => entry.event);

describe("Abgleichsfehler", () => {
  it("meldet einen neuen Fehler", () => {
    expect(events(projekt({ syncError: "404" }), null)).toEqual(["SYNC_FAILED"]);
  });

  it("meldet denselben Fehler kein zweites Mal", () => {
    expect(events(projekt({ syncError: "404", notifiedSyncError: "404" }), null)).toEqual([]);
  });

  it("meldet, wenn sich der Fehler aendert", () => {
    expect(
      events(projekt({ syncError: "401 Token", notifiedSyncError: "404" }), null),
    ).toEqual(["SYNC_FAILED"]);
  });

  it("meldet nichts, wenn kein Fehler vorliegt", () => {
    expect(events(projekt({ syncError: null, notifiedSyncError: "404" }), null)).toEqual([]);
  });
});

describe("CI", () => {
  it("meldet den Wechsel auf rot", () => {
    expect(events(projekt(), snapshot({ ciState: "failure" }))).toEqual(["CI_FAILED"]);
  });

  it("meldet dauerhaft rote CI nur einmal", () => {
    expect(
      events(projekt({ notifiedCiState: "failure" }), snapshot({ ciState: "failure" })),
    ).toEqual([]);
  });

  it("meldet nicht, wenn die CI gruen ist", () => {
    expect(
      events(projekt({ notifiedCiState: "failure" }), snapshot({ ciState: "success" })),
    ).toEqual([]);
  });

  it("meldet erneut, wenn die CI nach gruen wieder rot wird", () => {
    expect(
      events(projekt({ notifiedCiState: "success" }), snapshot({ ciState: "failure" })),
    ).toEqual(["CI_FAILED"]);
  });
});

describe("Release", () => {
  it("schweigt beim allerersten Abgleich", () => {
    // Sonst waere jede bereits vorhandene Version eine "Neuigkeit".
    expect(
      events(projekt({ notifiedRelease: null }), snapshot({ latestTag: "v1.0.0" })),
    ).toEqual([]);
  });

  it("meldet eine neue Version", () => {
    expect(
      events(projekt({ notifiedRelease: "v1.0.0" }), snapshot({ latestTag: "v1.1.0" })),
    ).toEqual(["NEW_RELEASE"]);
  });

  it("meldet dieselbe Version nicht erneut", () => {
    expect(
      events(projekt({ notifiedRelease: "v1.1.0" }), snapshot({ latestTag: "v1.1.0" })),
    ).toEqual([]);
  });

  it("zieht den Releasenamen dem Tag vor", () => {
    const treffer = pendingEvents(
      projekt({ notifiedRelease: "alt" }),
      snapshot({ latestTag: "v2.0.0", latestRelease: "Zweite Ausgabe" }),
    );
    expect(treffer[0].message.title).toContain("Zweite Ausgabe");
  });
});

describe("mehrere Anlaesse gleichzeitig", () => {
  it("meldet Fehler und rote CI zusammen", () => {
    expect(
      events(projekt({ syncError: "Zeitueberschreitung" }), snapshot({ ciState: "failure" })),
    ).toEqual(["SYNC_FAILED", "CI_FAILED"]);
  });

  it("haengt Projektbezug und Tieflink an jede Nachricht", () => {
    const treffer = pendingEvents(projekt({ syncError: "404" }), null);
    expect(treffer[0].message.project?.slug).toBe("testprojekt");
    expect(treffer[0].message.url).toContain("/projects/p1");
    expect(treffer[0].message.priority).toBe("high");
  });
});
