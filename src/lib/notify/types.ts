import type { NotificationEvent } from "@prisma/client";

/** Reihenfolge fuer die Oberflaeche. */
export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  "SYNC_FAILED",
  "CI_FAILED",
  "NEW_RELEASE",
  "PROJECT_STALE",
];

export const EVENT_META: Record<
  NotificationEvent,
  { label: string; description: string; emoji: string }
> = {
  SYNC_FAILED: {
    label: "Abgleich fehlgeschlagen",
    description: "Das Git-System war nicht erreichbar oder hat abgelehnt.",
    emoji: "⚠️",
  },
  CI_FAILED: {
    label: "CI rot",
    description: "Der letzte Lauf auf dem Default-Branch ist fehlgeschlagen.",
    emoji: "🔴",
  },
  NEW_RELEASE: {
    label: "Neues Release",
    description: "Im Repository ist ein neuer Tag oder ein Release aufgetaucht.",
    emoji: "🏷️",
  },
  PROJECT_STALE: {
    label: "Projekt steht still",
    description: "Seit laengerem kein Commit mehr. Die Schwelle setzt ein Administrator.",
    emoji: "🕸️",
  },
};

/** Eine fertig formulierte Nachricht, unabhaengig vom Zustellweg. */
export interface NotificationMessage {
  event: NotificationEvent | "TEST";
  title: string;
  body: string;
  /** Fuer ntfy: hoehere Zahl bedeutet auffaelliger. */
  priority: "normal" | "high";
  /** Link zurueck ins Dashboard oder ins Repository. */
  url: string | null;
  project: { id: string; name: string; slug: string } | null;
  at: string;
}

export interface DeliveryResult {
  ok: boolean;
  message: string;
}

/**
 * Felder eines Ziels, die an den Browser gehen duerfen – ohne Chiffrat.
 * Liegt hier und nicht in der Route: Next laesst in route.ts nur bestimmte
 * Exporte zu und bricht den Bau bei allem anderen ab.
 */
export const targetSafeSelect = {
  id: true,
  name: true,
  channel: true,
  target: true,
  secretHint: true,
  events: true,
  isActive: true,
  lastSentAt: true,
  lastOk: true,
  lastMessage: true,
  createdAt: true,
} as const;
