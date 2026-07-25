# Funktionsübersicht

Vollständige Auflistung dessen, was Nebula kann — gegliedert nach Bereichen.
Für Installation und Betrieb siehe [README.md](README.md).

---

## 1. Projekte

### 1.1 Anlegen und Verwalten

- **Idee genügt.** Ein Projekt braucht nur einen Namen. Alles Weitere — Beschreibung,
  Repository, Tags — lässt sich jederzeit nachtragen. Neue Projekte starten deshalb
  standardmäßig im Status *Idee*.
- **Bearbeiten** über einen Dialog, der auf dem Dashboard und der Projektseite
  identisch funktioniert.
- **Löschen** mit Rückfrage; zugehörige Notizen und der Repo-Snapshot verschwinden mit
  (Fremdschlüssel mit `ON DELETE CASCADE`).
- **Slug** wird automatisch aus dem Namen erzeugt (umlautfest) und bei Namenskollision
  durchnummeriert.

### 1.2 Felder

| Feld | Beschreibung |
| --- | --- |
| Name | Pflichtfeld |
| Kurzbeschreibung | Ein Satz für die Karte im Board |
| Beschreibung | Ausführliche Ideenskizze, Zeilenumbrüche bleiben erhalten |
| Status | Idee · In Planung · Offen · In Entwicklung · Fertig · Archiviert |
| Priorität | Niedrig · Normal · Hoch · Kritisch |
| Fortschritt | 0–100 %, per Regler |
| Akzentfarbe | Sechs Farbverläufe, prägen Karte und Detailseite |
| Tags | Kommagetrennt, bis zu 12 Stück, kleingeschrieben und dedupliziert |
| Favorit | Anpinnen — Favoriten stehen im Board immer oben |
| Git-Verbindung | Optionale Zuordnung zu einem Git-System |
| Repository | URL sowie Owner/Name (werden aus der URL abgeleitet) |

### 1.3 Status

Sechs Zustände, jeder mit eigener Farbe und Erklärung im Auswahlmenü:

| Status | Bedeutung |
| --- | --- |
| **Idee** | Noch ein Gedanke — nichts gebaut, nichts entschieden |
| **In Planung** | Scope, Stack und Schnitt werden festgelegt |
| **Offen** | Startklar, liegt aber gerade still |
| **In Entwicklung** | Wird aktiv gebaut |
| **Fertig** | Ausgeliefert und abgeschlossen |
| **Archiviert** | Ruht — bleibt erhalten, ist im Board aber ausgeblendet |

Der Status ist **direkt auf der Projektkarte** umschaltbar, ohne den Detailbereich zu
öffnen. Die Änderung wird optimistisch angezeigt und bei einem Fehler zurückgerollt.

---

## 2. Dashboard

- **Kennzahlen** oben: Anzahl Projekte mit Ø-Fortschritt, offene Ideen, aktive
  Entwicklungen, fertige Projekte, verknüpfte Repositories.
- **Volltextsuche** über Name, Kurzbeschreibung, Beschreibung, Tags und Repo-Pfad.
- **Statusfilter** als Chips mit Trefferzähler, mehrere gleichzeitig kombinierbar.
- **Sortierung** nach zuletzt geändert, Anlagedatum, Name, Fortschritt oder Priorität —
  Favoriten bleiben stets oben.
- **Zwei Ansichten**: freies Raster oder nach Status gruppierte Abschnitte.
- **Archiv** ist standardmäßig ausgeblendet und per Schalter einblendbar.
- **Leerzustände** mit direktem Einstieg statt einer leeren Fläche.

### Projektkarte auf einen Blick

Name und Favoritenstern · Kurzbeschreibung · Fortschrittsbalken · Provider-Badge ·
Default-Branch samt Anzahl weiterer Branches · letzter Tag · Alter des letzten Commits ·
Anzahl Notizen · Warnung bei Sync-Fehler · Tags · Statusauswahl · Priorität.

---

## 3. Notizen

