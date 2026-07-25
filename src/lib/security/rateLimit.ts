/**
 * Schlanker Ratenbegrenzer im Arbeitsspeicher.
 *
 * Nebula ist eine Einzelinstanz ohne geteilten Cache – ein Map genuegt.
 * Der Zaehler ueberlebt keinen Neustart, was fuer den Zweck (Bremse gegen
 * Passwortraten, Portscans ueber die Git-Endpunkte und das Verheizen fremder
 * API-Kontingente) ausreicht.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Verhindert, dass die Map bei vielen unterschiedlichen Schluesseln waechst. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Sekunden bis zum naechsten erlaubten Versuch. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { ok: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/** Nach erfolgreicher Anmeldung die Bremse fuer diesen Schluessel loesen. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** Vorkonfigurierte Kontingente je Anwendungsfall. */
export const LIMITS = {
  /** Anmeldeversuche je IP – die eigentliche Bremse gegen Durchprobieren */
  login: { limit: 10, windowMs: 5 * 60 * 1000 },
  /**
   * Anmeldeversuche je Benutzername. Bewusst grosszuegiger als die
   * Kontosperre (8 Fehlversuche), damit diese zuerst greift: der Benutzer
   * bekommt dann die verstaendliche Meldung "Konto gesperrt" statt eines
   * nackten 429. Ausserdem liesse sich ein Konto sonst schon mit fuenf
   * falschen Versuchen von aussen blockieren.
   */
  loginUser: { limit: 20, windowMs: 15 * 60 * 1000 },
  /** Ausgehende Git-Abfragen (Sync, Verbindungstest, Repo-Liste) */
  outbound: { limit: 30, windowMs: 60 * 1000 },
  /** Schreibende Zugriffe allgemein */
  mutation: { limit: 240, windowMs: 60 * 1000 },
  /** WebAuthn-Optionen anfordern */
  webauthn: { limit: 30, windowMs: 5 * 60 * 1000 },
} as const;
