/**
 * Was sich von Fassung zu Fassung geaendert hat.
 *
 * Bewusst hier und nicht als CHANGELOG.md: die Liste wird in der Anwendung
 * angezeigt, und zwei Quellen liefen prompt auseinander – wie es der
 * Versionsnummer schon einmal passiert ist, die eine Zeit lang in der
 * Fusszeile und in der package.json stand und verschiedene Werte zeigte.
 *
 * Die oberste Fassung ist die aktuelle. Neue Eintraege kommen nach vorne.
 */

export type ChangeKind = "neu" | "besser" | "behoben";

export interface ChangeEntry {
  kind: ChangeKind;
  text: string;
}

export interface Release {
  version: string;
  /** ISO-Datum, ohne Uhrzeit. */
  date: string;
  /** Ein Satz darueber, worum es in dieser Fassung ging. */
  headline: string;
  changes: ChangeEntry[];
}

export const KIND_META: Record<ChangeKind, { label: string; className: string }> = {
  neu: {
    label: "Neu",
    className: "bg-violet-500/12 text-violet-200 ring-violet-400/30",
  },
  besser: {
    label: "Besser",
    className: "bg-cyan-500/12 text-cyan-200 ring-cyan-400/30",
  },
  behoben: {
    label: "Behoben",
    className: "bg-emerald-500/12 text-emerald-200 ring-emerald-400/30",
  },
};

