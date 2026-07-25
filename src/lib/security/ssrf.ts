import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Schutz vor Server Side Request Forgery.
 *
 * Die Basis-URL einer Git-Verbindung kommt aus einem Formular. Ohne Pruefung
 * koennte darueber jede vom Server erreichbare Adresse abgefragt werden –
 * Cloud-Metadaten (169.254.169.254), lokal gebundene Dienste oder ein
 * Portscan im Heimnetz.
 *
 * Voreinstellung:
 *   verboten  – Loopback, Link-Local (inkl. Metadaten), unspezifiziert,
 *               Multicast, CGNAT
 *   erlaubt   – privates LAN (10/8, 172.16/12, 192.168/16, fc00::/7),
 *               weil eine selbst gehostete Gitea-Instanz genau dort steht
 *
 * Ueber Umgebungsvariablen anpassbar:
 *   GIT_ALLOW_LOOPBACK=true    Gitea laeuft auf demselben Rechner
 *   GIT_BLOCK_PRIVATE=true     kein Zugriff ins private Netz
 *   GIT_ALLOWED_HOSTS=a,b,c    strengster Modus: nur diese Hosts
 */

export class BlockedHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedHostError";
  }
}

function envFlag(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(process.env[name]?.trim() ?? "");
}

function allowlist(): string[] {
  return (process.env.GIT_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return null;
  return parts;
}

type Verdict = { blocked: true; reason: string } | { blocked: false };

function classifyIpv4(address: string): Verdict {
  const parts = ipv4Parts(address);
  if (!parts) return { blocked: true, reason: "unlesbare IPv4-Adresse" };
  const [a, b] = parts;

  if (a === 0) return { blocked: true, reason: "unspezifizierte Adresse (0.0.0.0/8)" };
  if (a === 127) {
    return envFlag("GIT_ALLOW_LOOPBACK")
      ? { blocked: false }
      : { blocked: true, reason: "Loopback (127.0.0.0/8) – mit GIT_ALLOW_LOOPBACK=true erlauben" };
  }
  if (a === 169 && b === 254) {
    return { blocked: true, reason: "Link-Local/Metadaten-Endpunkt (169.254.0.0/16)" };
  }
  if (a >= 224) return { blocked: true, reason: "Multicast oder reservierter Bereich" };
  if (a === 100 && b >= 64 && b <= 127) {
    return { blocked: true, reason: "Carrier-Grade-NAT (100.64.0.0/10)" };
  }

  const isPrivate =
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  if (isPrivate && envFlag("GIT_BLOCK_PRIVATE")) {
    return { blocked: true, reason: "privates Netz ist per GIT_BLOCK_PRIVATE gesperrt" };
  }

  return { blocked: false };
}

function classifyIpv6(address: string): Verdict {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4-gemappte Adressen wie ::ffff:127.0.0.1 nach IPv4 weiterreichen.
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return classifyIpv4(mapped[1]);

  if (value === "::" ) return { blocked: true, reason: "unspezifizierte Adresse (::)" };
  if (value === "::1") {
    return envFlag("GIT_ALLOW_LOOPBACK")
      ? { blocked: false }
      : { blocked: true, reason: "Loopback (::1) – mit GIT_ALLOW_LOOPBACK=true erlauben" };
  }
  if (value.startsWith("fe80")) return { blocked: true, reason: "Link-Local (fe80::/10)" };
  if (value.startsWith("ff")) return { blocked: true, reason: "Multicast (ff00::/8)" };

  const isUniqueLocal = value.startsWith("fc") || value.startsWith("fd");
  if (isUniqueLocal && envFlag("GIT_BLOCK_PRIVATE")) {
    return { blocked: true, reason: "privates Netz ist per GIT_BLOCK_PRIVATE gesperrt" };
  }

  return { blocked: false };
}

function classifyAddress(address: string): Verdict {
  const version = isIP(address);
  if (version === 4) return classifyIpv4(address);
  if (version === 6) return classifyIpv6(address);
  return { blocked: true, reason: `keine gueltige IP-Adresse: ${address}` };
}

/**
 * Prueft eine URL, bevor der Server sie abruft. Wirft BlockedHostError,
 * wenn das Ziel nicht erlaubt ist.
 */
export async function assertAllowedUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedHostError(`Ungueltige URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedHostError(`Nur http und https sind erlaubt, nicht ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new BlockedHostError("Zugangsdaten in der URL sind nicht erlaubt.");
  }

  const host = url.hostname.toLowerCase();
  const allowed = allowlist();
  if (allowed.length > 0) {
    if (!allowed.includes(host)) {
      throw new BlockedHostError(
        `Host "${host}" steht nicht in GIT_ALLOWED_HOSTS.`,
      );
    }
    // Eine ausdrueckliche Freigabe schlaegt die Bereichspruefung.
    return url;
  }

  // IP-Literal direkt pruefen, Namen erst aufloesen.
  if (isIP(host)) {
    const verdict = classifyAddress(host);
    if (verdict.blocked) {
      throw new BlockedHostError(`Zugriff auf ${host} blockiert: ${verdict.reason}`);
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new BlockedHostError(`Hostname "${host}" konnte nicht aufgeloest werden.`);
  }

  if (addresses.length === 0) {
    throw new BlockedHostError(`Hostname "${host}" liefert keine Adresse.`);
  }

  // Jede Antwort muss zulaessig sein, sonst greift DNS-Rebinding ueber einen
  // zweiten A-Record.
  for (const { address } of addresses) {
    const verdict = classifyAddress(address);
    if (verdict.blocked) {
      throw new BlockedHostError(
        `Zugriff auf ${host} (${address}) blockiert: ${verdict.reason}`,
      );
    }
  }

  return url;
}
