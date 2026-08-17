import Link from "next/link";
import { CalendarRange, CheckSquare, FolderGit2, NotebookPen, Plus } from "lucide-react";
import { ACTIVITY_KINDS } from "@/components/activityKinds";
import type { Kennzahlen } from "@/lib/review";
import { accentOf } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ReviewDay, ReviewEntry } from "@/types";

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

const WOCHENTAG = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
});
const TAG_MONAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "numeric",
  month: "long",
});
const UHRZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

function alsDatum(tag: string): Date {
  const [j, m, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t, 12));
}

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

      {/* Verlauf nach Tagen */}
      <div className="space-y-6">
        {tage.map((tag) => {
          const datum = alsDatum(tag.tag);
          return (
            <section key={tag.tag}>
              <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                  {WOCHENTAG.format(datum)}
                </h2>
                <span className="text-xs text-slate-500">{TAG_MONAT.format(datum)}</span>
                <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] tabular-nums text-slate-400">
                  {tag.eintraege.length}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
              </div>

              <ul className="glass divide-y divide-white/6 overflow-hidden">
                {tag.eintraege.map((eintrag) => (
                  <Zeile key={eintrag.id} eintrag={eintrag} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
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

function Zeile({ eintrag }: { eintrag: ReviewEntry }) {
  const art = ACTIVITY_KINDS[eintrag.kind];
  const Icon = art.icon;
  const accent = accentOf(eintrag.project.accent);

  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4">
      <span className={cn("mt-0.5 shrink-0", art.color)} title={art.label}>
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-slate-200">{eintrag.summary}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
          {/* Das Projekt gehoert in jede Zeile – ohne es ist eine
              projektuebergreifende Liste nicht zu lesen. */}
          <Link
            href={`/projects/${eintrag.project.id}`}
            className="inline-flex max-w-[12rem] items-center gap-1.5 truncate text-slate-400 underline-offset-2 hover:text-violet-300 hover:underline"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent.from }}
              aria-hidden="true"
            />
            {eintrag.project.name}
          </Link>
          <span className="tabular-nums">{UHRZEIT.format(new Date(eintrag.createdAt))} Uhr</span>
          {eintrag.user ? (
            <span className="hidden xs:inline">
              {eintrag.user.displayName?.trim() || eintrag.user.username}
            </span>
          ) : (
            // Ohne Benutzer: das war der Zeitgeber oder ein Webhook.
            <span className="hidden text-slate-600 xs:inline">automatisch</span>
          )}
        </div>
      </div>
    </li>
  );
}
