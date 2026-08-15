import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "./constants";
import { hashPassword, needsRehash, validatePasswordStrength, verifyPassword } from "./password";

describe("hashPassword und verifyPassword", () => {
  it("erkennt das richtige Passwort wieder", async () => {
    const hash = await hashPassword("ein-langes-testpasswort");
    await expect(verifyPassword("ein-langes-testpasswort", hash)).resolves.toBe(true);
  });

  it("weist ein falsches Passwort ab", async () => {
    const hash = await hashPassword("ein-langes-testpasswort");
    await expect(verifyPassword("etwas-anderes", hash)).resolves.toBe(false);
  });

  it("erzeugt fuer dasselbe Passwort unterschiedliche Hashes", async () => {
    // Unterschiedliches Salz – sonst waere an gleichen Hashes ablesbar,
    // wer dasselbe Passwort benutzt.
    const a = await hashPassword("ein-langes-testpasswort");
    const b = await hashPassword("ein-langes-testpasswort");
    expect(a).not.toBe(b);
  });

  it("haelt das erwartete Ablageformat ein", async () => {
    const hash = await hashPassword("ein-langes-testpasswort");
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
  });

  it("stuerzt bei kaputten oder fehlenden Hashes nicht ab", async () => {
    await expect(verifyPassword("x", null)).resolves.toBe(false);
    await expect(verifyPassword("x", "")).resolves.toBe(false);
    await expect(verifyPassword("x", "voelliger-unsinn")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$a$b$c$d$e")).resolves.toBe(false);
  });

  it("behandelt gleichwertige Unicode-Schreibweisen gleich", async () => {
    // "é" als ein Zeichen und als e + Akzent kombiniert.
    const hash = await hashPassword("passwort-café-lang");
    await expect(verifyPassword("passwort-café-lang", hash)).resolves.toBe(true);
  });
});

describe("validatePasswordStrength", () => {
  it("nimmt ein ausreichend langes Passwort an", () => {
    expect(validatePasswordStrength("ein-langes-testpasswort")).toBeNull();
  });

  it("weist zu kurze Passwoerter ab", () => {
    expect(validatePasswordStrength("a".repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(
      /mindestens/,
    );
  });

  it("weist naheliegende Passwoerter ab", () => {
    expect(validatePasswordStrength("password")).toBeTruthy();
    expect(validatePasswordStrength("Passwort")).toBeTruthy();
  });

  it("weist reine Ziffernfolgen ab", () => {
    expect(validatePasswordStrength("1234567890123")).toMatch(/Ziffern/);
  });

  it("weist uebermaessig lange Passwoerter ab", () => {
    expect(validatePasswordStrength("a".repeat(300))).toMatch(/hoechstens/);
  });
});

describe("Aufwand nach OWASP", () => {
  it("hasht mit den heute vorgesehenen Parametern", async () => {
    // OWASP Password Storage Cheat Sheet: N = 2^17, r = 8, p = 1.
    const hash = await hashPassword("ein-langes-testpasswort");
    const [, N, r, p] = hash.split("$");
    expect(Number(N)).toBe(131072);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it("prueft alte Hashes weiterhin, weil die Parameter im Hash stehen", async () => {
    // Von Hand mit den frueheren Werten erzeugt – muss gueltig bleiben,
    // sonst waere ein Anheben des Aufwands eine Aussperrung.
    const alt =
      "scrypt$32768$8$1$" +
      Buffer.from("salzsalzsalzsalz").toString("base64url") +
      "$";
    // Echten Hash mit alten Parametern bauen:
    const { scrypt } = await import("node:crypto");
    const { promisify } = await import("node:util");
    const s = promisify(scrypt) as (a: string, b: Buffer, c: number, d: object) => Promise<Buffer>;
    const salt = Buffer.from("salzsalzsalzsalz");
    const derived = await s("ein-langes-testpasswort", salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 96 * 1024 * 1024,
    });
    const alterHash = `scrypt$32768$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
    expect(alt.length).toBeGreaterThan(0);

    await expect(verifyPassword("ein-langes-testpasswort", alterHash)).resolves.toBe(true);
    // ... und wird als erneuerungsbeduerftig erkannt.
    expect(needsRehash(alterHash)).toBe(true);
  });

  it("laesst frische Hashes in Ruhe", async () => {
    expect(needsRehash(await hashPassword("ein-langes-testpasswort"))).toBe(false);
  });

  it("erkennt gleichwertige Kombinationen als ausreichend", () => {
    // N=2^16 mit p=2 ergibt denselben Gesamtaufwand wie N=2^17 mit p=1 und
    // ist nach OWASP ebenso zulaessig.
    expect(needsRehash("scrypt$65536$8$2$c2FsdA$aGFzaA")).toBe(false);
    // N=2^15 mit p=1 dagegen nicht – das war der alte Zustand.
    expect(needsRehash("scrypt$32768$8$1$c2FsdA$aGFzaA")).toBe(true);
  });

  it("haelt Unsinn fuer erneuerungsbeduerftig", () => {
    expect(needsRehash("voelliger-unsinn")).toBe(true);
    expect(needsRehash(null)).toBe(false);
  });
});

describe("Schwache Muster", () => {
  it("weist Wiederholungen ab", () => {
    expect(validatePasswordStrength("aaaaaaaaaaaa")).toBeTruthy();
    expect(validatePasswordStrength("abababababab")).toBeTruthy();
  });

  it("weist Zeichenfolgen ab", () => {
    expect(validatePasswordStrength("abcdefghijkl")).toBeTruthy();
    expect(validatePasswordStrength("87654321abcd")).toBeTruthy();
  });

  it("weist Passwoerter mit dem Benutzernamen ab", () => {
    expect(validatePasswordStrength("chefin-geheimnis", "chefin")).toMatch(/Benutzernamen/);
    // Ohne Benutzernamen ist dasselbe Passwort in Ordnung.
    expect(validatePasswordStrength("chefin-geheimnis")).toBeNull();
    // Sehr kurze Namen zaehlen nicht – sonst scheitert fast alles.
    expect(validatePasswordStrength("ab-langes-passwort", "ab")).toBeNull();
  });

  it("laesst ein gutes Passwort mit Wiederholung durch", () => {
    // Ein "ll" ist kein Grund zur Ablehnung, solange genug Vielfalt da ist.
    expect(validatePasswordStrength("Rollladen-Fenster-42")).toBeNull();
  });
});
