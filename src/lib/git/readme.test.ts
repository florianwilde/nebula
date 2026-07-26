import { describe, expect, it } from "vitest";
import { README_MAX_CHARS, capReadme, decodeBase64, pickReadme } from "./readme";

describe("pickReadme", () => {
  it("findet die uebliche Schreibweise", () => {
    expect(pickReadme(["src", "README.md", "package.json"])).toBe("README.md");
  });

  it("ist bei der Gross- und Kleinschreibung nachsichtig", () => {
    expect(pickReadme(["readme.md"])).toBe("readme.md");
    expect(pickReadme(["ReadMe.MD"])).toBe("ReadMe.MD");
  });

  it("zieht Markdown den uebrigen Formaten vor", () => {
    // Beides kommt vor; nur das erste laesst sich wirklich darstellen.
    expect(pickReadme(["README.rst", "README.md"])).toBe("README.md");
  });

  it("nimmt auch ein README ohne Endung", () => {
    expect(pickReadme(["LICENSE", "README"])).toBe("README");
  });

  it("liefert null, wenn keines dabei ist", () => {
    expect(pickReadme(["src", "package.json"])).toBeNull();
    expect(pickReadme([])).toBeNull();
  });

  it("verwechselt Aehnliches nicht mit dem README", () => {
    expect(pickReadme(["README-CONTRIBUTING.md", "readme.md.bak"])).toBeNull();
  });
});

describe("capReadme", () => {
  it("laesst Kurzes unangetastet", () => {
    const { content, truncated } = capReadme("# Titel\n\nEin Satz.");
    expect(content).toBe("# Titel\n\nEin Satz.");
    expect(truncated).toBe(false);
  });

  it("kuerzt Langes an einer Zeilengrenze", () => {
    // Sonst bliebe womoeglich ein halber Codeblock stehen.
    const zeile = "x".repeat(80);
    const lang = Array.from({ length: 2000 }, () => zeile).join("\n");
    const { content, truncated } = capReadme(lang);
    expect(truncated).toBe(true);
    expect(content.length).toBeLessThanOrEqual(README_MAX_CHARS);
    expect(content.endsWith("x")).toBe(true);
    expect(content.split("\n").at(-1)).toBe(zeile);
  });

  it("kuerzt notfalls hart, wenn es gar keine Zeilengrenze gibt", () => {
    // Eine einzige riesige Zeile: hier waere der letzte Umbruch bei -1.
    const { content, truncated } = capReadme("y".repeat(README_MAX_CHARS + 500));
    expect(truncated).toBe(true);
    expect(content).toHaveLength(README_MAX_CHARS);
  });
});

describe("decodeBase64", () => {
  it("dekodiert UTF-8 richtig", () => {
    // Ueber Bytes gedacht kaeme hier Kauderwelsch heraus.
    const kodiert = Buffer.from("# Nebula – Übersicht", "utf8").toString("base64");
    expect(decodeBase64(kodiert)).toBe("# Nebula – Übersicht");
  });

  it("uebergeht Zeilenumbrueche in der Kodierung", () => {
    // GitHub bricht den base64-Block alle 60 Zeichen um.
    const roh = Buffer.from("Hallo Welt", "utf8").toString("base64");
    const umgebrochen = `${roh.slice(0, 4)}\n${roh.slice(4)}`;
    expect(decodeBase64(umgebrochen)).toBe("Hallo Welt");
  });
});
