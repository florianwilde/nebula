/**
 * Laufzeitkonfiguration.
 *
 * Bewusst ohne NEXT_PUBLIC_-Variablen: die wuerden beim Build fest in das
 * JavaScript-Bundle geschrieben. So laesst sich dasselbe Docker-Image ohne
 * Neubau anders benennen und unter einer anderen URL betreiben. Werte, die
 * der Browser braucht, reicht das Layout als Props weiter.
 */

function trimmed(value: string | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

/** Anzeigename der Instanz – Seitentitel, Kopfzeile, Passkey-Dialog. */
export const APP_NAME = trimmed(process.env.APP_NAME) ?? "Nebula";

/** Kleine Zeile unter dem Namen in der Kopfzeile. */
export const APP_TAGLINE = trimmed(process.env.APP_TAGLINE) ?? "Vibe Coding";

const RAW_APP_URL = trimmed(process.env.APP_URL) ?? "http://localhost:3000";

function parseAppUrl(raw: string): URL {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`APP_URL muss http oder https sein, ist aber "${url.protocol}"`);
    }
    return url;
  } catch (error) {
    throw new Error(
      `APP_URL ist keine gueltige URL: "${raw}". Beispiel: https://nebula.example.com` +
        ` (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

const APP_URL_PARSED = parseAppUrl(RAW_APP_URL);

/** Vollstaendige Basis-URL ohne abschliessenden Slash. */
export const APP_URL = APP_URL_PARSED.origin;

/** Origin, den WebAuthn in der Assertion erwartet. */
export const WEBAUTHN_ORIGIN = APP_URL_PARSED.origin;

/**
 * Relying-Party-ID fuer WebAuthn: der reine Hostname ohne Port.
 * Passkeys sind an diesen Wert gebunden – aendert er sich, sind bestehende
 * Passkeys nicht mehr verwendbar.
 */
export const WEBAUTHN_RP_ID = APP_URL_PARSED.hostname;

/**
 * WebAuthn verlangt einen sicheren Kontext. Ausnahme: localhost gilt in
 * Browsern als sicher, auch ohne TLS.
 */
export const WEBAUTHN_AVAILABLE =
  APP_URL_PARSED.protocol === "https:" ||
  APP_URL_PARSED.hostname === "localhost" ||
  APP_URL_PARSED.hostname === "127.0.0.1";

/** Cookies nur ueber TLS ausliefern, wenn die App per https laeuft. */
export const COOKIES_SECURE = APP_URL_PARSED.protocol === "https:";

/** Lebensdauer einer Sitzung. */
export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = "nebula_session";

/** Wird beim Start einmal geloggt, damit Fehlkonfiguration frueh auffaellt. */
export function describeConfig(): string {
  return [
    `name=${APP_NAME}`,
    `url=${APP_URL}`,
    `rpId=${WEBAUTHN_RP_ID}`,
    `passkeys=${WEBAUTHN_AVAILABLE ? "moeglich" : "deaktiviert (kein sicherer Kontext)"}`,
    `secureCookies=${COOKIES_SECURE}`,
  ].join(" ");
}
