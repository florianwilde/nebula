"use client";

import { useState } from "react";
import { Bot, History, Loader2 } from "lucide-react";
import { ACTIVITY_KINDS } from "@/components/activityKinds";
import type { ActivityEntry } from "@/types";
import { formatDateTime, formatRelative } from "@/lib/utils";

/**
 * Der Verlauf eines Projekts: was ist wann passiert.
 *
 * Die erste Seite kommt mit der Seite mit, weitere holt der Knopf nach. Die
 * Alternative – alles gleich mitzuladen – wuerde jeden Seitenaufruf mit
 * zweihundert Eintraegen belasten, von denen man selten mehr als die
 * obersten fuenf liest.
 */


export function ActivityFeed({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ActivityEntry[];
}) {
  const [entries, setEntries] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kam eine volle Seite, gibt es womoeglich noch mehr.
  const [complete, setComplete] = useState(initial.length < 20);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/activity?limit=200`);
      if (!response.ok) throw new Error("Verlauf konnte nicht geladen werden.");
      const payload = await response.json();
      setEntries(payload.activities as ActivityEntry[]);
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
        <History className="h-4 w-4 text-violet-300" />
        Verlauf
      </h2>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Noch nichts passiert. Sobald du etwas änderst, steht es hier.
        </p>
      ) : (
        <ol className="mt-4 space-y-0">
          {entries.map((entry, index) => {
            const meta = ACTIVITY_KINDS[entry.kind] ?? ACTIVITY_KINDS.PROJECT_UPDATED;
            const Icon = meta.icon;
            const letzter = index === entries.length - 1;

            return (
              <li key={entry.id} className="relative flex gap-3 pb-4">
                {/* Die Linie endet am letzten Eintrag, statt ins Leere zu laufen. */}
                {!letzter ? (
                  <span
                    aria-hidden
                    className="absolute left-3 top-7 h-[calc(100%-1.25rem)] w-px bg-white/15"
                  />
                ) : null}

                <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0d1020] ring-1 ring-white/10">
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-slate-200">{entry.summary}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <time dateTime={new Date(entry.createdAt).toISOString()}>
                      {formatRelative(entry.createdAt)}
                    </time>
                    <span aria-hidden>·</span>
                    <span>{formatDateTime(entry.createdAt)}</span>
                    {/* Ohne Benutzer war es der automatische Abgleich. */}
                    {entry.user ? null : (
                      <>
                        <span aria-hidden>·</span>
                        <Bot className="h-3 w-3" aria-hidden />
                        <span>automatisch</span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      {!complete ? (
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="btn btn-ghost mt-1 w-full text-xs"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Älteres anzeigen
        </button>
      ) : null}
    </section>
  );
}
