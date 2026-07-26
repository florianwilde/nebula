# Funktionsübersicht

Vollständige Auflistung dessen, was Nebula kann — gegliedert nach Bereichen.
Für Installation und Betrieb siehe [README.md](README.md).

---

## 0. Konten und Zugang

### 0.1 Betriebsarten

Beim ersten Aufruf führt `/setup` durch die Einrichtung des Administratorkontos. Dort — und
später jederzeit unter *Admin-Einstellungen* — wird die Betriebsart gewählt:

| Modus | Verhalten |
| --- | --- |
| **Einzelbetrieb** | Genau ein Konto. Keine Registrierung, keine Benutzerverwaltung. |
| **Mehrbenutzerbetrieb** | Beliebig viele Konten mit strikt getrennten Daten. Selbstregistrierung optional zuschaltbar. |

Der Wechsel in den Einzelbetrieb wird abgelehnt, solange mehr als ein Konto existiert —
sonst würden Konten ausgesperrt. Nach der Einrichtung ist `/setup` dauerhaft gesperrt.

### 0.2 Anmeldung

- **Benutzername und Passwort.** Mindestens 10 Zeichen, offensichtliche Passwörter werden
  abgelehnt. Hashing mit scrypt.
- **Passkey (WebAuthn).** Fingerabdruck, Gesichtserkennung oder Sicherheitsschlüssel. Die
  Anmeldung läuft über auffindbare Credentials, ein Benutzername ist also nicht nötig.
  Mehrere Passkeys pro Konto, benennbar und einzeln entfernbar.
- Ein Konto kann **ausschließlich** per Passkey nutzbar sein. Der letzte Passkey lässt sich
  dann nicht entfernen, solange kein Passwort gesetzt ist.
- Fehlversuche werden gezählt; nach acht sperrt sich das Konto für 15 Minuten.
- Die Fehlermeldung ist immer dieselbe und die Antwortzeit gleich lang, egal ob es den
  Benutzernamen gibt — so lässt sich nicht ausprobieren, welche Konten existieren.

### 0.3 Mein Konto

Anzeigename und E-Mail ändern · Passwort setzen oder wechseln · Passkeys verwalten ·
aktive Sitzungen einsehen (Browser, Betriebssystem, IP, letzte Aktivität) · überall
abmelden, wobei das eigene Gerät angemeldet bleibt.

### 0.4 Benutzerverwaltung (Administratoren)

- Konten anlegen, umbenennen, Rolle wechseln, deaktivieren, löschen
- Passwort eines Kontos neu setzen — beendet dessen Sitzungen sofort
- Übersicht je Konto: Projektzahl, Passkeys, letzte Anmeldung, Sperrstatus
- Selbstregistrierung an- und abschaltbar
- Schutzregeln: Der letzte aktive Administrator kann weder herabgestuft, deaktiviert noch
  gelöscht werden; das eigene Konto lässt sich nicht löschen oder deaktivieren.
- **Administratoren sehen keine fremden Projekte.** Sie verwalten Konten, nicht Inhalte.

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
- **Drei Ansichten**: freies Raster, nach Status gruppierte Abschnitte oder **Kanban**.
- **Volltextsuche über Notizen.** Die Suche im Board arbeitet auf den geladenen Projekten
  (Name, Kurzbeschreibung, Tags, Repo-Pfad). Notizen liegen dort nicht vor — sie
  mitzuladen würde die Seite aufblähen. Stattdessen sucht Postgres serverseitig mit
  seiner deutschen Textsuche, entprellt ab zwei Zeichen. Treffer erscheinen als eigene
  Liste mit hervorgehobener Fundstelle, die betroffenen Projekte werden zusätzlich
  eingeblendet. Deutsche Stammformen greifen: „Webhook" findet auch „Webhooks".
- **Archiv** ist standardmäßig ausgeblendet und per Schalter einblendbar.
- **Leerzustände** mit direktem Einstieg statt einer leeren Fläche.