- **Beliebig viele Notizen pro Projekt**, mit optionalem Titel und mehrzeiligem Text.
- **Anpinnen** — angepinnte Notizen stehen oben und sind farblich hervorgehoben.
- **Bearbeiten und Löschen** direkt in der Liste; Löschen fragt nach.
- **Zeitstempel**: Anlagedatum immer, „bearbeitet vor …" nur bei echter Änderung.
- Zeilenumbrüche und Einrückungen bleiben erhalten — Checklisten und Code-Schnipsel
  überleben das Speichern.
- Eine neue Notiz aktualisiert die Änderungszeit des Projekts, damit die Sortierung
  „zuletzt geändert" die tatsächliche Aktivität abbildet.

---

## 4. Git-Anbindung

### 4.1 Unterstützte Systeme

| System | API | Authentifizierung | Besonderheit |
| --- | --- | --- | --- |
| **GitHub** | REST v3 | `Authorization: Bearer` | github.com und GitHub Enterprise (`/api/v3`) |
| **GitLab** | API v4 | `PRIVATE-TOKEN` | gitlab.com und Self-Hosted, verschachtelte Gruppen |
| **Gitea / Forgejo** | API v1 | `Authorization: token` | beliebige eigene Instanz |

Mehrere Verbindungen desselben Typs sind möglich — etwa privates GitHub und
Firmen-Gitea nebeneinander.

### 4.2 Verbindungen verwalten

- Anlegen mit Anzeigename, System, Basis-URL und Access Token.
- **Verbindungstest** auf Knopfdruck: prüft Erreichbarkeit und Token, zeigt den erkannten
  Benutzer und bei Gitea zusätzlich die Serverversion. Ergebnis und Zeitpunkt werden
  gespeichert und in der Karte angezeigt.
- **Token-Verwaltung**: verschlüsselt gespeichert, in der UI nur als Hinweis (`ghp_…9f3a`)
  sichtbar. Beim Bearbeiten bedeutet ein leeres Feld „unverändert lassen".
- **Repository-Auswahl**: Nebula listet alle Repos, auf die der Token Zugriff hat, mit
  Suchfeld. Ein Klick übernimmt URL, Owner, Name und — falls noch leer — Projektname und
  Kurzbeschreibung.
- **Löschen** trennt nur die Verknüpfung; die Projekte selbst bleiben erhalten.

### 4.3 Was beim Sync geholt wird

| Bereich | Details |
| --- | --- |
| Repository | Voller Pfad, Beschreibung, Default-Branch, Sichtbarkeit, Größe, letzte Aktivität |
| Kennzahlen | Stars, Forks, offene Issues, offene Pull-/Merge-Requests |
| Branches | bis zu 50, mit SHA, Default-Markierung, Schutzstatus und (wo die API es liefert) letztem Commit |
| Tags | bis zu 25, mit SHA, Nachricht und Datum |
| Commits | die letzten 15, mit Kurz-SHA, Nachricht, Autor, Datum und Link |
| Releases | bis zu 10, inklusive Pre-Release- und Draft-Kennzeichnung |
| Sprachen | Verteilung als Balken mit Prozentwerten |

- **Snapshot-Prinzip**: Alle Daten werden in der Datenbank abgelegt. Das Dashboard bleibt
  ohne Netzverbindung oder bei erreichtem Rate-Limit vollständig nutzbar.
- **URL-Erkennung** für `https://…`, `git@host:owner/repo.git` und GitLab-Weboberflächen-URLs
  mit `/-/tree/…`; verschachtelte Gruppenpfade bleiben erhalten.
- **Ohne Token** funktionieren öffentliche Repositories, mit deutlich strengerem Rate-Limit.
- **Fehler landen am Projekt** statt in einer Fehlerseite: die Karte zeigt „Sync-Fehler",
  die Projektseite die genaue Meldung. Typische HTTP-Codes werden in Klartext übersetzt
  (401 Token, 403 Scopes/Rate-Limit, 404 Pfad, 408 Timeout).
