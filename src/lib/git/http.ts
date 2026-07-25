import { GitApiError } from "./types";

const DEFAULT_TIMEOUT = Number(process.env.GIT_API_TIMEOUT_MS ?? 15000);

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
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Nebula-Dashboard",
        ...options.headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 404 && options.allow404) {
      return null as T;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GitApiError(friendlyMessage(response.status, url, body), response.status, url);
    }

    const text = await response.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof GitApiError) throw error;
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

/** Wie getJson, gibt aber bei jedem Fehler den Fallback zurueck. */
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

export function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function shortSha(sha: string | null | undefined): string {
  return (sha ?? "").slice(0, 7);
}