export const CHANGELOG: Release[] = [
  {
    version: "1.2.0",
    date: "2026-07-26",
    headline: "Ein Jahr auf einen Blick, und ein Start ohne Leerlauf.",
    changes: [
      {
        kind: "neu",
        text:
          "Commit-Heatmap auf der Projektseite: ein Feld je Tag über bis zu ein Jahr, " +
          "mit Farbskala und Datum im Tooltip.",
      },
      {
        kind: "neu",
        text:
          "Projektvorlagen. Ein bewährtes Projekt über „Als Vorlage sichern“ festhalten — " +
          "Tags, Notizen und offene Aufgaben stehen dann beim nächsten Projekt bereit.",
      },
      {
        kind: "besser",
        text:
          "Die Heatmap-Daten kommen höchstens einmal am Tag und getrennt vom übrigen " +
          "Abgleich. Bei GitHub genügt ein Aufruf der Jahresstatistik, bei GitLab und " +
          "Gitea werden bis zu fünf Seiten Commits geholt.",
      },
      {
        kind: "besser",
        text:
          "Reicht die Historie nicht ein Jahr zurück, beginnt die Heatmap beim ältesten " +
          "bekannten Commit — leere Felder für unbekannte Zeiträume wären eine Lüge.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-07-26",
    headline: "Das Brett wird zur Arbeitsfläche.",
    changes: [
      {
        kind: "neu",
        text:
          "Freie Reihenfolge im Brett: Karten lassen sich innerhalb einer Spalte anordnen, " +
          "die Position bleibt erhalten.",
      },
      {
        kind: "neu",
        text:
          "Mehrfachauswahl. Über die Kästchen mehrere Projekte wählen und Status, Tags oder " +
          "Favoriten in einem Zug ändern — oder alle auf einmal löschen.",
      },
      {
        kind: "neu",
        text:
          "Als App installierbar: Nebula bringt ein Web-Manifest und eigene Symbole mit und " +
          "lässt sich auf dem Handy zum Startbildschirm hinzufügen.",
      },
      {
        kind: "neu",
        text: "Dieser Änderungsverlauf, erreichbar über die Versionsnummer in der Fußzeile.",
      },
      {
        kind: "besser",
        text:
          "Ansicht, Sortierung und der Archivschalter überdauern das Neuladen. Wer sein " +
          "Brett von Hand anordnet, will es beim nächsten Aufruf auch sehen.",
      },
      {
        kind: "behoben",
        text:
          "Neu angelegte, importierte und verschobene Projekte bekamen keine Position und " +
          "stapelten sich im Brett alle auf demselben Platz.",
      },
      {
        kind: "besser",
        text:
          "Umsortieren im Brett fasst das Änderungsdatum nicht mehr an. Vorher schob ein " +
          "Aufräumen sämtliche Projekte in der Sortierung „Zuletzt geändert“ nach oben.",
      },
      {
        kind: "besser",
        text:
          "Die Sortierung im Kopf ist im Brett abgeschaltet — dort zählt die Anordnung von Hand. " +
          "Sie stehen zu lassen, ohne dass sie wirkt, wäre irreführend.",
      },
      {
        kind: "besser",
        text:
          "Prisma liest seine Einstellungen aus prisma.config.ts statt aus der package.json. " +
          "Damit ist die Warnung vor Prisma 7 weg.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-26",
    headline: "Der Funktionsumfang ist beisammen.",
    changes: [
      {
        kind: "neu",
        text:
          "Aktivitätsverlauf je Projekt: Statuswechsel, Notizen, Aufgaben und neue Commits " +
          "in einer Zeitleiste.",
      },
      {
        kind: "neu",
        text:
          "Zwei-Faktor-Anmeldung per TOTP, mit QR-Code zum Einrichten und zehn " +
          "Wiederherstellungscodes für den Fall, dass das Gerät verloren geht.",
      },
      {
        kind: "neu",
        text:
          "Mehrere Repositories je Projekt — Frontend und Backend gehören in eine Karte. " +
          "Jedes mit eigenen Kennzahlen, eigener CI und eigenem Abgleich.",
      },
      {
        kind: "besser",
        text:
          "Benachrichtigungen merken sich den gemeldeten Zustand je Repository. Vorher " +
          "verdeckte ein rotes Frontend die rote Pipeline des Backends.",
      },
      {
        kind: "besser",
        text:
          "Stillstand bemisst sich am jüngsten Commit über alle Repositories: an einem " +
          "Vorhaben wird gearbeitet, sobald an einem seiner Teile gearbeitet wird.",
      },
      {
        kind: "behoben",
        text:
          "Der Verlauf lieferte ohne ausdrückliche Angabe genau einen Eintrag statt dreißig " +
          "— Number(null) ist 0, nicht „nicht angegeben“.",
      },
      {
        kind: "behoben",
        text:
          "Die Issue-Übernahme antwortete mit „nicht gefunden“, obwohl gar kein bestimmtes " +
          "Repository angefragt war.",
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-07-26",
    headline: "Schneller ans Ziel.",
    changes: [
      {
        kind: "neu",
        text:
          "Schnellsuche mit Strg+K: Projekte, Notizen und Bereiche, bedienbar allein mit " +
          "der Tastatur.",
      },
      {
        kind: "neu",
        text:
          "Offene Git-Issues als Aufgaben übernehmen, mit Titel, Labels und Link zurück. " +
          "Bereits übernommene werden übersprungen.",
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-07-26",
    headline: "Der sanfte Stups.",
    changes: [
      {
        kind: "neu",
        text:
          "Stillstehende Projekte melden sich, wenn länger kein Commit kam. Die Schwelle " +
          "steht im Adminbereich.",
      },
      {
        kind: "behoben",
        text:
          "Der neue Anlass fehlte im Prüfschema — die Oberfläche bot ihn an, der Server " +
          "lehnte ihn ab. Ein Test hält beide Listen seitdem zusammen.",
      },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-07-26",
    headline: "Bescheid bekommen, ohne nachzusehen.",
    changes: [
      {
        kind: "neu",
        text:
          "Benachrichtigungen über ntfy, Webhook (HMAC-signiert) und E-Mail — bei " +
          "fehlgeschlagenem Abgleich, roter CI oder neuer Version.",
      },
      {
        kind: "besser",
        text:
          "Gemeldet wird nur bei einer Änderung. Sonst käme bei einem Repo mit abgelaufenem " +
          "Token mit jedem Durchlauf dieselbe Nachricht.",
      },
      {
        kind: "behoben",
        text: "Im ntfy-Betreff wurden Emojis zu Fragezeichen, weil die Kopfzeile nur Latin-1 kann.",
      },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-07-26",
    headline: "Prüfen statt behaupten.",
    changes: [
      {
        kind: "neu",
        text: "Ende-zu-Ende-Tests mit Playwright gegen die gebaute Anwendung und eine eigene Datenbank.",
      },
      { kind: "neu", text: "CI-Pipeline für Gitea Actions." },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-07-26",
    headline: "Aufgaben je Projekt.",
    changes: [
      {
        kind: "neu",
        text: "Aufgabenbrett mit sortierbaren Spalten, Fälligkeitsdatum und Labels.",
      },
      { kind: "neu", text: "Fortschritt wahlweise aus dem Verhältnis erledigter Aufgaben." },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-07-26",
    headline: "Ziehen und ablegen.",
    changes: [
      { kind: "neu", text: "Kanban-Ansicht: Status per Ziehen ändern." },
      { kind: "neu", text: "CI-Status je Branch und Commit-Aktivität als Verlaufslinie." },
      {
        kind: "behoben",
        text:
          "Die Verlaufslinie log: bei 100 Commits innerhalb weniger Tage zeigte sie für die " +
          "übrigen Tage Nullen, obwohl schlicht keine Daten vorlagen.",
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-07-26",
    headline: "Text und Suche.",
    changes: [
      { kind: "neu", text: "Markdown in Beschreibung und Notizen." },
      { kind: "neu", text: "Volltextsuche über Notizen, mit hervorgehobenen Fundstellen." },
      { kind: "neu", text: "Listen offener Pull Requests und Issues." },
      { kind: "behoben", text: "Die Versionsnummer stand an zwei Stellen und lief auseinander." },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-07-25",
    headline: "Konten und Härtung.",
    changes: [
      { kind: "neu", text: "Benutzerverwaltung mit Passwort und Passkeys, Einzel- und Mehrbenutzerbetrieb." },
      { kind: "neu", text: "Export, Import und vollständige Sicherung." },
      { kind: "neu", text: "Automatischer Abgleich nach Zeitplan, einstellbar im Adminbereich." },
      {
        kind: "besser",
        text:
          "Härtung: CSRF-Prüfung, Content-Security-Policy mit Nonce, SSRF-Schutz mit " +
          "Namensauflösung, Ratenbegrenzung und harte Datentrennung je Konto.",
      },
      {
        kind: "behoben",
        text:
          "Menüs verschwanden hinter den Karten. Ursache war der Weichzeichner der " +
          "Glasoptik, der einen eigenen Bezugsrahmen aufspannt; Menüs hängen seitdem am " +
          "Seitenende statt in der Karte.",
      },
      {
        kind: "behoben",
        text:
          "Eingabefelder überlappten ihre Symbole, weil eigene CSS-Klassen außerhalb der " +
          "Kaskadenschichten gegen die Hilfsklassen gewannen.",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-25",
    headline: "Der Anfang.",
    changes: [
      {
        kind: "neu",
        text:
          "Projekte mit Status, Priorität, Fortschritt, Tags und Notizen — von der reinen " +
          "Idee bis zum fertigen Repo.",
      },
      { kind: "neu", text: "Git-Anbindung an GitHub, GitLab und Gitea über Access Token." },
      { kind: "neu", text: "Betrieb per Docker oder eigenständig, Daten in einer lokalen PostgreSQL." },
    ],
  },
];