### Kanban

Spalten je Status, Karten per Ziehen verschiebbar. Der Wechsel wird sofort angezeigt und
erst danach gespeichert; scheitert das Speichern, springt die Karte zurück.

- Gezogen wird am Griff links, nicht an der ganzen Karte — so bleibt der Titel ein
  normaler Link.
- Das Ziehen startet erst nach ein paar Pixeln Bewegung, damit Klicks weiter funktionieren.
  Auf Touchgeräten nach kurzem Halten.
- Die Reihenfolge innerhalb einer Spalte folgt der gewählten Sortierung. Frei sortieren
  ginge nur mit einer gespeicherten Position — bewusst nicht gebaut.

### Projektkarte auf einen Blick

Name und Favoritenstern · Kurzbeschreibung · Fortschrittsbalken · Provider-Badge ·
Default-Branch samt Anzahl weiterer Branches · letzter Tag · Alter des letzten Commits ·
Anzahl Notizen · Warnung bei Sync-Fehler · Tags · Statusauswahl · Priorität.

---

## 2a. Aufgaben je Projekt

Jedes Projekt hat ein eigenes Aufgabenbrett mit vier Spalten: **Offen · In Arbeit ·
Blockiert · Erledigt**.

- **Ziehen und Ablegen** zwischen den Spalten **und innerhalb** einer Spalte. Anders als
  beim Projektbrett ist die Reihenfolge hier bedeutsam, deshalb wird sie gespeichert.
- Gezogen wird am Griff links, damit ein Klick auf die Karte weiter den Dialog öffnet.
- Eine Aufgabe braucht nur einen Titel. Optional: Beschreibung (Markdown),
  Fälligkeitsdatum und Labels.
- **Fälligkeiten** färben sich mit: überfällig rot, heute gelb, in den nächsten Tagen
  gedämpft.
- Erledigtes wird durchgestrichen; der Zeitpunkt wird festgehalten und beim Zurückziehen
  wieder gelöscht.

### Fortschritt aus Aufgaben

Pro Projekt umschaltbar. Ist es an, ergibt sich der Fortschritt aus dem Anteil erledigter
Aufgaben und wird bei jeder Änderung neu berechnet — der Regler ist dann gesperrt, statt
einen Wert anzubieten, der gleich wieder überschrieben würde.

Auf der Projektkarte im Dashboard steht das Verhältnis als `3/8`.

### Wie die Reihenfolge gespeichert wird

Beim Ablegen schickt die Oberfläche je Spalte die **vollständige Liste** der Aufgaben in
ihrer neuen Reihenfolge; der Server vergibt daraus Position und Status. Das ist
wiederholbar, kommt ohne Positionsrechnerei im Browser aus, und ein verlorener Aufruf
lässt sich einfach erneut senden. IDs, die nicht zum Projekt gehören, werden ignoriert
statt verschoben.

---

## 3. Notizen

- **Beliebig viele Notizen pro Projekt**, mit optionalem Titel und mehrzeiligem Text.
- **Markdown wird dargestellt** — Überschriften, Listen, Tabellen, Codeblöcke, Zitate und
  Links. Aus `- [ ] Aufgabe` werden echte Checklisten. Gilt auch für die Projekt-
  beschreibung. Rohes HTML wird beim Rendern entfernt (`rehype-sanitize`) — der Inhalt
  stammt vom Benutzer und wäre sonst ein XSS-Loch.
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
| **Pull-/Merge-Requests** | bis zu 50 offene, mit Nummer, Titel, Autor, Alter, Labels, Entwurfskennzeichnung und Link |
| **Issues** | bis zu 50 offene, gleiche Angaben. Bei GitHub und Gitea werden PRs herausgefiltert, die dort in derselben Liste stecken |
| **CI-Status** | Letzter Lauf auf dem Default-Branch: erfolgreich, fehlgeschlagen, läuft, wartet oder abgebrochen — mit Name und Link |
| Branches | bis zu 50, mit SHA, Default-Markierung, Schutzstatus und (wo die API es liefert) letztem Commit |
| Tags | bis zu 25, mit SHA, Nachricht und Datum |
| Commits | die letzten 15 zur Anzeige; geholt werden 100 für die Aktivitätskurve |
| **Commit-Aktivität** | Balkenreihe der letzten Tage, auf Karte und Projektseite |
| Releases | bis zu 10, inklusive Pre-Release- und Draft-Kennzeichnung |
| Sprachen | Verteilung als Balken mit Prozentwerten |

