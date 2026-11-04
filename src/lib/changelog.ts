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
    version: "1.13.0",
    date: "2026-11-04",
    headline: "Den Webhook trägt Nebula jetzt selbst ein.",
    changes: [
      {
        kind: "neu",
        text:
          "„Webhook einrichten“ trägt den Haken mit dem Token der Verbindung gleich im " +
          "Git-System ein, statt URL und Geheimnis zum Abschreiben zu zeigen. Bei GitHub " +
          "braucht der Token dafür „Webhooks: Read and write“; fehlt das Recht, bleibt es " +
          "beim Eintragen von Hand.",
      },
      {
        kind: "besser",
        text:
          "Ein neues Geheimnis ersetzt den selbst eingetragenen Haken, statt einen zweiten " +
          "danebenzulegen, und Zurücknehmen entfernt ihn auch im Git-System.",
      },
      {
        kind: "besser",
        text:
          "Nebula liegt jetzt auf GitHub, Gitea spiegelt. Releases entstehen von selbst, " +
          "sobald eine neue Version auf main landet.",
      },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-11-04",
    headline: "Aufgaben und Issues finden von selbst zueinander — in beide Richtungen.",
    changes: [
      {
        kind: "neu",
        text:
          "Neue Issues werden auf Wunsch von selbst zu Aufgaben: bei jedem Abgleich und mit " +
          "Webhook sofort. Ein Issue, das ein Agent wie Claude Code anlegt, steht damit ohne " +
          "Klick im Brett. Einzuschalten je Projekt im Projektdialog.",
      },
      {
        kind: "neu",
        text:
          "Umgekehrt legt Nebula auf Wunsch zu jeder neuen Aufgabe gleich das Issue im " +
          "führenden Repository an. Klappt das nicht, bleibt die Aufgabe stehen, und der " +
          "Verlauf nennt den Grund.",
      },
      {
        kind: "besser",
        text:
          "Auch wenn beides gleichzeitig greift, entsteht keine Dublette: meldet der Webhook " +
          "ein eben angelegtes Issue schneller zurück, als Nebula seine Nummer speichert, " +
          "bleibt die ursprüngliche Aufgabe mit Beschreibung und Zustand stehen.",
      },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-09-10",
    headline: "Der Abgleich sagt, was er nicht holen konnte — und verliert dabei nichts mehr.",
    changes: [
      {
        kind: "behoben",
        text:
          "Ein fehlgeschlagener Teil-Abruf sah aus wie ein leeres Ergebnis. Ein Repository " +
          "mit 65 Commits meldete „Snapshot aktualisiert: 0 Branches, 0 Tags“ und überschrieb " +
          "dabei den letzten guten Stand. Jetzt steht am Repository, welcher Teil nicht kam " +
          "und woran es lag — und die vorhandenen Daten bleiben stehen.",
      },
      {
        kind: "behoben",
        text:
          "Die Commit-Heatmap kannte bei Gitea nur die jüngsten 50 Commits und gab deren " +
          "ältesten als Anfang des Zeitraums aus. Grund war eine Seitengröße, die angefragt " +
          "statt gemessen wurde: Gitea deckelt jede Antwort auf 50, egal was dasteht. Bei " +
          "einem Repository mit 76 Commits fehlte damit ein Drittel.",
      },
      {
        kind: "besser",
        text:
          "Ein Abruf, der in eine Zeitüberschreitung läuft, wird einmal nachgeschlagen — " +
          "einzeln statt zusammen mit den sieben anderen. Bei fehlenden Rechten oder einem " +
          "Rate-Limit passiert das bewusst nicht; das wird durch Wiederholen nicht besser.",
      },
      {
        kind: "neu",
        text:
          "Das Aufgabenbrett zeigt je Spalte höchstens so viele Karten, wie unter " +
          "Admin-Einstellungen eingestellt ist. Der Rest steht hinter „n weitere anzeigen“; " +
          "die Zahl an der Spalte nennt weiterhin alle.",
      },
      {
        kind: "neu",
        text:
          "Eine Aufgabenkarte trägt die Nummer ihres verknüpften Git-Issues. Bisher stand " +
          "die Verknüpfung nur im Bearbeiten-Dialog.",
      },
      {
        kind: "besser",
        text:
          "Die Rechte, die eine Git-Verbindung braucht, stehen Aufruf für Aufruf in der " +
          "README — getrennt nach reinem Abgleich und zusätzlicher Issue-Anbindung. Der " +
          "Hinweis unter dem Token-Feld nannte die Rechte für Actions nicht, ohne die bei " +
          "GitHub kein CI-Zustand ankommt.",
      },
      {
        kind: "behoben",
        text:
          "Ein unbrauchbarer Wert in GIT_API_TIMEOUT_MS legte den ganzen Abgleich still: " +
          "eine leere oder unlesbare Angabe wurde zu 0 ms, und damit brach jeder Aufruf ab, " +
          "bevor er begann. Jetzt gilt die Vorgabe, mit Warnung im Log.",
      },
    ],
  },
  {
    version: "1.10.1",
    date: "2026-08-18",
    headline: "Sichtbar, welche Aufgabe ein Issue hat — und nachlesbar, was ein Token dafür braucht.",
    changes: [
      {
        kind: "neu",
        text:
          "Auf dem Aufgabenbrett eines Projekts trägt eine Karte die Nummer ihres " +
          "verknüpften Git-Issues. Bisher stand die Verknüpfung nur im Bearbeiten-Dialog " +
          "und in der projektübergreifenden Übersicht — welche Aufgabe schon ein Issue " +
          "hat, war im Vorbeigehen nicht zu sehen.",
      },
      {
        kind: "besser",
        text:
          "Die Rechte einer Git-Verbindung stehen jetzt Aufruf für Aufruf in der README: " +
          "je System eine Tabelle aus Endpunkt, Zweck und benötigtem Recht. Getrennt nach " +
          "reinem Abgleich und zusätzlicher Issue-Anbindung, damit erkennbar ist, was sich " +
          "weglassen lässt. Bei GitLab ist belegt, dass es unterhalb von „api“ keinen " +
          "Schreibzugriff auf Issues gibt.",
      },
      {
        kind: "behoben",
        text:
          "Der Hinweis unter dem Token-Feld nannte die Rechte für Actions nicht, obwohl " +
          "der CI-Zustand bei GitHub genau daran hängt. Wer sich daran hielt, sah keinen " +
          "Build-Status.",
      },
    ],
  },
  {
    version: "1.10.0",
    date: "2026-08-18",
    headline: "Rückblick, Zeitleiste und eine Suche, die auch Aufgaben findet.",
    changes: [
      {
        kind: "neu",
        text:
          "Wochenrückblick über alle Projekte: Kennzahlen der Woche und darunter die " +
          "Vorgänge nach Tagen gebündelt. Blättern in frühere Wochen inbegriffen. " +
          "Erreichbar über die Schnellsuche und einen Verweis vom Dashboard.",
      },
      {
        kind: "neu",
        text:
          "Globale Zeitleiste: derselbe Verlauf, aber fortlaufend und ohne Wochengrenze, " +
          "mit Nachladen älterer Einträge. Geblättert wird per Cursor — bei mehreren " +
          "Einträgen im selben Augenblick verliert oder verdoppelt das keine Zeilen.",
      },
      {
        kind: "neu",
        text:
          "Das Aufgabendashboard hat ein Suchfeld über Titel, Beschreibung, Labels und " +
          "Projektname. Wer sucht, sucht dabei auch in Erledigtem — sonst findet man die " +
          "Aufgabe von letzter Woche nicht wieder.",
      },
      {
        kind: "besser",
        text:
          "Die Volltextsuche kannte bisher nur Notizen und findet jetzt auch Aufgaben — " +
          "mit denselben deutschen Stammformen: „Rechnung“ findet „Rechnungen“. Treffer " +
          "erscheinen im Projektbrett und in der Schnellsuche.",
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-08-17",
    headline: "Geschlossene Issues haken ihre Aufgabe auch ohne Webhook ab.",
    changes: [
      {
        kind: "neu",
        text:
          "Der Abgleich prüft jetzt den Zustand verknüpfter Issues: was in Git geschlossen " +
          "wurde, wird in Nebula abgehakt. Bisher konnte das nur der Webhook — war keiner " +
          "eingerichtet, blieb der Rückweg ganz aus.",
      },
      {
        kind: "besser",
        text:
          "Ein über Git geschlossenes Issue bewirkt jetzt dasselbe wie ein Haken in der " +
          "Oberfläche: bei wiederkehrenden Aufgaben entsteht die nächste Fassung, und der " +
          "Vorgang steht im Projektverlauf.",
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-08-15",
    headline: "Durchgang durch Anmeldung und Sitzungen nach OWASP.",
    changes: [
      {
        kind: "besser",
        text:
          "Passwörter werden deutlich aufwendiger gehasht (scrypt mit N=2^17 statt 2^15) — " +
          "das entspricht der Empfehlung des OWASP Password Storage Cheat Sheet. Bestehende " +
          "Passwörter werden bei der nächsten Anmeldung still auf den neuen Stand gebracht.",
      },
      {
        kind: "behoben",
        text:
          "Die Anmeldung verriet, welche Benutzernamen existieren: gesperrte, deaktivierte " +
          "und reine Passkey-Konten antworteten anders als unbekannte — und das schon vor " +
          "der Passwortprüfung. Jetzt gibt es die Auskunft erst, wenn das Passwort stimmt.",
      },
      {
        kind: "neu",
        text:
          "Sitzungen laufen nach acht Stunden ohne Nutzung ab, zusätzlich zur bestehenden " +
          "Frist von 30 Tagen. Einstellbar über SESSION_IDLE_HOURS; 0 schaltet es ab.",
      },
      {
        kind: "besser",
        text:
          "Das Sitzungscookie trägt bei HTTPS den Präfix „__Host-“ und gilt nur noch " +
          "SameSite=Strict. Beides muss einmalig neu angemeldet werden.",
      },
      {
        kind: "besser",
        text:
          "Die Passwortprüfung erkennt jetzt Wiederholungen, Zeichenfolgen und Passwörter, " +
          "die den eigenen Benutzernamen enthalten.",
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-08-15",
    headline: "Aufgaben und Git-Issues finden zusammen.",
    changes: [
      {
        kind: "neu",
        text:
          "Eine Aufgabe lässt sich als Issue im verknüpften Repository anlegen — per Knopf, " +
          "nie nebenbei. Danach wandert der Zustand mit: erledigt schließt das Issue, ein " +
          "Zurückziehen öffnet es wieder.",
      },
      {
        kind: "neu",
        text:
          "Webhooks. Ein Push aktualisiert den Stand sofort, statt bis zum nächsten " +
          "Abgleich zu warten; ein geschlossenes Issue hakt seine Aufgabe ab. Einzurichten " +
          "am Repository — URL und Geheimnis stehen dort bereit.",
      },
      {
        kind: "behoben",
        text:
          "Auf dem Telefon verdeckte die Bildschirmtastatur den halben Dialog, weil er mit " +
          "der vollen Fensterhöhe rechnete. Dialoge richten sich jetzt nach dem sichtbaren " +
          "Bereich und rücken über die Tastatur.",
      },
      {
        kind: "besser",
        text:
          "Aufgaben lassen sich in der Übersicht direkt bearbeiten. Bisher führte von dort " +
          "nur der Weg ins Projekt.",
      },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-08-14",
    headline: "Unterwegs erfassen — und eine Oberfläche, die aufs Telefon passt.",
    changes: [
      {
        kind: "behoben",
        text:
          "Auf dem Telefon war das Dashboard breiter als der Bildschirm: die Steuerleiste " +
          "konnte nicht umbrechen und schob den Knopf „Neues Projekt“ aus dem Bild. " +
          "Dasselbe im Projektkopf, wo „Löschen“ außerhalb lag. Beide Zeilen brechen " +
          "jetzt um.",
      },
      {
        kind: "neu",
        text:
          "Schnellerfassung: ein Blitzsymbol in der Kopfleiste, auf jeder Seite " +
          "erreichbar. Ein Feld, Enter, fertig — als Idee entsteht ein Projekt, als " +
          "Aufgabe eine Aufgabe im gewählten Projekt. Der Dialog bleibt danach offen, " +
          "weil auf eine Idee meist gleich die nächste folgt.",
      },
      {
        kind: "neu",
        text:
          "Eine Aufgabenseite über alle Projekte hinweg, geordnet nach Fälligkeit: " +
          "überfällig, heute, diese Woche, später, ohne Termin. Abhaken geht direkt " +
          "aus der Liste.",
      },
      {
        kind: "neu",
        text:
          "Vierte Ansicht im Dashboard: eine kompakte Liste. Auf dem Telefon passen " +
          "damit fünf Projekte auf einen Bildschirm statt auf vier.",
      },
      {
        kind: "besser",
        text:
          "Eingabefelder sind auf Berührungsgeräten 16 Pixel groß — darunter zoomt " +
          "iOS Safari beim Hineintippen die Seite heran und kehrt nicht von selbst " +
          "zurück. Knöpfe und der Fortschrittsregler sind mit dem Finger zu treffen.",
      },
      {
        kind: "behoben",
        text:
          "Die Verweise in der Kopfleiste und „Neues Projekt“ sind auf schmalen " +
          "Anzeigen reine Symbole und hießen für einen Screenreader gar nichts. " +
          "Jetzt tragen sie eine Beschriftung.",
      },
      {
        kind: "behoben",
        text:
          "Das Tag-Formular der Auswahlleiste war breiter als sein Menü und wurde " +
          "beschnitten — auf jeder Bildschirmbreite.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-07-27",
    headline: "Sicherheitsdurchsicht und eine Anleitung für den Server.",
    changes: [
      {
        kind: "behoben",
        text:
          "Ein Einmalkennwort ließ sich innerhalb seiner Gültigkeit mehrfach verwenden. " +
          "Das eingelöste Zeitfenster wird jetzt gemerkt — RFC 6238 verlangt das " +
          "ausdrücklich.",
      },
      {
        kind: "behoben",
        text:
          "Der Bildoptimierer von Next war ohne Anmeldung erreichbar und reichte Bilder " +
          "durch libvips, für das es offene Schwachstellen gibt. Nebula benutzt ihn " +
          "nirgends — jetzt ist er abgeschaltet.",
      },
      {
        kind: "neu",
        text:
          "DEPLOYMENT.md: Schritt für Schritt vom leeren Server bis zur Instanz hinter " +
          "TLS, mit Firewall, Sicherungen und Betrieb.",
      },
      {
        kind: "neu",
        text:
          "scripts/update.sh rollt ein Update aus: prüfen, holen, sichern, bauen, " +
          "starten, Gesundheit prüfen — und nennt bei einem Fehlschlag den Weg zurück.",
      },
      {
        kind: "besser",
        text:
          "Umsortieren im Brett und das Anlegen von Vorlagen sind jetzt ebenfalls " +
          "ratenbegrenzt.",
      },
      {
        kind: "besser",
        text:
          "Die Bereinigung des Markdowns ist mit elf Tests festgehalten: Skripte, " +
          "Ereignis-Attribute, javascript: und data: kommen nicht durch.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-07-26",
    headline: "Worum ging es hier nochmal?",
    changes: [
      {
        kind: "neu",
        text:
          "README-Vorschau auf der Projektseite. Erspart den Wechsel ins Git, nur um zu " +
          "sehen, worum ein halbvergessenes Projekt eigentlich ging.",
      },
      {
        kind: "besser",
        text:
          "Relative Links im README zeigen dorthin, wo sie hingehören — aufgelöst gegen " +
          "das Verzeichnis der Datei im Repository.",
      },
      {
        kind: "besser",
        text:
          "Bilder im README werden bewusst nicht geladen, sondern als anklickbarer " +
          "Verweis gezeigt. Die Content-Security-Policy dafür zu öffnen hieße, jedem " +
          "fremden README das Nachladen beliebiger Bilder zu erlauben — auch Zählpixeln.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-07-26",
    headline: "Was sich wiederholt, und was besser lesbar ist.",
    changes: [
      {
        kind: "neu",
        text:
          "Wiederkehrende Aufgaben: täglich, wöchentlich, alle zwei Wochen oder monatlich. " +
          "Wandert die Aufgabe nach „Erledigt“, entsteht die nächste von selbst.",
      },
      {
        kind: "behoben",
        text:
          "Gedämpfter Text erreichte auf dem dunklen Untergrund nur 3,8 statt der " +
          "geforderten 4,5 zu 1 — an 26 Stellen. Beide Stufen sind jetzt aufgehellt, " +
          "der Abstand zwischen ihnen bleibt sichtbar.",
      },
      {
        kind: "besser",
        text:
          "Die Barrierefreiheit ist mit axe-core über zehn Seitenzustände geprüft, " +
          "einschließlich der Dialoge. Keine Verstöße mehr gegen WCAG 2.1 AA.",
      },
      {
        kind: "besser",
        text:
          "Der Folgetermin rechnet vom Fälligkeitsdatum, nicht vom Abhaken — eine " +
          "wöchentliche Aufgabe bleibt auf ihrem Wochentag. Lange Liegengebliebenes " +
          "rutscht so weit vor, bis der Termin in der Zukunft liegt.",
      },
    ],
  },
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
