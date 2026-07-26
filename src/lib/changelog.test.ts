import { describe, expect, it } from "vitest";
import { CHANGELOG, KIND_META } from "./changelog";
import { APP_VERSION } from "./config";

/**
 * Der Verlauf und die Versionsnummer sind zwei Angaben, die zusammenpassen
 * muessen. Genau daran ist dieses Projekt schon einmal gescheitert: die
 * Version stand in der Fusszeile und in der package.json und zeigte
 * verschiedene Werte.
 */

describe("Aenderungsverlauf", () => {
  it("beginnt mit der Fassung, die auch installiert ist", () => {
    expect(CHANGELOG[0].version).toBe(APP_VERSION);
  });

  it("nennt jede Fassung nur einmal", () => {
    const versionen = CHANGELOG.map((release) => release.version);
    expect(new Set(versionen).size).toBe(versionen.length);
  });

  it("zaehlt absteigend", () => {
    const zahl = (version: string) =>
      version.split(".").reduce((sum, teil) => sum * 1000 + Number(teil), 0);

    for (let index = 1; index < CHANGELOG.length; index += 1) {
      expect(
        zahl(CHANGELOG[index - 1].version),
        `${CHANGELOG[index - 1].version} muss ueber ${CHANGELOG[index].version} stehen`,
      ).toBeGreaterThan(zahl(CHANGELOG[index].version));
    }
  });

  it("hat zu jeder Fassung ein Datum, eine Zeile und mindestens eine Aenderung", () => {
    for (const release of CHANGELOG) {
      expect(release.version, "Version im Format x.y.z").toMatch(/^\d+\.\d+\.\d+$/);
      expect(Number.isNaN(Date.parse(release.date)), `Datum von ${release.version}`).toBe(false);
      expect(release.headline.length, `Zeile zu ${release.version}`).toBeGreaterThan(0);
      expect(release.changes.length, `Eintraege zu ${release.version}`).toBeGreaterThan(0);
    }
  });

  it("kennt zu jeder Art eine Beschriftung", () => {
    for (const release of CHANGELOG) {
      for (const change of release.changes) {
        expect(KIND_META[change.kind], `${change.kind} in v${release.version}`).toBeDefined();
        expect(change.text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
