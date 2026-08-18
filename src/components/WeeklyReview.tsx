import { CalendarRange, CheckSquare, FolderGit2, NotebookPen, Plus } from "lucide-react";
import { ActivityDayGroups } from "@/components/ActivityRow";
import type { Kennzahlen } from "@/lib/review";
import type { ReviewDay } from "@/types";

/**
 * Der Wochenrueckblick.
 *
 * Bewusst eine Server-Komponente: es gibt nichts zu bedienen, alles steht
 * beim Rendern fest. Das spart dem Browser den ganzen Verlauf als JavaScript.
 *
 * Die Tage kommen fertig gebuendelt und in der richtigen Reihenfolge – die
 * Zuordnung "welcher Kalendertag" haengt an der Zeitzone und gehoert
 * deshalb auf den Server.
 */

export function WeeklyReview({
  tage,
  kennzahlen,
  istDieseWoche,
}: {
  tage: ReviewDay[];
  /** Fertig gezaehlt vom Server – die Anzeige rechnet nichts nach. */
  kennzahlen: Kennzahlen;
  istDieseWoche: boolean;
}) {
  const { gesamt, projekte, erledigt, neueAufgaben, notizen } = kennzahlen;

  if (gesamt === 0) {
    return (
      <div className="glass fade-up flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-400/20 text-violet-200">
          <CalendarRange className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-white">
            {istDieseWoche ? "Diese Woche war es still" : "In dieser Woche ist nichts passiert"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-slate-400">
            {istDieseWoche
              ? "Sobald du Aufgaben abhakst, Notizen schreibst oder etwas gepusht wird, steht es hier."
              : "Vielleicht lohnt ein Blick auf eine frühere Woche."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kennzahl label="Vorgänge" wert={gesamt} icon={CalendarRange} color="#a78bfa" />
        <Kennzahl label="Projekte berührt" wert={projekte} icon={FolderGit2} color="#38bdf8" />
        <Kennzahl label="Aufgaben erledigt" wert={erledigt} icon={CheckSquare} color="#34d399" />
        <Kennzahl label="Neue Aufgaben" wert={neueAufgaben} icon={Plus} color="#fbbf24" />
      </div>

      {notizen > 0 ? (
        <p className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
          <NotebookPen className="h-3.5 w-3.5" />
          Dazu {notizen} {notizen === 1 ? "neue Notiz" : "neue Notizen"}.
        </p>
      ) : null}

      {/* Verlauf nach Tagen – dieselbe Darstellung wie in der Zeitleiste. */}
      <ActivityDayGroups tage={tage} />
    </div>
  );
}

function Kennzahl({
  label,
  wert,
  icon: Icon,
  color,
}: {
  label: string;
  wert: number;
  icon: typeof CalendarRange;
  color: string;
}) {
  return (
    <div className="glass relative overflow-hidden p-3 sm:p-4">
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-white sm:text-3xl">
            {wert}
          </p>
        </div>
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl sm:h-9 sm:w-9"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
