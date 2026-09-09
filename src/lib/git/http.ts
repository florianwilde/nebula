import { BlockedHostError, assertAllowedUrl } from "@/lib/security/ssrf";
import { GitApiError } from "./types";

const TIMEOUT_VORGABE = 15000;

/**
 * Zeitlimit je Aufruf.
 *
 * Bewusst mit Pruefung: Number("") ist 0 und Number("abc") ist NaN – beides
 * laesst setTimeout sofort ausloesen, und dann bricht jeder ausgehende
 * Aufruf ab, bevor er begonnen hat. Eine verrutschte Zeile in der .env
 * legte damit den ganzen Abgleich still, ohne dass irgendwo etwas stand.
 */
export function zeitlimit(
  roh: string | undefined,
  warnen: (text: string) => void = console.warn,
): number {
  const wert = roh?.trim();
  if (!wert) return TIMEOUT_VORGABE;

  const zahl = Number(wert);
  // Untergrenze 1000 ms: darunter ist kein Aufruf ueber das Netz zu
  // schaffen, und wer das eintraegt, hat sich vertan.
  if (!Number.isFinite(zahl) || zahl < 1000) {
    warnen(
      `[nebula] GIT_API_TIMEOUT_MS="${wert}" ist unbrauchbar (Zahl ab 1000 erwartet). ` +
        `Es gelten ${TIMEOUT_VORGABE} ms.`,
    );
    return TIMEOUT_VORGABE;
  }
  return zahl;
}

const DEFAULT_TIMEOUT = zeitlimit(process.env.GIT_API_TIMEOUT_MS);

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Wenn true, liefert die Funktion bei 404 null statt zu werfen. */
  allow404?: boolean;
}