Woher der CI-Status kommt:

| System | Quelle |
| --- | --- |
| GitHub | `actions/runs` für den Default-Branch; Lauf-Status und Ergebnis werden zusammengeführt |
| GitLab | `pipelines` für den Default-Branch |
| Gitea | Kombinierter Commit-Status — deckt Gitea Actions **und** externe Systeme wie Woodpecker ab, anders als ein reiner Actions-Endpunkt, den ältere Instanzen nicht kennen |

Zur Ehrlichkeit der Aktivitätskurve: geholt wird eine Seite mit 100 Commits. Reicht die
nicht über den ganzen Zeitraum, wird die Kurve auf den tatsächlich belegten Ausschnitt
gekürzt — eine Null zu zeichnen, wo wir schlicht nichts wissen, wäre falsch.

- **Snapshot-Prinzip**: Alle Daten werden in der Datenbank abgelegt. Das Dashboard bleibt
  ohne Netzverbindung oder bei erreichtem Rate-Limit vollständig nutzbar.

### 4.4 Automatischer Abgleich

Standardmäßig **aus** — jeder Durchlauf verbraucht fremde API-Kontingente, das soll eine
bewusste Entscheidung sein. Einschalten in den Admin-Einstellungen.

| Einstellung | Bedeutung |
| --- | --- |
| Abstand | 15 Minuten bis täglich |
| Projekte je Durchlauf | 1–100, Voreinstellung 25 |
| Fertige und archivierte auslassen | Dort ändert sich selten noch etwas |

Wie der Durchlauf arbeitet:

- Der Zeitgeber läuft im Serverprozess selbst (`instrumentation.ts`), prüft minütlich, ob
  ein Durchlauf fällig ist, und startet ihn. Kein zusätzlicher Container, kein externer
  Cron. Zwei Durchläufe überschneiden sich nie.
- **Am längsten nicht abgeglichene zuerst.** Was nicht in den Durchlauf passt, kommt beim
  nächsten Mal.
- **Zurückhalten nach Fehlschlägen:** Nach jedem Fehlversuch verdoppelt sich der Abstand
  bis zum nächsten Versuch (gedeckelt beim 16-fachen). Ein Repository mit abgelaufenem
  Token blockiert damit nicht dauerhaft das Kontingent.
- Kurze Pause zwischen zwei Projekten, damit kein Schwall entsteht.
- **Pro Projekt abschaltbar** über einen Schalter im Projektdialog. Manuell
  synchronisieren geht unabhängig davon immer.
- Der Adminbereich zeigt letzten und nächsten Durchlauf sowie einen Kurzbericht
  (aktualisiert / fehlgeschlagen / zurückgestellt) und hat einen Knopf **Jetzt abgleichen**.
- Wer lieber von außen taktet, lässt den Automatismus aus und ruft
  `POST /api/admin/sync/run` per eigenem Cron auf.

Der Abgleich läuft über alle Konten hinweg — er ist ein Serverauftrag, keine
Dateneinsicht. Ein Administrator sieht dadurch weiterhin keine fremden Projekte.
- **URL-Erkennung** für `https://…`, `git@host:owner/repo.git` und GitLab-Weboberflächen-URLs
  mit `/-/tree/…`; verschachtelte Gruppenpfade bleiben erhalten.
