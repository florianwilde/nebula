import { describe, expect, it } from "vitest";
import { formatNumber, parseTags, slugify, truncate } from "./utils";

describe("slugify", () => {
  it("macht aus einem Namen einen URL-tauglichen Slug", () => {
    expect(slugify("Mein Projekt")).toBe("mein-projekt");
  });

  it("schreibt deutsche Umlaute aus", () => {
    expect(slugify("Grün & Größe")).toBe("gruen-groesse");
    expect(slugify("Straße")).toBe("strasse");
  });

  it("entfernt fuehrende und abschliessende Trennzeichen", () => {
    expect(slugify("  ...Hallo Welt!!! ")).toBe("hallo-welt");
  });

  it("faellt bei reinen Sonderzeichen auf einen leeren Slug zurueck", () => {
    // Die Aufrufer ersetzen das durch "projekt".
    expect(slugify("!!!")).toBe("");
  });

  it("begrenzt die Laenge", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("parseTags", () => {
  it("trennt an Kommas, trimmt und schreibt klein", () => {
    expect(parseTags(" Next.js , PRISMA ,dashboard ")).toEqual([
      "next.js",
      "prisma",
      "dashboard",
    ]);
  });

  it("entfernt Dubletten und Leereintraege", () => {
    expect(parseTags("a,,a, b ,A")).toEqual(["a", "b"]);
  });

  it("begrenzt auf zwoelf Tags", () => {
    const many = Array.from({ length: 20 }, (_, index) => `tag${index}`).join(",");
    expect(parseTags(many)).toHaveLength(12);
  });
});

describe("truncate", () => {
  it("laesst kurze Texte unveraendert", () => {
    expect(truncate("kurz", 10)).toBe("kurz");
  });

  it("kuerzt und haengt ein Auslassungszeichen an", () => {
    const result = truncate("abcdefghij", 5);
    expect(result).toHaveLength(5);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("formatNumber", () => {
  it("gruppiert nach deutscher Schreibweise", () => {
    // Das Trennzeichen kann je nach ICU-Version variieren.
    expect(formatNumber(32437)).toMatch(/^32.437$/);
  });
});
