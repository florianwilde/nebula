import { describe, expect, it } from "vitest";
import { hashCode, normalizeCode } from "./recovery";

describe("normalizeCode", () => {
  it("setzt den Bindestrich, wenn er beim Abtippen fehlt", () => {
    expect(normalizeCode("a7k2mp9xqd")).toBe("a7k2m-p9xqd");
  });

  it("nimmt Grossschreibung und Leerzeichen hin", () => {
    // Aus einem Ausdruck abgeschrieben sieht ein Code selten so aus wie
    // beim Erzeugen.
    expect(normalizeCode("A7K2M-P9XQD")).toBe("a7k2m-p9xqd");
    expect(normalizeCode(" a7k2m p9xqd ")).toBe("a7k2m-p9xqd");
    expect(normalizeCode("a7k2m—p9xqd")).toBe("a7k2m-p9xqd");
  });

  it("laesst zu kurze Eingaben unveraendert, statt sie zurechtzubiegen", () => {
    expect(normalizeCode("abc")).toBe("abc");
  });
});

describe("hashCode", () => {
  it("bildet Schreibweisen desselben Codes auf denselben Hash ab", () => {
    expect(hashCode("A7K2M-P9XQD")).toBe(hashCode("a7k2mp9xqd"));
  });

  it("unterscheidet verschiedene Codes", () => {
    expect(hashCode("a7k2m-p9xqd")).not.toBe(hashCode("a7k2m-p9xqe"));
  });

  it("gibt den Code nicht preis", () => {
    expect(hashCode("a7k2m-p9xqd")).not.toContain("a7k2m");
  });
});
