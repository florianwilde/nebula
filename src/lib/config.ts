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

import packageJson from "../../package.json";

/**
 * Version aus der package.json – eine einzige Quelle. Vorher stand sie
 * zusaetzlich in der Fusszeile und lief prompt auseinander.
 *
 * Bewusst als Standardimport: ein benannter Import aus einer JSON-Datei
 * loest in Webpack eine Warnung aus.
 */
export const APP_VERSION: string = packageJson.version;

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

/**
 * Absolute Lebensdauer einer Sitzung – ab Anmeldung, nicht verlaengerbar.
 * Nach dieser Frist ist Schluss, egal wie aktiv jemand war.
 */
export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Leerlauffrist: so lange darf eine Sitzung unbenutzt bleiben.
 *
 * ASVS 3.3.2 verlangt beides – eine absolute *und* eine Leerlaufgrenze.
 * Vorher gab es nur die absolute, ein abgegriffener Cookie galt also bis zu
 * 30 Tage, unabhaengig davon, ob das Konto benutzt wurde.
 *
 * Acht Stunden sind der Kompromiss: ein Arbeitstag am Stueck bleibt
 * angemeldet, ueber Nacht laeuft die Sitzung ab. Wem das zu streng ist,
 * setzt SESSION_IDLE_HOURS hoch; 0 schaltet die Leerlaufgrenze ab.
 */
export const SESSION_IDLE_HOURS = Number(process.env.SESSION_IDLE_HOURS ?? 8);
export const SESSION_IDLE_MS =
  SESSION_IDLE_HOURS > 0 ? SESSION_IDLE_HOURS * 60 * 60 * 1000 : 0;

/**
 * Name des Sitzungscookies.
 *
 * Mit dem Praefix "__Host-" erzwingt der Browser selbst, was wir ohnehin
 * setzen: Secure, Pfad "/" und kein Domain-Attribut. Letzteres ist der
 * eigentliche Gewinn – eine andere Subdomain kann den Cookie dann nicht
 * ueberschreiben und damit keine Sitzung unterschieben.
 *
 * Nur bei https, denn der Praefix verlangt zwingend Secure; ohne TLS wuerde
 * der Browser den Cookie schlicht verwerfen.
 */
export const SESSION_COOKIE = COOKIES_SECURE ? "__Host-nebula_session" : "nebula_session";

/**
 * Cookie fuer die halbfertige Anmeldung zwischen Passwort und zweitem Faktor.
 * Kurzlebig – wer den Code nicht binnen fuenf Minuten eingibt, faengt von
 * vorne an.
 */
export const MFA_COOKIE = COOKIES_SECURE ? "__Host-nebula_mfa" : "nebula_mfa";
export const MFA_TTL_MS = 5 * 60 * 1000;

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