- **Ohne Token** funktionieren öffentliche Repositories, mit deutlich strengerem Rate-Limit.
- **Fehler landen am Projekt** statt in einer Fehlerseite: die Karte zeigt „Sync-Fehler",
  die Projektseite die genaue Meldung. Typische HTTP-Codes werden in Klartext übersetzt
  (401 Token, 403 Scopes/Rate-Limit, 404 Pfad, 408 Timeout).
- **Zeitlimit** pro Aufruf über `GIT_API_TIMEOUT_MS` einstellbar; die Teilabfragen laufen
  parallel, eine fehlschlagende Liste bricht den restlichen Sync nicht ab.

---

## 4a. Export, Import und Sicherung

### Projekte mitnehmen

- **JSON-Export** einzeln oder für alle Projekte: Stammdaten, Notizen, Tags,
  Repo-Verknüpfung. **Ohne Access Tokens** — die Verbindung wird nur beschrieben, das
  Token muss beim Import neu hinterlegt werden. Auch ohne Snapshots (reproduzierbar) und
  ohne Datenbank-IDs (gelten nur in der Quellinstanz).
- **Markdown-Export** eines Projekts: Beschreibung, Kennzahlen, Notizen und der letzte
  bekannte Git-Stand als lesbare Datei.
- **Import mit Vorschau.** Die Datei wird streng geprüft, bevor irgendetwas passiert.
  Abgeglichen wird über den Slug; bei Treffern stehen drei Strategien bereit:

  | Strategie | Wirkung |
  | --- | --- |
  | Überspringen | Vorhandene bleiben unverändert |
  | Zusätzlich anlegen | Kopie mit freiem Slug (`nebula` → `nebula-2`) |
  | Ersetzen | Stammdaten überschreiben, Notizen austauschen |

  Die Vorschau zeigt je Projekt, was geschähe, und weist auf fehlende Git-Verbindungen
  hin. Erst ein zweiter Klick schreibt.

### Sicherung

- **JSON-Sicherung** im Adminbereich: Einstellungen, Konten, Verbindungen, Projekte und
  Notizen in einer Datei. Passwörter als scrypt-Hash, Git-Tokens als Chiffrat — ohne
  dasselbe `APP_SECRET` wertlos. Sitzungen und Passkeys bleiben draußen: erstere sind
  kurzlebig, letztere hängen an Gerät und rpID.
- **Datenbank-Sicherung** über `scripts/backup.*`: `pg_dump` im Container, mit
  `--clean --if-exists`, also für sich allein einspielbar. Gegenstück ist
  `scripts/restore.*`, das vor dem Überschreiben nachfragt und sich über einen Parameter
  auf eine Wegwerf-Datenbank umlenken lässt — damit sich eine Sicherung prüfen lässt,
  ohne die echte anzufassen.

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
| `User` | Konten, Rolle, Passwort-Hash, Sperrzähler |
| `Session` | Serverseitige Sitzungen (nur der Token-Hash) |
| `Credential` | Passkeys inkl. öffentlichem Schlüssel und Signaturzähler |
| `WebAuthnChallenge` | Kurzlebige, einmalig verwendbare Challenges |
| `AppSettings` | Betriebsart und Registrierung (eine Zeile) |
| `Project` | Projektstammdaten, Status, Fortschritt, Repo-Verknüpfung, Besitzer |
| `Task` | Aufgaben mit Spalte, Position, Fälligkeit und Labels |
| `Note` | Notizen (n:1 zu Projekt, Cascade-Delete) |
| `GitConnection` | Git-Systeme inkl. verschlüsseltem Token, Besitzer |
| `RepoSnapshot` | Zwischengespeicherter Repo-Stand (1:1 zu Projekt) |

`Project.ownerId` und `GitConnection.ownerId` sind bewusst optional: so überleben Daten aus
der Zeit vor der Benutzerverwaltung die Migration und werden beim Anlegen des ersten Kontos
übernommen. Slug und Verbindungsname sind je Besitzer eindeutig — zwei Personen dürfen
beide ein Projekt „dashboard" haben.

