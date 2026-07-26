import { describe, expect, it } from "vitest";
import type { Project, RepoSnapshot, Repository } from "@prisma/client";
import { pendingEvents } from "./index";

/**
 * Die Entprellung ist der Kern: gemeldet wird nur bei einer Aenderung
 * gegenueber dem zuletzt gemeldeten Stand. Ohne sie kaeme bei einem Repo mit
 * abgelaufenem Token mit jedem stuendlichen Durchlauf dieselbe Nachricht.
 *
 * Der Merkstand liegt am Repository, nicht am Projekt – sonst verdeckte ein
 * rotes Frontend die rote Pipeline des Backends.
 */

const PROJEKT: Project = {
  id: "p1",
  name: "Testprojekt",
  slug: "testprojekt",
} as Project;

function repo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: "r1",
    projectId: "p1",
    label: null,
    repoOwner: "wer",
    repoName: "testprojekt",
    repoUrl: null,
    syncError: null,
    notifiedSyncError: null,
    notifiedCiState: null,
    notifiedRelease: null,
    ...overrides,
  } as Repository;
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

const events = (r: Repository, s: RepoSnapshot | null) =>
  pendingEvents(PROJEKT, r, s).map((entry) => entry.event);

describe("Abgleichsfehler", () => {
  it("meldet einen neuen Fehler", () => {
    expect(events(repo({ syncError: "404" }), null)).toEqual(["SYNC_FAILED"]);
  });

  it("meldet denselben Fehler kein zweites Mal", () => {
    expect(events(repo({ syncError: "404", notifiedSyncError: "404" }), null)).toEqual([]);
  });

  it("meldet, wenn sich der Fehler aendert", () => {
    expect(
      events(repo({ syncError: "401 Token", notifiedSyncError: "404" }), null),
    ).toEqual(["SYNC_FAILED"]);
  });

  it("meldet nichts, wenn kein Fehler vorliegt", () => {
    expect(events(repo({ syncError: null, notifiedSyncError: "404" }), null)).toEqual([]);
  });
});

describe("CI", () => {
  it("meldet den Wechsel auf rot", () => {
    expect(events(repo(), snapshot({ ciState: "failure" }))).toEqual(["CI_FAILED"]);
  });

  it("meldet dauerhaft rote CI nur einmal", () => {
    expect(
      events(repo({ notifiedCiState: "failure" }), snapshot({ ciState: "failure" })),
    ).toEqual([]);
  });

  it("meldet nicht, wenn die CI gruen ist", () => {
    expect(
      events(repo({ notifiedCiState: "failure" }), snapshot({ ciState: "success" })),
    ).toEqual([]);
  });

  it("meldet erneut, wenn die CI nach gruen wieder rot wird", () => {
    expect(
      events(repo({ notifiedCiState: "success" }), snapshot({ ciState: "failure" })),
    ).toEqual(["CI_FAILED"]);
  });
});

describe("Release", () => {
  it("schweigt beim allerersten Abgleich", () => {
    // Sonst waere jede bereits vorhandene Version eine "Neuigkeit".
    expect(
      events(repo({ notifiedRelease: null }), snapshot({ latestTag: "v1.0.0" })),
    ).toEqual([]);
  });

  it("meldet eine neue Version", () => {
    expect(
      events(repo({ notifiedRelease: "v1.0.0" }), snapshot({ latestTag: "v1.1.0" })),
    ).toEqual(["NEW_RELEASE"]);
  });

  it("meldet dieselbe Version nicht erneut", () => {
    expect(
      events(repo({ notifiedRelease: "v1.1.0" }), snapshot({ latestTag: "v1.1.0" })),
    ).toEqual([]);
  });

  it("zieht den Releasenamen dem Tag vor", () => {
    const treffer = pendingEvents(
      PROJEKT,
      repo({ notifiedRelease: "alt" }),
      snapshot({ latestTag: "v2.0.0", latestRelease: "Zweite Ausgabe" }),
    );
    expect(treffer[0].message.title).toContain("Zweite Ausgabe");
  });
});

describe("Betreff bei mehreren Repositories", () => {
  it("nennt das Repository nicht, wenn es ohnehin so heisst wie das Projekt", () => {
    // "Testprojekt · wer/testprojekt: CI ist rot" liest niemand gern.
    const treffer = pendingEvents(
      PROJEKT,
      repo({ repoOwner: "wer", repoName: "testprojekt" }),
      snapshot({ ciState: "failure" }),
    );
    expect(treffer[0].message.title).toContain("Testprojekt: CI ist rot");
    expect(treffer[0].message.title).not.toContain("wer/");
  });

  it("nennt es, sobald es sich unterscheidet", () => {
    const treffer = pendingEvents(
      PROJEKT,
      repo({ label: "Backend" }),
      snapshot({ ciState: "failure" }),
    );
    expect(treffer[0].message.title).toContain("Testprojekt · Backend");
  });
});

describe("mehrere Anlaesse gleichzeitig", () => {
  it("meldet Fehler und rote CI zusammen", () => {
    expect(
      events(repo({ syncError: "Zeitueberschreitung" }), snapshot({ ciState: "failure" })),
    ).toEqual(["SYNC_FAILED", "CI_FAILED"]);
  });

  it("haengt Projektbezug und Tieflink an jede Nachricht", () => {
    const treffer = pendingEvents(PROJEKT, repo({ syncError: "404" }), null);
    expect(treffer[0].message.project?.slug).toBe("testprojekt");
    expect(treffer[0].message.url).toContain("/projects/p1");
    expect(treffer[0].message.priority).toBe("high");
  });
});
