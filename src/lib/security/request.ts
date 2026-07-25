import { NextResponse } from "next/server";

/** Groesste akzeptierte JSON-Nutzlast. */
const MAX_BODY_BYTES = 256 * 1024;

export function jsonError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: `Zu viele Anfragen. Bitte in ${retryAfter} Sekunden erneut versuchen.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export type BodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Liest einen JSON-Body und erzwingt dabei drei Dinge:
 *
 *  1. Content-Type application/json. Das ist zugleich CSRF-Schutz in der
 *     Tiefe: ein browserseitiger Cross-Site-Angriff kommt ohne Preflight nur
 *     mit text/plain, multipart/form-data oder urlencoded durch.
 *  2. Eine Obergrenze fuer die Groesse, damit ein grosser Body nicht Speicher
 *     bindet.
 *  3. Sauberes JSON – Parserfehler werden zu 400 statt zu einer Ausnahme.
 */
export async function readJsonBody<T = unknown>(
  request: Request,
): Promise<BodyResult<T>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: jsonError("Content-Type muss application/json sein.", 415),
    };
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError("Anfrage zu gross.", 413) };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: jsonError("Anfrage konnte nicht gelesen werden.", 400) };
  }

  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError("Anfrage zu gross.", 413) };
  }

  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return { ok: false, response: jsonError("Ungueltiger JSON-Body.", 400) };
  }
}

/** Beste verfuegbare Naeherung der Client-Adresse – nur fuer Ratenbegrenzung. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unbekannt";
}