Listen wie Branches oder Commits liegen als `JSONB`, damit providerspezifische Felder
nicht verloren gehen. Indizes auf Status, Verbindung und Änderungsdatum.

### 6.2 Sicherheit

- **Zugangsschutz in zwei Ebenen.** Die Middleware prüft nur, ob ein Sitzungscookie
  überhaupt mitkommt — im Edge-Runtime gibt es keine Datenbank. Verbindlich entschieden
  wird serverseitig in jeder Seite und jedem Endpunkt (`requireUserPage` /
  `requireUserApi`). Das ist die eigentliche Sicherheitsgrenze.
- **Datentrennung** über eine Besitzerbedingung in jeder Abfrage. Schreibzugriffe laufen
  über `updateMany`/`deleteMany` mit `ownerId` in der `where`-Klausel, treffen fremde
  Datensätze also gar nicht erst. Fremde IDs liefern `404` statt `403`.
- **CSRF**: Origin- bzw. `Sec-Fetch-Site`-Prüfung für alle schreibenden Methoden, dazu
  erzwungener `Content-Type: application/json`.
- **CSP mit Per-Request-Nonce** und `strict-dynamic`, plus `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'none'` und die üblichen Schutz-Header.
- **SSRF-Schutz** vor jedem ausgehenden Git-Aufruf: Hostname wird aufgelöst, jede
  Antwortadresse geprüft (schützt auch gegen DNS-Rebinding über einen zweiten A-Record),
  Redirect-Ziele werden erneut geprüft. Konfigurierbar über `GIT_ALLOW_LOOPBACK`,
  `GIT_BLOCK_PRIVATE` und `GIT_ALLOWED_HOSTS`.
- **Rate-Limiting** für Anmeldung (je IP und je Konto), ausgehende Git-Aufrufe und
  WebAuthn-Optionen.
- Access Tokens verschlüsselt mit **AES-256-GCM**, Schlüssel per **scrypt** aus
  `APP_SECRET` abgeleitet, Chiffrat versioniert (`v1.<iv>.<tag>.<data>`).
- Tokens werden nie an den Browser gesendet — alle API-Antworten nutzen eine Feldauswahl
  ohne `tokenCipher`.
- **Zod-Validierung** jeder Eingabe an der API-Grenze mit Feldfehlern für die UI, Body auf
  256 KB begrenzt.
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

### 6.4 Tests

`npm test` führt die Unit-Tests aus — reine Logik, kein DOM, keine Datenbank, unter einer
Sekunde:

| Bereich | Was geprüft wird |
| --- | --- |
| `utils` | Slug-Erzeugung inklusive Umlauten und Längenbegrenzung, Tag-Aufbereitung, Kürzen, Zahlenformat |
| `git/parse` | URL-Zerlegung für https, SSH, verschachtelte GitLab-Gruppen und Oberflächenpfade; Provider-Erkennung; Bildung der Aktivitätskurve |
| `security/ssrf` | Sperrlisten für Loopback, Link-Local, Metadaten-Endpunkt, CGNAT und Multicast; Formprüfung; die drei Umgebungsschalter |
| `auth/password` | scrypt-Rundlauf, unterschiedliches Salz, Ablageformat, Verhalten bei kaputten Hashes, Passwortregeln |

Bewusst ohne Datenbank- und Browsertests: die brauchen Infrastruktur und gehören in eine
CI-Pipeline. Das steht in der [ROADMAP](ROADMAP.md).

### 6.5 API

Zehn REST-Endpunkte für Projekte, Notizen, Verbindungen, Sync, Repo-Listen und Health.
Alles, was die Oberfläche kann, ist damit auch scriptbar. Übersicht in der
[README](README.md#api).

---

## 7. Ideen für später

Was als Nächstes kommen könnte, steht mit Aufwandsschätzung und offenen Fragen in
**[ROADMAP.md](ROADMAP.md)** — gedacht zum Durchsprechen und schrittweisen Abarbeiten.
