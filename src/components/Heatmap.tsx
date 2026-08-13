import { CalendarRange } from "lucide-react";
import type { CommitCalendar } from "@/lib/git/calendar";
import { formatDate } from "@/lib/utils";

/**
 * Commits je Tag als Kalender – ein Feld pro Tag, Wochen als Spalten.
 *
 * Wie die Verlaufslinie ohne Diagrammbibliothek: es sind Quadrate in einem
 * Raster, dafuer braucht es keine Achsen und keine Legende ausser der
 * Farbskala.
 *
 * Gezeichnet wird nur der Zeitraum, fuer den wirklich Daten vorliegen.
 * Wo die Seiten des Anbieters nur ein paar Monate zurueckreichen, faengt die
 * Heatmap dort an – ein leeres Feld wuerde sonst behaupten, an dem Tag sei
 * nicht gearbeitet worden, obwohl darueber nichts bekannt ist.
 */

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONATE = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/** Fuenf Stufen, damit ein einzelner Ausreisser nicht alles andere platt macht. */
function stufe(anzahl: number, hoch: number): number {
  if (anzahl <= 0) return 0;
  if (hoch <= 1) return 4;
  const anteil = anzahl / hoch;
  if (anteil > 0.75) return 4;
  if (anteil > 0.5) return 3;
  if (anteil > 0.25) return 2;
  return 1;
}

const FARBEN = [
  "fill-white/6",
  "fill-violet-500/25",
  "fill-violet-500/45",
  "fill-violet-400/70",
  "fill-violet-300",
];

/** Montag der Woche, in der dieser Tag liegt (UTC). */
function wochenanfang(tag: Date): Date {
  const kopie = new Date(tag);
  // getUTCDay: 0 = Sonntag. Die Woche soll am Montag beginnen.
  const versatz = (kopie.getUTCDay() + 6) % 7;
  kopie.setUTCDate(kopie.getUTCDate() - versatz);
  kopie.setUTCHours(0, 0, 0, 0);
  return kopie;
}

export function Heatmap({ calendar }: { calendar: CommitCalendar }) {
  const von = new Date(`${calendar.from}T00:00:00.000Z`);
  const bis = new Date(`${calendar.to}T00:00:00.000Z`);
  if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime()) || von > bis) return null;

  const start = wochenanfang(von);
  const wochen: Array<Array<{ key: string; anzahl: number; ausserhalb: boolean }>> = [];

  let hoechstwert = 0;
  for (const wert of Object.values(calendar.days)) {
    if (wert > hoechstwert) hoechstwert = wert;
  }

  const zeiger = new Date(start);
  while (zeiger <= bis) {
    const woche: Array<{ key: string; anzahl: number; ausserhalb: boolean }> = [];
    for (let tag = 0; tag < 7; tag += 1) {
      const key = zeiger.toISOString().slice(0, 10);
      // Vor dem ersten bekannten Tag und nach heute wird nichts gezeichnet.
      const ausserhalb = zeiger < von || zeiger > bis;
      woche.push({ key, anzahl: calendar.days[key] ?? 0, ausserhalb });
      zeiger.setUTCDate(zeiger.getUTCDate() + 1);
    }
    wochen.push(woche);
  }

  const gesamt = Object.values(calendar.days).reduce((sum, wert) => sum + wert, 0);
  const tageMitCommits = Object.keys(calendar.days).length;

  // Masse in SVG-Einheiten; die Breite ergibt sich aus der Zahl der Wochen.
  const feld = 11;
  const luecke = 3;
  const kopf = 14;
  const spalte = feld + luecke;
  const breite = wochen.length * spalte - luecke;
  const hoehe = kopf + 7 * spalte - luecke;

  // Monatsbeschriftung an der Woche, in der ein neuer Monat beginnt.
  const monate: Array<{ x: number; label: string }> = [];
  let letzterMonat = -1;
  wochen.forEach((woche, index) => {
    const ersterTag = new Date(`${woche[0].key}T00:00:00.000Z`);
    const monat = ersterTag.getUTCMonth();
    if (monat !== letzterMonat) {
      letzterMonat = monat;
      monate.push({ x: index * spalte, label: MONATE[monat] });
    }
  });

  return (
    <div className="glass p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <CalendarRange className="h-3 w-3" />
          Commits je Tag
        </p>
        <p className="text-[11px] text-slate-500">
          {gesamt} an {tageMitCommits} {tageMitCommits === 1 ? "Tag" : "Tagen"} ·{" "}
          {/* Der Zeitraum gehoert dazu: er ist nicht immer ein Jahr. */}
          seit {formatDate(calendar.from)}
          {calendar.truncated ? " (Älteres nicht abgerufen)" : ""}
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        {/*
          Kein max-w-full: zusammen mit der festen Hoehe staucht das die
          Wochen auf schmalen Anzeigen zu einem unlesbaren Streifen, statt
          den Elter seitlich scrollen zu lassen. Die Kalenderfelder haben
          eine feste Groesse – die Karte gehoert geschoben, nicht gequetscht.
        */}
        <svg
          viewBox={`0 0 ${breite + 22} ${hoehe}`}
          width={breite + 22}
          height={hoehe}
          className="block shrink-0"
          role="img"
          aria-label={`Commits je Tag seit ${formatDate(calendar.from)}: ${gesamt} an ${tageMitCommits} Tagen`}
        >
          {monate.map((monat, index) => (
            <text
              key={`${monat.label}-${index}`}
              x={monat.x + 22}
              y={9}
              className="fill-slate-500 text-[8px]"
            >
              {monat.label}
            </text>
          ))}

          {/* Nur jeder zweite Wochentag, sonst steht es zu eng. */}
          {WOCHENTAGE.map((tag, index) =>
            index % 2 === 1 ? (
              <text
                key={tag}
                x={0}
                y={kopf + index * spalte + feld - 2}
                className="fill-slate-600 text-[7px]"
              >
                {tag}
              </text>
            ) : null,
          )}

          {wochen.map((woche, x) =>
            woche.map((tag, y) =>
              tag.ausserhalb ? null : (
                <rect
                  key={tag.key}
                  x={x * spalte + 22}
                  y={kopf + y * spalte}
                  width={feld}
                  height={feld}
                  rx={2}
                  className={FARBEN[stufe(tag.anzahl, hoechstwert)]}
                >
                  <title>
                    {`${formatDate(tag.key)}: ${tag.anzahl} ${tag.anzahl === 1 ? "Commit" : "Commits"}`}
                  </title>
                </rect>
              ),
            ),
          )}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-slate-600">
        <span>weniger</span>
        {FARBEN.map((farbe, index) => (
          <svg key={index} width={9} height={9} aria-hidden>
            <rect width={9} height={9} rx={2} className={farbe} />
          </svg>
        ))}
        <span>mehr</span>
      </div>
    </div>
  );
}
