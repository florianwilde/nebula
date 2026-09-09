/**
 * Commits je Tag ueber ein Jahr – die Grundlage der Heatmap.
 *
 * Getrennt vom uebrigen Abgleich, weil es zusaetzliche Aufrufe kostet: der
 * Kalender wird hoechstens einmal am Tag geholt. Von Stunde zu Stunde
 * aendert sich an einem Jahresueberblick ohnehin nichts Sichtbares.
 *
 * Wichtig ist die Ehrlichkeit ueber den Zeitraum. Wo es keine
 * Jahresstatistik gibt, reichen die Daten nur so weit zurueck wie die
 * abgerufenen Seiten – dann faengt die Heatmap dort an und tut nicht so, als
 * waere ein Jahr lang nichts passiert. Diesen Fehler hatte die Verlaufslinie
 * schon einmal.
 */

/** Wie weit die Heatmap hoechstens zurueckreicht. */
export const CALENDAR_DAYS = 365;

/**
 * Hoechstzahl Seiten, wo seitenweise geholt werden muss. Genug fuer die
 * allermeisten Repositories und wenig genug, um kein fremdes Kontingent zu
 * sprengen.
 */
export const CALENDAR_MAX_PAGES = 5;

/**
 * Angefragte Seitengroesse – eine Bitte, keine Zusage.
 *
 * Gitea antwortet hoechstens mit MAX_RESPONSE_ITEMS Eintraegen
 * (Voreinstellung 50), egal was hier steht; GitHub und GitLab erlauben 100.
 * Wie viele wirklich kommen, entscheidet deshalb erst die erste Antwort –
 * siehe calendarByPaging.
 */
export const CALENDAR_PAGE_SIZE = 100;

export interface CommitCalendar {
  /** Erster Tag, fuer den wirklich Daten vorliegen (yyyy-mm-dd). */
  from: string;
  /** Letzter beruecksichtigter Tag (yyyy-mm-dd). */
  to: string;
  /** Nur Tage mit Commits: { "2026-07-26": 3 }. Die Nullen ergaenzt die Anzeige. */
  days: Record<string, number>;
  /**
   * "stats" = Jahresstatistik des Anbieters, der Zeitraum ist vollstaendig.
   * "commits" = so weit, wie die Seiten zurueckreichten.
   */
  source: "stats" | "commits";
  /** Der Deckel hat gegriffen; aeltere Commits fehlen. */
  truncated: boolean;
}

/** Tag im Format yyyy-mm-dd, in UTC – so liefern es die Anbieter. */
export function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Der Tag, ab dem der Kalender hoechstens reicht. */
export function calendarSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - CALENDAR_DAYS * 86_400_000);
}

/**
 * Holt seitenweise Commit-Zeitpunkte und zaehlt sie zu Tagen zusammen.
 *
 * Abgebrochen wird, sobald eine Seite nicht mehr voll ist (dann gibt es
 * nichts weiter), sobald die Seite vollstaendig aus der Zeit vor dem
 * Zeitraum stammt, oder wenn der Deckel greift.
 *
 * "Voll" bemisst sich an der **ersten geliefertern Seite**, nicht an dem, was
 * angefragt wurde. Gitea deckelt jede Antwort auf MAX_RESPONSE_ITEMS
 * (Voreinstellung 50), unabhaengig vom angefragten limit. Wer gegen die
 * angefragten 100 vergleicht, haelt bei Gitea jede erste Seite fuer die
 * letzte – die Heatmap kannte deshalb nur die juengsten 50 Commits und gab
 * deren aeltesten als Anfang des Zeitraums aus. Bei einem Repository mit 76
 * Commits stand dort "50 an 2 Tagen seit dem 01.09.", und das las sich wie
 * eine Aussage ueber das Repository statt ueber die Seitengroesse.
 */
export async function calendarByPaging(
  ladeSeite: (seite: number) => Promise<Array<string | null>>,
  now: Date = new Date(),
): Promise<CommitCalendar | null> {
  const grenze = calendarSince(now).getTime();
  const days: Record<string, number> = {};
  let aeltester: number | null = null;
  let gedeckelt = false;
  /** Was die Gegenseite tatsaechlich als volle Seite ansieht. */
  let seitengroesse: number | null = null;

  for (let seite = 1; seite <= CALENDAR_MAX_PAGES; seite += 1) {
    const daten = await ladeSeite(seite);
    if (daten.length === 0) break;

    // Die erste Antwort setzt den Maßstab. Sie kann kleiner ausfallen als
    // angefragt; entscheidend ist nur, dass die folgenden Seiten daran
    // gemessen werden.
    if (seitengroesse === null) seitengroesse = daten.length;

    let innerhalb = 0;
    for (const value of daten) {
      if (!value) continue;
      const time = Date.parse(value);
      if (Number.isNaN(time)) continue;
      // Ein Commit-Datum in der Zukunft kommt vor – falsch gestellte Uhren.
      if (time > now.getTime()) continue;
      if (time < grenze) continue;

      innerhalb += 1;
      const key = dayKey(new Date(time));
      days[key] = (days[key] ?? 0) + 1;
      if (aeltester === null || time < aeltester) aeltester = time;
    }

    // Nicht mehr voll: das war die letzte Seite.
    if (daten.length < seitengroesse) break;
    // Die ganze Seite lag schon vor dem Zeitraum – weiter zurueck lohnt nicht.
    if (innerhalb === 0) break;

    // Letzte erlaubte Seite war voll und lag im Zeitraum: es gibt Aelteres,
    // das wir nicht geholt haben. Das gehoert an die Anzeige.
    if (seite === CALENDAR_MAX_PAGES) gedeckelt = true;
  }

  if (aeltester === null) return null;

  return {
    from: dayKey(new Date(aeltester)),
    to: dayKey(now),
    days,
    source: "commits",
    truncated: gedeckelt,
  };
}

/** Wie viele Commits der Kalender insgesamt kennt. */
export function calendarTotal(calendar: CommitCalendar): number {
  return Object.values(calendar.days).reduce((sum, value) => sum + value, 0);
}
