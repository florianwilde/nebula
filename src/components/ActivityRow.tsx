import Link from "next/link";
import { ACTIVITY_KINDS } from "@/components/activityKinds";
import { accentOf } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ReviewDay, ReviewEntry } from "@/types";

/**
 * Darstellung von Verlaufseintraegen – eine Zeile und die Gruppierung nach
 * Kalendertagen.
 *
 * Bewusst ohne "use client" und ohne Hooks: so laesst sich beides sowohl aus
 * einer Server-Komponente (Wochenrueckblick) als auch aus einer
 * Client-Komponente (Zeitleiste mit Nachladen) heraus benutzen. Zwei Kopien
 * derselben Zeile waeren beim naechsten Feinschliff auseinandergelaufen.
 *
 * Alle Formate mit fester Zeitzone – dieselbe Ueberlegung wie in lib/utils:
 * sonst weichen Server-Render und Hydration voneinander ab.
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
const TAG_MONAT_JAHR = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const UHRZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-08-17" → ein Zeitpunkt mittags, damit die Zeitzone nichts verschiebt. */
function alsDatum(tag: string): Date {
  const [j, m, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t, 12));
}

export function ActivityDayGroups({
  tage,
  /** Bei Tagen aus anderen Jahren gehoert die Jahreszahl dazu. */
  mitJahr = false,
}: {
  tage: ReviewDay[];
  mitJahr?: boolean;
}) {
  const format = mitJahr ? TAG_MONAT_JAHR : TAG_MONAT;

  return (
    <div className="space-y-6">
      {tage.map((tag) => {
        const datum = alsDatum(tag.tag);
        return (
          <section key={tag.tag}>
            <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                {WOCHENTAG.format(datum)}
              </h2>
              <span className="text-xs text-slate-500">{format.format(datum)}</span>
              <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] tabular-nums text-slate-400">
                {tag.eintraege.length}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            <ul className="glass divide-y divide-white/6 overflow-hidden">
              {tag.eintraege.map((eintrag) => (
                <ActivityRow key={eintrag.id} eintrag={eintrag} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function ActivityRow({ eintrag }: { eintrag: ReviewEntry }) {
  const art = ACTIVITY_KINDS[eintrag.kind] ?? ACTIVITY_KINDS.PROJECT_UPDATED;
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
