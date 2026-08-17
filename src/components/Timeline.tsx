"use client";

import { useMemo, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { ActivityDayGroups } from "@/components/ActivityRow";
import { tagesschluessel } from "@/lib/review";
import type { ReviewDay, ReviewEntry } from "@/types";

/**
 * Die fortlaufende Zeitleiste.
 *
 * Client-Komponente, weil hier nachgeladen wird – das ist der Unterschied
 * zum Wochenrueckblick, der komplett auf dem Server entsteht.
 *
 * Die Buendelung nach Tagen passiert hier im Browser. Das ist unbedenklich,
 * weil tagesschluessel eine feste Zeitzone benutzt: Server und Browser kommen
 * damit auf denselben Kalendertag, und die erste Seite hydriert ohne
 * Abweichung.
 */
export function Timeline({
  erste,
  weitere: gabWeitere,
}: {
  erste: ReviewEntry[];
  weitere: boolean;
}) {
  const [eintraege, setEintraege] = useState(erste);
  const [weitere, setWeitere] = useState(gabWeitere);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const tage: ReviewDay[] = useMemo(() => {
    // Map behaelt die Einfuegereihenfolge – die Eintraege kommen schon
    // absteigend, also stimmt die Reihenfolge der Tage von selbst.
    const nachTag = new Map<string, ReviewEntry[]>();
    for (const eintrag of eintraege) {
      const schluessel = tagesschluessel(new Date(eintrag.createdAt));
      const liste = nachTag.get(schluessel) ?? [];
      liste.push(eintrag);
      nachTag.set(schluessel, liste);
    }
    return [...nachTag.entries()].map(([tag, liste]) => ({ tag, eintraege: liste }));
  }, [eintraege]);

  async function mehr() {
    const letzter = eintraege[eintraege.length - 1];
    if (!letzter) return;

    setLaedt(true);
    setFehler(null);
    try {
      const antwort = await fetch(
        `/api/activity?vor=${encodeURIComponent(letzter.createdAt)}&id=${encodeURIComponent(letzter.id)}`,
      );
      if (!antwort.ok) throw new Error("Verlauf konnte nicht geladen werden.");
      const nutzlast = (await antwort.json()) as {
        activities: ReviewEntry[];
        weitere: boolean;
      };

      /**
       * Gegen Dubletten absichern, auch wenn der Cursor sie ausschliesst:
       * ein zweimal gedrueckter Knopf oder ein wiederholter Aufruf soll
       * keine Zeile verdoppeln, und React braucht eindeutige Schluessel.
       */
      setEintraege((bisher) => {
        const bekannt = new Set(bisher.map((eintrag) => eintrag.id));
        return [...bisher, ...nutzlast.activities.filter((eintrag) => !bekannt.has(eintrag.id))];
      });
      setWeitere(nutzlast.weitere);
    } catch (gefangen) {
      setFehler(gefangen instanceof Error ? gefangen.message : String(gefangen));
    } finally {
      setLaedt(false);
    }
  }

  if (eintraege.length === 0) {
    return (
      <div className="glass fade-up flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-400/20 text-violet-200">
          <History className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-white">Noch kein Verlauf</h2>
          <p className="mt-1 max-w-md text-sm text-slate-400">
            Sobald du ein Projekt anlegst, Aufgaben verschiebst oder Notizen schreibst, steht es
            hier.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Die Jahreszahl gehoert dazu: eine Zeitleiste reicht weit zurueck,
          und "3. Januar" allein sagt dann nicht genug. */}
      <ActivityDayGroups tage={tage} mitJahr />

      {fehler ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {fehler}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-2 pt-1">
        {weitere ? (
          <button type="button" className="btn btn-ghost" onClick={mehr} disabled={laedt}>
            {laedt ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Ältere laden
          </button>
        ) : (
          <p className="text-xs text-slate-600">Das war alles.</p>
        )}
        <p className="text-[11px] text-slate-600 tabular-nums">
          {eintraege.length} {eintraege.length === 1 ? "Vorgang" : "Vorgänge"} geladen
        </p>
      </div>
    </div>
  );
}
