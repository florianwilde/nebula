import { describe, expect, it } from "vitest";
import { describeFields, describeStatus, shorten } from "./activity";

describe("describeFields", () => {
  it("nennt ein einzelnes Feld beim Namen", () => {
    expect(describeFields(["name"])).toBe("Name geändert");
  });

  it("zaehlt zwei und drei Felder auf", () => {
    expect(describeFields(["name", "tags"])).toBe("Name und Tags geändert");
    expect(describeFields(["name", "tags", "priority"])).toBe(
      "Name, Tags und Priorität geändert",
    );
  });

  it("fasst ab vier Feldern zusammen, statt eine Litanei zu bilden", () => {
    expect(describeFields(["name", "tags", "priority", "accent"])).toBe("4 Felder geändert");
  });

  it("zaehlt zusammengehoerende Felder nur einmal", () => {
    // repoOwner und repoName sind fuer den Leser eine einzige Aenderung.
    expect(describeFields(["repoOwner", "repoName"])).toBe("Repository geändert");
  });

  it("liefert null, wenn nichts Nennenswertes dabei war", () => {
    // slug wird nur mitgeschrieben, wenn sich der Name aendert – der Name
    // steht dann ohnehin schon in der Liste.
    expect(describeFields([])).toBeNull();
    expect(describeFields(["slug", "updatedAt"])).toBeNull();
  });
});

describe("describeStatus", () => {
  it("uebersetzt beide Seiten in die Anzeigenamen", () => {
    expect(describeStatus("IDEA", "IN_DEVELOPMENT")).toBe("Status: Idee → In Entwicklung");
  });

  it("laesst unbekannte Werte stehen, statt sie zu verschlucken", () => {
    expect(describeStatus("IDEA", "PHANTASIE")).toBe("Status: Idee → PHANTASIE");
  });
});

describe("shorten", () => {
  it("laesst Kurzes unangetastet", () => {
    expect(shorten("Kurzer Titel")).toBe("Kurzer Titel");
  });

  it("kuerzt auf die vorgegebene Laenge einschliesslich Auslassungszeichen", () => {
    const gekuerzt = shorten("x".repeat(100), 20);
    expect(gekuerzt).toHaveLength(20);
    expect(gekuerzt.endsWith("…")).toBe(true);
  });

  it("macht aus Zeilenumbruechen eine Zeile", () => {
    expect(shorten("Erste Zeile\n\n  zweite  Zeile ")).toBe("Erste Zeile zweite Zeile");
  });
});