/** Entfernt einen abschliessenden Slash, damit URLs sauber zusammengesetzt werden. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function friendlyMessage(status: number, url: string, body: string): string {
  switch (status) {
    case 401:
      return "Nicht autorisiert (401) – Token fehlt, ist abgelaufen oder ungueltig.";
    case 403:
      return body.toLowerCase().includes("rate limit")
        ? "Rate-Limit erreicht (403) – bitte spaeter erneut versuchen oder Token hinterlegen."
        : "Zugriff verweigert (403) – Token hat nicht die noetigen Scopes.";
    case 404:
      return "Nicht gefunden (404) – Repo-Pfad pruefen oder Token hat keinen Lesezugriff.";
    case 429:
      return "Zu viele Anfragen (429) – Rate-Limit des Git-Systems.";
    default:
      if (status >= 500) return `Serverfehler ${status} beim Git-System.`;
      return `Anfrage fehlgeschlagen (${status}) auf ${url}`;
  }
}

/** GET mit Timeout, JSON-Parsing und sprechenden Fehlern. */
export async function getJson<T>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT,
  );

  try {
    // Vor jedem ausgehenden Aufruf pruefen, wohin er geht. Die Basis-URL
    // stammt aus einem Formular, also aus Benutzereingabe.
    await assertAllowedUrl(url);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Nebula-Dashboard",
        ...options.headers,
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });

    // Ein Redirect koennte auf eine interne Adresse zeigen (etwa bei einem
    // umbenannten GitHub-Repo, aber eben auch boesartig). Deshalb das
    // tatsaechliche Ziel nachtraeglich noch einmal pruefen.
    if (response.redirected && response.url && response.url !== url) {
      await assertAllowedUrl(response.url);
    }

    if (response.status === 404 && options.allow404) {
      return null as T;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GitApiError(
        friendlyMessage(response.status, url, body),
        response.status,
        url,
      );
    }

    const text = await response.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof GitApiError) throw error;
    if (error instanceof BlockedHostError) {
      throw new GitApiError(error.message, 403, url);
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new GitApiError(
        `Zeitueberschreitung nach ${options.timeoutMs ?? DEFAULT_TIMEOUT} ms`,
        408,
        url,
      );
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new GitApiError(`Verbindung fehlgeschlagen: ${reason}`, 0, url);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Schreibender Aufruf – POST, PATCH oder PUT.
 *
 * Bewusst dieselbe Schleuse wie getJson: die Basis-URL stammt aus einem
 * Formular, und ohne die Pruefung waere ein schreibender Aufruf der weitaus
 * unangenehmere Weg nach innen. Redirects werden hier **nicht** verfolgt.
 * Ein 307 auf eine interne Adresse wuerde den Rumpf mitnehmen, und der
 * enthaelt bei uns immer den Token im Header – lieber ein Fehler als eine
 * Anfrage, die woanders landet.
 */
export async function sendJson<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT",
  body: unknown,
  options: FetchOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT,
  );

  try {
    await assertAllowedUrl(url);

    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Nebula-Dashboard",
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual",
    });

    // Bei redirect: "manual" kommt der Umleitungsstatus durch, statt dass
    // fetch ihm folgt. Das ist hier gewollt und ein Fehlerfall.
    if (response.status >= 300 && response.status < 400) {
      throw new GitApiError(
        "Das Git-System hat umgeleitet. Schreibende Aufrufe folgen dem nicht – " +
          "bitte die Basis-URL der Verbindung auf die endgueltige Adresse setzen.",
        response.status,
        url,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new GitApiError(
        friendlyMessage(response.status, url, text),
        response.status,
        url,
      );
    }

    const text = await response.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof GitApiError) throw error;
    if (error instanceof BlockedHostError) {
      throw new GitApiError(error.message, 403, url);
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new GitApiError(
        `Zeitueberschreitung nach ${options.timeoutMs ?? DEFAULT_TIMEOUT} ms`,
        408,
        url,
      );
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new GitApiError(`Verbindung fehlgeschlagen: ${reason}`, 0, url);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Wie getJson, gibt aber bei jedem Fehler den Fallback zurueck.
 *
 * Nur fuer Abrufe benutzen, bei denen ein Fehlschlag wirklich nichts
 * bedeutet. Fuer die Listen eines Snapshots ist das falsch – dort ist
 * "nicht geholt" etwas anderes als "nichts vorhanden". Dafuer gibt es
 * Teilabrufe.
 */
export async function getJsonSafe<T>(
  url: string,
  fallback: T,
  options: FetchOptions = {},
): Promise<T> {
  try {
    const result = await getJson<T>(url, options);
    return (result ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** Warum ein einzelner Teil-Abruf nicht geklappt hat. */
export type Teilfehler = Record<string, string>;

/**
 * Sammelstelle fuer die Listen eines Snapshots.
 *
 * Der Vorgaenger dieser Klasse war ein getJsonSafe je Liste. Das hat jeden
 * Fehler in eine leere Liste verwandelt, und damit war ein 403 nicht mehr
 * von einem Repository ohne Branches zu unterscheiden: Der Abgleich meldete
 * "Snapshot aktualisiert: 0 Branches, 0 Tags", schrieb Nullen ueber den
 * letzten guten Stand und niemand konnte sehen, woran es lag.
 *
 * Der Fallback bleibt – ein einzelner Fehlschlag darf den ganzen Abgleich
 * nicht abbrechen –, aber der Grund wird festgehalten.
 */
export class Teilabrufe {
  readonly fehler: Teilfehler = {};

  async hol<T>(
    feld: string,
    url: string,
    fallback: T,
    options: FetchOptions = {},
  ): Promise<T> {
    try {
      const result = await getJson<T>(url, options);
      return (result ?? fallback) as T;
    } catch (error) {
      this.fehler[feld] = beschreibe(error);
      return fallback;
    }
  }

  /** true, sobald mindestens ein Teil-Abruf gescheitert ist. */
  get unvollstaendig(): boolean {
    return Object.keys(this.fehler).length > 0;
  }
}

/**
 * Kurzfassung eines Fehlers, wie sie am Repository angezeigt wird.
 *
 * getJson gibt ausschliesslich GitApiError heraus – ein blockiertes Ziel
 * kommt als 403, eine Zeitueberschreitung als 408, ein nicht erreichter
 * Host als 0. Der Status ist damit die eigentliche Auskunft, und die
 * uebrigen Zweige sind nur fuer den Fall da, dass sich das einmal aendert.
 */
function beschreibe(error: unknown): string {
  if (error instanceof GitApiError) {
    return error.status
      ? `HTTP ${error.status}: ${error.message}`
      : error.message;
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function shortSha(sha: string | null | undefined): string {
  return (sha ?? "").slice(0, 7);
}
