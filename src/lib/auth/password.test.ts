import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "./constants";
import { hashPassword, validatePasswordStrength, verifyPassword } from "./password";

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
