import { afterEach, describe, expect, it } from "vitest";
import { BlockedHostError, assertAllowedUrl } from "./ssrf";

/**
 * Geprueft werden IP-Literale und die Formpruefung – beides kommt ohne
 * Netzzugriff aus. Die Namensaufloesung deckt der Durchlauf gegen echte
 * Instanzen ab.
 */

afterEach(() => {
  delete process.env.GIT_ALLOW_LOOPBACK;
  delete process.env.GIT_BLOCK_PRIVATE;
  delete process.env.GIT_ALLOWED_HOSTS;
});

async function blockedReason(url: string): Promise<string> {
  try {
    await assertAllowedUrl(url);
    return "NICHT BLOCKIERT";
  } catch (error) {
    if (error instanceof BlockedHostError) return error.message;
    throw error;
  }
}

describe("assertAllowedUrl – gesperrte Ziele", () => {
  it("blockt Loopback in IPv4 und IPv6", async () => {
    expect(await blockedReason("http://127.0.0.1:5432")).toMatch(/Loopback/);
    expect(await blockedReason("http://[::1]:3000")).toMatch(/Loopback|aufgeloest/);
  });

  it("blockt den Metadaten-Endpunkt der Cloud-Anbieter", async () => {
    expect(await blockedReason("http://169.254.169.254/latest/meta-data/")).toMatch(
      /Link-Local|Metadaten/,
    );
  });

  it("blockt die unspezifizierte Adresse", async () => {
    expect(await blockedReason("http://0.0.0.0")).toMatch(/unspezifiziert/);
  });

  it("blockt Carrier-Grade-NAT und Multicast", async () => {
    expect(await blockedReason("http://100.64.0.1")).toMatch(/Carrier/);
    expect(await blockedReason("http://239.0.0.1")).toMatch(/Multicast|reserviert/);
  });

  it("blockt IPv4-gemappte IPv6-Adressen auf Loopback", async () => {
    expect(await blockedReason("http://[::ffff:127.0.0.1]")).toMatch(/Loopback|aufgeloest/);
  });
});

describe("assertAllowedUrl – Formpruefung", () => {
  it("laesst nur http und https zu", async () => {
    expect(await blockedReason("file:///etc/passwd")).toMatch(/Nur http/);
    expect(await blockedReason("gopher://example.com")).toMatch(/Nur http/);
  });

  it("weist Zugangsdaten in der URL ab", async () => {
    expect(await blockedReason("https://nutzer:geheim@8.8.8.8")).toMatch(/Zugangsdaten/);
  });

  it("weist unlesbare URLs ab", async () => {
    expect(await blockedReason("kein-url-artiger-text")).toMatch(/Ungueltige URL/);
  });
});

describe("assertAllowedUrl – erlaubte Ziele", () => {
  it("laesst oeffentliche Adressen durch", async () => {
    await expect(assertAllowedUrl("https://140.82.121.4")).resolves.toBeInstanceOf(URL);
  });

  it("laesst das private LAN standardmaessig zu", async () => {
    await expect(assertAllowedUrl("http://192.168.1.10:3000")).resolves.toBeInstanceOf(URL);
    await expect(assertAllowedUrl("http://10.0.0.5")).resolves.toBeInstanceOf(URL);
    await expect(assertAllowedUrl("http://172.16.0.1")).resolves.toBeInstanceOf(URL);
  });
});

describe("assertAllowedUrl – Schalter", () => {
  it("GIT_ALLOW_LOOPBACK gibt Loopback frei", async () => {
    process.env.GIT_ALLOW_LOOPBACK = "true";
    await expect(assertAllowedUrl("http://127.0.0.1:3000")).resolves.toBeInstanceOf(URL);
  });

  it("GIT_BLOCK_PRIVATE sperrt das private Netz", async () => {
    process.env.GIT_BLOCK_PRIVATE = "true";
    expect(await blockedReason("http://192.168.1.10")).toMatch(/privates Netz/);
  });

  it("GIT_ALLOWED_HOSTS laesst ausschliesslich die genannten Hosts zu", async () => {
    process.env.GIT_ALLOWED_HOSTS = "github.com";
    await expect(assertAllowedUrl("https://github.com/x/y")).resolves.toBeInstanceOf(URL);
    expect(await blockedReason("https://gitlab.com/x/y")).toMatch(/GIT_ALLOWED_HOSTS/);
  });

  it("eine ausdrueckliche Freigabe schlaegt die Bereichspruefung", async () => {
    // Damit laesst sich eine Gitea auf demselben Rechner gezielt erlauben.
    process.env.GIT_ALLOWED_HOSTS = "127.0.0.1";
    await expect(assertAllowedUrl("http://127.0.0.1:3000")).resolves.toBeInstanceOf(URL);
  });
});