- **Zeitlimit** pro Aufruf über `GIT_API_TIMEOUT_MS` einstellbar; die Teilabfragen laufen
  parallel, eine fehlschlagende Liste bricht den restlichen Sync nicht ab.

---

## 5. Oberfläche

- **Dark Glassmorphism**: milchige Glasflächen, driftende Nebel im Hintergrund, feines
  Raster, Neon-Akzente pro Projektfarbe.
- **Animationen**: gestaffelt einblendende Karten, Hover-Lift mit Farbverlaufsrand,
  animierte Fortschrittsbalken.
- **Responsiv** von Handy bis Ultrawide (bis zu vier Kartenspalten).
- **Barrierearm**: durchgehende ARIA-Labels, Escape schließt Dialoge, sichtbarer
  Fokusring, `prefers-reduced-motion` schaltet Animationen ab.
- **Deutschsprachig**, Datums- und Zahlenformate in `de-DE` mit fester Zeitzone
  Europe/Berlin, damit Server- und Browser-Darstellung übereinstimmen.

---

## 6. Daten und Technik

### 6.1 Datenmodell

| Tabelle | Inhalt |
| --- | --- |
| `Project` | Projektstammdaten, Status, Fortschritt, Repo-Verknüpfung |
| `Note` | Notizen (n:1 zu Projekt, Cascade-Delete) |
| `GitConnection` | Git-Systeme inkl. verschlüsseltem Token |
| `RepoSnapshot` | Zwischengespeicherter Repo-Stand (1:1 zu Projekt) |

Listen wie Branches oder Commits liegen als `JSONB`, damit providerspezifische Felder
nicht verloren gehen. Indizes auf Status, Verbindung und Änderungsdatum.

### 6.2 Sicherheit

- Access Tokens verschlüsselt mit **AES-256-GCM**, Schlüssel per **scrypt** aus
  `APP_SECRET` abgeleitet, Chiffrat versioniert (`v1.<iv>.<tag>.<data>`).
- Tokens werden nie an den Browser gesendet — alle API-Antworten nutzen eine Feldauswahl
  ohne `tokenCipher`.
- **Zod-Validierung** jeder Eingabe an der API-Grenze mit Feldfehlern für die UI.
- Prisma arbeitet ausschließlich mit parametrisierten Abfragen.

### 6.3 Betrieb

- **Zwei gleichwertige Betriebsarten**: Standalone (Node-Prozess, beliebige PostgreSQL)
  oder komplett in Docker — dieselbe Codebasis, dieselbe `.env`.
- **Docker-Compose-Profile**: `db` läuft immer, `--profile full` startet zusätzlich die
  App, `--profile tools` bringt Adminer als DB-Oberfläche mit.
- **Automatische Migration** beim Containerstart, inklusive Warteschleife auf die
  Datenbank.
- **Healthchecks**: `pg_isready` für Postgres, `/api/health` für die App.
- **Setup-Skript** erzeugt die `.env` samt zufälligem `APP_SECRET`.
- **Seed-Daten** auf Wunsch, idempotent — mehrfaches Ausführen legt nichts doppelt an.

### 6.4 API

Zehn REST-Endpunkte für Projekte, Notizen, Verbindungen, Sync, Repo-Listen und Health.
Alles, was die Oberfläche kann, ist damit auch scriptbar. Übersicht in der
[README](README.md#api).

---

## 7. Ideen für später

Bewusst nicht umgesetzt, aber vorgemerkt:

- Kanban-Board mit Drag & Drop zwischen den Statusspalten
- Webhooks, damit Pushes den Snapshot ohne Knopfdruck aktualisieren
- Markdown-Rendering in Beschreibung und Notizen
- Volltextsuche über Notizen hinweg
- Export eines Projekts als Markdown
- Automatischer Sync im Hintergrund (Intervall pro Verbindung)
- Mehrbenutzerbetrieb mit Login
