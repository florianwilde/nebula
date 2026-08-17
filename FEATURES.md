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

- **Benutzername und Passwort.** Mindestens 10 Zeichen. Abgelehnt werden naheliegende
  Passwörter, reine Ziffernfolgen, zu wenig verschiedene Zeichen (`abababab`),
  durchlaufende Folgen (`abcdefgh`) und alles, was den eigenen Benutzernamen enthält.
  **Keine Zusammensetzungsregeln** — ASVS 2.1.9 rät ausdrücklich davon ab, weil sie zu
  `Passwort1!` führen statt zu Entropie.
- **Hashing mit scrypt**, `N = 2^17, r = 8, p = 1` nach dem OWASP Password Storage Cheat
  Sheet (rund 0,5 s und 128 MiB je Prüfung). Die Parameter stehen im Hash, ältere bleiben
  also lesbar — und werden bei der nächsten Anmeldung still auf den aktuellen Stand
  gehoben. Das ist der einzige Moment, in dem das Klartextpasswort vorliegt.
- **Gleiche Antwort für alles Fehlgeschlagene.** Ob ein Konto existiert, gesperrt,
  deaktiviert oder reines Passkey-Konto ist, sagt die Anmeldung erst, wenn das Passwort
  stimmt. Davor gibt es genau einen Text und eine vergleichbare Antwortzeit
  (`fakeVerifyDelay`), damit sich Benutzernamen nicht durchprobieren lassen.
- **Passkey (WebAuthn).** Fingerabdruck, Gesichtserkennung oder Sicherheitsschlüssel. Die
  Anmeldung läuft über auffindbare Credentials, ein Benutzername ist also nicht nötig.
  Mehrere Passkeys pro Konto, benennbar und einzeln entfernbar.
- **Zwei-Faktor per TOTP.** Zeitbasiertes Einmalkennwort zusätzlich zum Passwort, für jede
  gängige Authenticator-App. Einrichtung über QR-Code oder abgetippten Schlüssel; scharf
  wird er erst nach einem bestätigten Code, damit sich niemand aussperrt, der den Scan
  nicht hinbekommt. Dazu zehn **Wiederherstellungscodes**, jeder genau einmal gültig —
  sie werden nur bei der Ausgabe angezeigt. Abschalten und Neuerzeugen verlangen das
  Passwort, nicht bloß eine offene Sitzung.
- Die Passkey-Anmeldung fragt **nicht** nach dem zweiten Faktor: der Passkey ist bereits an
  ein Gerät gebunden und damit selbst der zweite Faktor.
- Ein Konto kann **ausschließlich** per Passkey nutzbar sein. Der letzte Passkey lässt sich
  dann nicht entfernen, solange kein Passwort gesetzt ist.
- Fehlversuche werden gezählt; nach acht sperrt sich das Konto für 15 Minuten.
- Die Fehlermeldung ist immer dieselbe und die Antwortzeit gleich lang, egal ob es den
  Benutzernamen gibt — so lässt sich nicht ausprobieren, welche Konten existieren.

### 0.3 Mein Konto

Anzeigename und E-Mail ändern · Passwort setzen oder wechseln · Zwei-Faktor einrichten und
abschalten · Passkeys verwalten · aktive Sitzungen einsehen (Browser, Betriebssystem, IP,
letzte Aktivität) · überall abmelden, wobei das eigene Gerät angemeldet bleibt.

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

### Schnellerfassung

Ein Blitzsymbol in der Kopfleiste, auf jeder Seite erreichbar. Ein Feld, Enter, fertig —
als **Idee** entsteht ein Projekt im Status `IDEA`, als **Aufgabe** eine Aufgabe im
gewählten Projekt (`TODO`). Alles Weitere setzen die Vorgaben des Schemas.

Der Dialog **bleibt nach dem Anlegen offen** und leert nur das Feld. Wer eine Idee
notiert, hat meistens gleich die nächste; ihn jedes Mal neu zu öffnen wäre genau die
Hürde, die hier wegsoll. Angelegtes wird darunter mit Link bestätigt. Das zuletzt
gewählte Projekt wird gemerkt.

Der Einstieg sitzt in der Kopfleiste und nicht als schwebender Knopf unten rechts —
dort wäre er auf schmalen Anzeigen mit der Auswahlleiste kollidiert.

### Überblick

- **Kennzahlen** oben: Anzahl Projekte mit Ø-Fortschritt, offene Ideen, aktive
  Entwicklungen, fertige Projekte, verknüpfte Repositories. Auf dem Telefon zweispaltig,
  damit die Projekte nicht erst nach dem zweiten Wischen beginnen.
- **Volltextsuche** über Name, Kurzbeschreibung, Beschreibung, Tags und Repo-Pfad.
- **Statusfilter** als Chips mit Trefferzähler, mehrere gleichzeitig kombinierbar.
- **Sortierung** nach zuletzt geändert, Anlagedatum, Name, Fortschritt oder Priorität —
  Favoriten bleiben stets oben.
- **Vier Ansichten**: freies Raster, **kompakte Liste**, nach Status gruppierte Abschnitte
  oder **Kanban**.
- **Volltextsuche über Notizen.** Die Suche im Board arbeitet auf den geladenen Projekten
  (Name, Kurzbeschreibung, Tags, Repo-Pfad). Notizen liegen dort nicht vor — sie
  mitzuladen würde die Seite aufblähen. Stattdessen sucht Postgres serverseitig mit
  seiner deutschen Textsuche, entprellt ab zwei Zeichen. Treffer erscheinen als eigene
  Liste mit hervorgehobener Fundstelle, die betroffenen Projekte werden zusätzlich
  eingeblendet. Deutsche Stammformen greifen: „Webhook" findet auch „Webhooks".
- **Archiv** ist standardmäßig ausgeblendet und per Schalter einblendbar.
- **Leerzustände** mit direktem Einstieg statt einer leeren Fläche.

### Schnellsuche

**`Strg+K`** (auf dem Mac `Cmd+K`) öffnet überall eine Palette:

- **Projekte** nach Name, Kurzbeschreibung und Tags — ohne Eingabe stehen die letzten
  gleich bereit
- **Notizen** über dieselbe Volltextsuche wie im Board, entprellt ab zwei Zeichen
- **Bereiche**: Dashboard, Git-Verbindungen, Mein Konto, Admin-Einstellungen

Bedienung über Tastatur: Pfeile wählen, `Enter` öffnet, `Esc` schließt. Die Projektliste
wird beim ersten Öffnen geholt und dann behalten — sie bei jedem Tastendruck neu zu laden
wäre Verschwendung.

### Projektvorlagen

Ein Projekt, das sich bewährt hat, lässt sich im Projektkopf über **Als Vorlage sichern**
festhalten: Status, Priorität, Farbe, Tags, Notizen und offene Aufgaben. Beim Anlegen eines
neuen Projekts steht die Vorlage oben im Dialog zur Auswahl.

Bewusst benutzereigen statt fest eingebaut — welche Tags und welche Startaufgaben sinnvoll
sind, weiß nur, wer damit arbeitet. Eine mitgelieferte Liste wäre geraten.

- **Erledigte Aufgaben kommen nicht mit.** Eine Vorlage beschreibt, was zu tun ist, nicht
  was einmal getan wurde.
- **Repositories gehen nicht mit.** Eine Vorlage, die jedes neue Projekt an dasselbe
  Repository hängt, wäre eine Falle.
- Die Stammdaten füllt der Dialog **sichtbar** in die Felder, damit sie vor dem Speichern
  noch änderbar sind; bereits Getipptes wird nicht überschrieben. Notizen und Aufgaben legt
  erst der Server an — im Dialog ließen sie sich nicht darstellen.
- Vorlagen überleben das Löschen ihres Ursprungsprojekts.

### Mehrfachauswahl

Ein Kästchen auf jeder Karte — es erscheint erst beim Überfahren, damit nicht auf jeder
Karte dauerhaft eines steht. Sobald etwas ausgewählt ist, fährt unten eine Leiste ein:
**Status setzen**, **Tags ergänzen oder entfernen**, **als Favorit markieren**, **löschen**.

Was der Filter ausblendet, fällt aus der Auswahl. Sonst träfe eine Massenänderung Projekte,
die man gar nicht mehr vor Augen hat. Fremde IDs fallen serverseitig still unter den Tisch.

### Liste

Eine Zeile je Projekt, alle gleich aufgebaut: Statusfarbe als Streifen, Name,
Fortschrittsbalken mit Prozentwert, danach Aufgaben, Notizen, Branch und Alter des
letzten Commits. Der Statuswechsler sitzt rechts, die ganze Zeile ist ein Link.

Gedacht ist die Ansicht für zwei Fälle:

- **Auf dem Telefon.** Eine Karte braucht rund 260 px Höhe und steht dort zwangsläufig
  allein in der Zeile — fünf Projekte füllen zwei Bildschirme, bevor man überhaupt
  etwas vergleichen kann. Eine Zeile kommt mit einem Viertel davon aus.
- **Beim Vergleichen.** Weil alle Zeilen gleich gebaut sind, liegen Name, Fortschritt
  und Status untereinander. Genau das verliert das Raster, sobald es einspaltig wird.

Was nicht mehr in die Zeile passt, fällt der Reihe nach weg, statt sie zu sprengen:
Notizen ab `sm`, Branch ab `md`, der letzte Commit und die Priorität ab `lg`.

### Kanban

Spalten je Status, Karten per Ziehen verschiebbar. Der Wechsel wird sofort angezeigt und
erst danach gespeichert; scheitert das Speichern, springt die Karte zurück.

- Gezogen wird am Griff links, nicht an der ganzen Karte — so bleibt der Titel ein
  normaler Link.
- Das Ziehen startet erst nach ein paar Pixeln Bewegung, damit Klicks weiter funktionieren.
  Auf Touchgeräten nach kurzem Halten.
- **Freie Reihenfolge innerhalb einer Spalte.** Die Position wird am Projekt gespeichert,
  wie beim Aufgabenbrett. Deshalb ist die Sortierung im Kopf in dieser Ansicht abgeschaltet
  — sie stehen zu lassen, ohne dass sie wirkt, wäre irreführend.
- Reines Umsortieren fasst das Änderungsdatum **nicht** an. Sonst schöbe ein Aufräumen im
  Brett sämtliche Projekte in der Sortierung „Zuletzt geändert“ nach oben.
- Neue, importierte und per Status verschobene Projekte landen am Ende ihrer Spalte.
- **Ansicht, Sortierung und Archivschalter überdauern das Neuladen** (im Browser
  gespeichert, nicht am Konto). Der Suchbegriff bleibt bewusst außen vor — eine Suche von
  gestern beim Öffnen wiederherzustellen wäre eher verwirrend als hilfreich.

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

### Wiederkehrende Aufgaben

Täglich, wöchentlich, alle zwei Wochen oder monatlich. Wandert die Aufgabe nach
**Erledigt** — im Dialog oder durch Ziehen —, entsteht die nächste von selbst. Die
erledigte bleibt stehen, sonst ginge die Historie verloren.

- **Gerechnet wird vom Fälligkeitsdatum, nicht vom Abhaken.** Eine wöchentliche Aufgabe
  bleibt auf ihrem Montag, auch wenn sie einmal erst am Mittwoch erledigt wurde.
- Lange Liegengebliebenes rutscht so weit vor, bis der Termin in der Zukunft liegt — eine
  Aufgabe, die schon bei ihrer Entstehung überfällig ist, hilft niemandem.
- Beim Monatsintervall bleibt der Tag im Monat erhalten. Der 31. Januar wird zum
  28. Februar, nicht zum 3. März.
- Nur der **Übergang** nach Erledigt löst aus. Eine bereits erledigte Aufgabe erneut zu
  speichern erzeugt keine zweite Fassung.
- Bewusst grob gehalten: feinere Regeln („jeden zweiten Dienstag im Monat") braucht ein
  Projektdashboard nicht und wären ohne Kalenderansicht kaum nachvollziehbar.

### Aus Git-Issues übernehmen

Im Git-Panel, Reiter *Issues*: ein Klick macht aus den offenen Issues Aufgaben — Titel,
Labels und ein Link zurück ins Git-System.

- Grundlage ist der **zuletzt geholte Stand**, hier wird nichts nachgeladen. Ein Klick
  soll nicht ungefragt fremde APIs ansprechen; wer den neuesten Stand will, gleicht
  vorher ab.
- Die Issue-Nummer bleibt an der Aufgabe und ist je Projekt eindeutig. Ein zweiter Klick
  legt deshalb **keine Dubletten** an, auch wenn die Aufgabe inzwischen verschoben oder
  umbenannt wurde.
- Ohne Repo-Stand meldet der Server das mit einem Hinweis statt still nichts zu tun.

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

## 2b. Aufgaben über alle Projekte

Die Seite `/tasks` sammelt jede Aufgabe aus jedem Projekt an einer Stelle. Erreichbar
über die Kopfleiste und die Schnellsuche.

**Geordnet wird nach Fälligkeit, nicht nach Spalte.** Projektübergreifend lautet die
Frage „was ist überfällig", nicht „was steht wo im Brett". Die Fächer:

| Fach | Inhalt |
| --- | --- |
| **Überfällig** | Termin liegt vor heute |
| **Heute** | Termin ist der heutige Kalendertag |
| **Diese Woche** | in den nächsten sieben Tagen |
| **Später** | alles danach |
| **Ohne Termin** | kein Fälligkeitsdatum gesetzt |

Gerechnet wird auf **Kalendertage in fester Zeitzone** (Europe/Berlin), nicht auf
Stunden und nicht nach Serverzeit. Eine heute um 9 Uhr fällige Aufgabe ist um 17 Uhr
nicht überfällig, sondern immer noch „heute" — sonst wanderte die halbe Liste im Lauf
des Tages nach oben. Und im Container läuft die Anwendung nach UTC; ohne feste Zeitzone
kippte die Einteilung abends um einen Tag. Das Fach bestimmt der **Server**, damit
Server-Render und Hydration nicht auseinanderlaufen.

- **Filter** nach Status (mit Zähler) und Projekt; Erledigtes ist ausgeblendet und
  einzeln zuschaltbar.
- **Abhaken direkt aus der Liste.** Der Endpunkt erledigt dabei den Rest: Zeitpunkt,
  abgeleiteter Projektfortschritt und — bei wiederkehrenden Aufgaben — die nächste
  Fassung.
- Jede Zeile nennt ihr **Projekt** und verlinkt es; ohne das ist eine übergreifende
  Liste nicht zu lesen. Stammt die Aufgabe aus einem Git-Issue, führt ein Symbol dorthin.

**Bewusst nicht sortierbar per Ziehen.** Die Position einer Aufgabe gilt innerhalb ihrer
Spalte in ihrem Projekt; hier wäre sie ohne Bedeutung. Eine Reihenfolge anzubieten, die
nirgends ankommt, wäre ein Versprechen, das die Seite nicht halten kann.

Die Aufgabe kennt keinen Besitzer — die Trennung läuft über das Projekt
(`project: { ownerId }` als einzige und erste Bedingung).

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

### 4.0 Mehrere Repositories je Projekt

Ein Vorhaben besteht oft aus mehreren Repositories — Frontend und Backend etwa, oder
App und Infrastruktur. Sie gehören trotzdem in **eine** Karte.

- Im Git-Panel steht eine Leiste mit allen Repositories des Projekts, sobald es mehr als
  eines gibt. Jedes hat eigene Kennzahlen, Listen, CI und eigenen Abgleich; „Alle" gleicht
  sie nacheinander ab — nicht gleichzeitig, denn ein Schwung Anfragen an denselben Anbieter
  ist genau das, worauf Rate-Limits reagieren.
- Eine frei wählbare **Bezeichnung** („Frontend") tritt an die Stelle von `owner/name`.
- Das erste Repository ist das **führende**. Wo nur eines dargestellt werden kann — auf der
  Karte im Dashboard, im Kanban —, ist es dieses. Die Karte zeigt daneben `+2 Repos`.
  Ein Abgleichsfehler an *irgendeinem* Repository erscheint auf der Karte, sonst bliebe er
  unbemerkt.
- **Stillstand** bemisst sich am jüngsten Commit über alle Repositories: an einem Vorhaben
  wird gearbeitet, sobald an einem seiner Teile gearbeitet wird.
- Benachrichtigungen merken sich den gemeldeten Zustand **je Repository**. Sonst verdeckte
  ein rotes Frontend die rote Pipeline des Backends. Der Betreff nennt das Repository nur,
  wenn es nicht ohnehin so heißt wie das Projekt.
- Übernommene Issues merken sich, aus welchem Repository sie stammen — Frontend und Backend
  haben beide ein Issue Nummer 5, und das sind zwei Aufgaben.

Der Projektdialog bearbeitet weiterhin nur das führende Repository; weitere verwaltet das
Git-Panel. Beim Anlegen eines Projekts entsteht aus den Git-Feldern das erste.

### 4.0a README-Vorschau

Das README des führenden Repositories steht auf der Projektseite — man muss nicht ins Git
wechseln, nur um zu sehen, worum ein halbvergessenes Projekt eigentlich ging. Lange
READMEs sind eingeklappt, ein Knopf zeigt alles.

- Geholt wird **höchstens einmal am Tag**, wie die Heatmap. GitHub hat einen eigenen
  Endpunkt, der jede Schreibweise findet; bei GitLab und Gitea braucht es zwei Aufrufe
  (Wurzelverzeichnis auflisten, dann die Datei holen).
- Erkannt werden `README.md` und die üblichen Varianten, Groß- und Kleinschreibung egal.
  Markdown hat Vorrang — nur das lässt sich wirklich darstellen.
- Bei 60 000 Zeichen wird an einer **Zeilengrenze** abgeschnitten, damit kein halber
  Codeblock stehen bleibt.
- **Relative Links** werden gegen das Verzeichnis der Datei im Repository aufgelöst, sonst
  liefen sie ins Leere.
- **Bilder werden nicht geladen.** Die Content-Security-Policy erlaubt `img-src` nur von
  der eigenen Instanz; sie dafür zu öffnen hieße, jedem fremden README das Nachladen
  beliebiger Bilder zu gestatten — also auch Zählpixeln. Für Abzeichen und
  Bildschirmfotos, die in einer Vorschau ohnehin Beiwerk sind, ist das kein guter Tausch.
  Stattdessen steht ein anklickbarer Verweis mit dem Alternativtext.
- Der Inhalt stammt aus einem fremden Repository und läuft deshalb durch dieselbe
  Bereinigung wie Notizen (`rehype-sanitize`).

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
| **Commit-Heatmap** | Ein Feld je Tag über bis zu ein Jahr, auf der Projektseite |
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
| Repositories je Durchlauf | 1–100, Voreinstellung 25 |
| Fertige und archivierte auslassen | Dort ändert sich selten noch etwas |

Gezählt und begrenzt wird je **Repository**, nicht je Projekt: sonst zöge ein Projekt mit
fünf Repos fünfmal so viele Anfragen nach sich, wie sein Platz im Kontingent hergibt.

Die Daten für die **Heatmap** kommen getrennt und höchstens einmal am Tag — an einem
Jahresüberblick ändert sich von Stunde zu Stunde nichts Sichtbares. Bei GitHub genügt dafür
ein Aufruf der Jahresstatistik; GitLab und Gitea kennen keine, dort werden bis zu fünf
Seiten Commits geholt. Reicht das nicht ein Jahr zurück, **beginnt die Heatmap beim
ältesten bekannten Commit** und sagt es dazu — leere Felder für Zeiträume zu zeichnen, über
die nichts bekannt ist, wäre eine Lüge.

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

### 4.6 Aufgabe ↔ Git-Issue

Die Verbindung geht in beide Richtungen — mit einer bewussten Grenze.

**Nebula → Git.** Ein Knopf im Aufgabendialog legt zur Aufgabe ein Issue im
verknüpften Repository an. Nummer und Adresse landen an der Aufgabe (`sourceIssue`,
`sourceUrl`, `sourceRepositoryId` — dieselben Felder, die die Übernahme aus Issues seit
v0.9.0 füllt, samt Eindeutigkeit je Repository gegen Dubletten). In den Rumpf kommt ein
Rückverweis auf das Projekt.

Ausdrücklich **per Knopf und nie nebenbei**: was in ein fremdes System geschrieben wird,
soll jemand gewollt haben. Danach wandert der Zustand allerdings mit — erledigt schließt
das Issue, ein Zurückziehen öffnet es wieder. Schlägt der Aufruf fehl, zieht die Aufgabe
trotzdem um; ein nicht erreichbares Git-System darf das Abhaken nicht verhindern.

**Git → Nebula** auf zwei Wegen, die sich ergänzen:

- **Webhook** — sofort, sobald das Issue geschlossen wird. Setzt voraus, dass die Instanz
  von außen erreichbar ist und der Haken eingetragen wurde (siehe 4.7).
- **Beim Abgleich** — verzögert, aber verlässlich. Der Abgleich fragt den Zustand
  verknüpfter Issues nach und hakt ab, was in Git geschlossen ist. Damit funktioniert der
  Rückweg auch ohne Webhook, ohne öffentliche Erreichbarkeit und selbst dann, wenn ein
  Haken einmal ausfällt.

  Gespart wird, wo es geht: Nummern, die der gerade geholte Snapshot als offen führt,
  werden nicht einzeln nachgefragt. Umgekehrt gilt das nicht — die Liste der offenen
  Issues ist gedeckelt, aus dem Fehlen einer Nummer folgt also nichts. Pro Durchgang
  fragt der Abgleich höchstens 25 Issues nach.

  **Der Abgleich hakt nur ab, er nimmt nie zurück.** Er sieht Zustände, keine Ereignisse:
  ein offenes Issue kann auch bedeuten, dass das Schließen von Nebula aus fehlgeschlagen
  ist. Ein symmetrischer Abgleich würde dann eine bewusst erledigte Aufgabe wieder
  aufmachen. Das Zurücknehmen bleibt dem Webhook vorbehalten, der ein echtes „reopened“
  sieht.

  Ein gelöschtes Issue ist kein erledigtes — die Aufgabe bleibt stehen.

In beiden Fällen bewirkt ein geschlossenes Issue dasselbe wie ein Haken in der
Oberfläche: bei einer wiederkehrenden Aufgabe entsteht die nächste Fassung, und der
Vorgang landet im Projektverlauf (ohne Benutzer — das hat nicht jemand in Nebula getan,
sondern das Git-System gemeldet).

**Die Zustände passen nicht aufeinander, und das bleibt so.** Nebula kennt
`Offen · In Arbeit · Blockiert · Erledigt`, ein Issue nur offen oder geschlossen. Nach
außen geht deshalb nur die Grenze um „erledigt“; ein Rundlauf verliert *In Arbeit* und
*Blockiert*. Labels wie `nebula:doing` wären die Alternative, würden aber den
Issue-Tracker mit Zuständen füllen, die dort niemand pflegt. Die feine Abstufung bleibt
in Nebula.

Eine echte beidseitige Synchronisation mit Konfliktauflösung gibt es **nicht** — das ist
der klassische Ort für stillen Datenverlust.

**Kein Widerspruch zu „keine eigenen Git-Operationen“:** Issues laufen über die HTTP-API
der Provider, dieselbe Schicht wie alles andere (`lib/git/http.ts`, SSRF-Schutz
inklusive). Kein Klon, kein Arbeitsverzeichnis. Schreibende Aufrufe folgen dabei
**keinen Umleitungen** — ein 307 auf eine interne Adresse nähme den Rumpf und den Token
im Header mit.

### 4.7 Webhooks

Ein Push aktualisiert den Stand sofort, statt bis zum nächsten Durchlauf des Zeitgebers
zu warten; ein geschlossenes Issue hakt seine Aufgabe ab. Der Zeitplan bleibt als
Rückfalllösung bestehen.

Einzurichten am Repository (Funksymbol im Git-Bereich): Nebula erzeugt URL und
Geheimnis, eingetragen wird der Haken im Git-System von Hand. Über die API anzulegen
wäre machbar, verlangte aber Administrationsrechte am Repository — deutlich mehr, als
Nebula sonst braucht.

Das Geheimnis ist **genau einmal** zu sehen; danach liegt es verschlüsselt in der
Datenbank, wie die Zugangstoken, und verlässt den Server nicht mehr.

| System | Ausweis | Kopfzeile |
| --- | --- | --- |
| GitHub | HMAC-SHA256 über den Rumpf | `X-Hub-Signature-256: sha256=…` |
| Gitea | dieselbe Rechnung, ohne Präfix | `X-Gitea-Signature` (ältere: `X-Hub-Signature-256`) |
| GitLab | das Geheimnis im Klartext | `X-Gitlab-Token` |

GitLabs Verfahren ist schwächer: es beweist nur, dass der Absender das Geheimnis kennt,
nicht dass der Rumpf unverändert ist. Mehr gibt die Plattform nicht her; verglichen wird
trotzdem zeitkonstant.

Geprüft wird gegen den **rohen** Rumpf — durch `JSON.parse` und `JSON.stringify` gedreht
käme eine andere Zeichenfolge heraus und die Signatur passte nie.

Was der Endpunkt bewusst **nicht** tut: den Rumpf als Quelle für Inhalte benutzen. Titel,
Beschreibung und Zustand kommen weiter aus Nebula beziehungsweise beim nächsten Abgleich
aus der API. Wer das Geheimnis kennt, kann also höchstens eine Aufgabe auf- oder zumachen
und einen Abgleich auslösen — keine beliebigen Daten einschleusen.

Unbekannte Ereignisse werden angenommen und liegen gelassen. Ein Fehler brächte das
Git-System zum Wiederholen und irgendwann zum Abschalten des Hakens.

Der Endpunkt ist der einzige ohne Anmeldung, der schreibt. Deshalb: Ratenbegrenzung je
Repository (60/Minute), Deckel auf die Rumpfgröße, und ein unbekanntes Repository
antwortet wie ein nicht eingerichtetes — mit 404, damit die ID nicht bestätigt wird.

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

## 4b. Benachrichtigungen

Einzurichten unter *Mein Konto → Benachrichtigungen*, pro Konto und beliebig viele Ziele.

### Anlässe

| Anlass | Wann |
| --- | --- |
| ⚠️ **Abgleich fehlgeschlagen** | Das Git-System war nicht erreichbar oder hat abgelehnt |
| 🔴 **CI rot** | Der letzte Lauf auf dem Default-Branch ist fehlgeschlagen |
| 🏷️ **Neues Release** | Ein neuer Tag oder ein neues Release ist aufgetaucht |
| 🕸️ **Projekt steht still** | Seit längerem kein Commit — Schwelle einstellbar, Vorgabe 60 Tage |

### Nur bei Änderung

Der entscheidende Punkt: Gemeldet wird **ausschließlich, wenn sich etwas ändert**
gegenüber dem, worüber zuletzt benachrichtigt wurde. Ein Repository mit abgelaufenem
Token meldet sich also **einmal**, nicht bei jedem stündlichen Durchlauf. Wird der Fehler
ein anderer, kommt eine neue Meldung; ist er behoben und tritt später erneut auf, ebenso.

Zwei Feinheiten:

- **Beim allerersten Abgleich** eines Repositories wird kein Release gemeldet — sonst
  wäre jede bereits vorhandene Version eine „Neuigkeit".
- Der Merkstand wird auch dann fortgeschrieben, wenn **kein** Ziel eingerichtet ist. Sonst
  käme beim ersten eingerichteten Ziel die ganze Vergangenheit hinterher.

### Stillstand

Der einzige Anlass, der an keinem Ereignis hängt — es passiert ja gerade nichts. Deshalb
ein eigener Durchlauf, **höchstens einmal am Tag**, unabhängig vom automatischen Abgleich.
Hört niemand auf diesen Anlass, läuft die Prüfung gar nicht erst.

Maßstab ist ausschließlich der **letzte Commit** im verknüpften Repository. Das
Änderungsdatum des Projekts taugt nicht: jeder Abgleich fasst es an und würde den
Stillstand immer wieder zurücksetzen. Projekte **ohne Repository** bleiben deshalb außen
vor, ebenso fertige und archivierte.

Gemeldet wird je Projekt einmal. Erneut erst, wenn danach wieder ein Commit kam und es
seitdem wieder still geworden ist — ein Projekt, das aufwacht und wieder einschläft, meldet
sich also ein zweites Mal.

Die Schwelle setzt ein Administrator unter *Admin-Einstellungen → Stillstand* (14 Tage bis
ein Jahr). Eine Änderung wirkt sofort, nicht erst nach 24 Stunden.

### Zustellwege

| Weg | Details |
| --- | --- |
| **ntfy** | Vollständige Themen-URL. Titel, Priorität und Symbol als Kopfzeilen; optionales Bearer-Token für geschützte Themen. Läuft auch gegen ein selbst gehostetes ntfy im eigenen Netz. |
| **Webhook** | JSON per POST mit Anlass, Titel, Text, Projektbezug und Tieflink. Mit hinterlegtem Geheimnis wird der Rumpf per HMAC-SHA256 signiert (`X-Nebula-Signature`), damit der Empfänger die Herkunft prüfen kann. |
| **E-Mail** | Über SMTP. Steht erst zur Verfügung, wenn `SMTP_HOST` in der `.env` gesetzt ist — sonst ist die Auswahl in der Oberfläche gesperrt und erklärt, warum. |

Jedes Ziel lässt sich einzeln **testen** und **pausieren**; Ergebnis und Zeitpunkt der
letzten Zustellung stehen an der Karte.

### Absicherung

- Zieladressen sind Benutzereingaben, die der Server abruft — sie laufen deshalb durch
  denselben **SSRF-Schutz** wie die Git-Verbindungen. Ein ntfy im eigenen Netz bleibt
  erlaubt, Loopback und Cloud-Metadaten nicht.
- Redirects werden **nicht verfolgt**: ein Umleitungsziel wäre nicht geprüft.
- Geheimnisse liegen AES-256-GCM-verschlüsselt und verlassen den Server nie; die
  Oberfläche zeigt nur einen Hinweis wie `test…mnis`.
- Eine fehlgeschlagene Zustellung lässt den Abgleich nicht scheitern — der Fehler landet
  am Ziel, nicht im Sync.

---

## 5. Oberfläche

- **Dark Glassmorphism**: milchige Glasflächen, driftende Nebel im Hintergrund, feines
  Raster, Neon-Akzente pro Projektfarbe.
- **Animationen**: gestaffelt einblendende Karten, Hover-Lift mit Farbverlaufsrand,
  animierte Fortschrittsbalken.
- **Responsiv** von Handy bis Ultrawide (bis zu vier Kartenspalten).
- **Barrierefrei nach WCAG 2.1 AA**, und zwar geprüft statt behauptet: axe-core läuft über
  zehn Seitenzustände einschließlich der Dialoge und meldet keine Verstöße. Durchgehende
  ARIA-Labels, Escape schließt Dialoge, sichtbarer Fokusring, `prefers-reduced-motion`
  schaltet Animationen ab.
  Bei der ersten Durchsicht fielen 26 Kontrastverstöße auf: gedämpfter Text erreichte auf
  dem sehr dunklen Untergrund nur 3,8 statt 4,5 zu 1. Statt an hundert Stellen die Klasse
  zu tauschen, sind die beiden gedämpften Stufen im Theme aufgehellt — der Abstand
  zwischen ihnen bleibt sichtbar.
- **Deutschsprachig**, Datums- und Zahlenformate in `de-DE` mit fester Zeitzone
  Europe/Berlin, damit Server- und Browser-Darstellung übereinstimmen.
- **Als App installierbar.** Ein Web-Manifest mit eigenen Symbolen — auf dem Handy
  „Zum Startbildschirm hinzufügen“, danach läuft Nebula ohne Adressleiste. Die
  maskierbare Fassung hat mehr Rand, weil Android Symbole je nach Gerät rund, eckig
  oder als Tropfen zuschneidet.
- **Änderungsverlauf** hinter der Versionsnummer in der Fußzeile: was neu ist, was besser
  wurde und welche Fehler behoben sind. Die Liste steht in `src/lib/changelog.ts` und ist
  die einzige Quelle — ein Test hält sie und `package.json` zusammen, weil genau diese
  beiden Angaben hier schon einmal auseinandergelaufen sind.

---

## 6. Daten und Technik

### 6.1 Datenmodell

| Tabelle | Inhalt |
| --- | --- |
| `User` | Konten, Rolle, Passwort-Hash, Sperrzähler |
| `Session` | Serverseitige Sitzungen (nur der Token-Hash) |
| `Credential` | Passkeys inkl. öffentlichem Schlüssel und Signaturzähler |
| `WebAuthnChallenge` | Kurzlebige, einmalig verwendbare Challenges |
| `RecoveryCode` | Wiederherstellungscodes für die Zwei-Faktor-Anmeldung (nur der Hash) |
| `PendingLogin` | Zwischenzustand zwischen Passwort und zweitem Faktor, fünf Minuten gültig |
| `AppSettings` | Betriebsart und Registrierung (eine Zeile) |
| `Project` | Projektstammdaten, Status, Fortschritt, Besitzer |
| `Repository` | Repositories eines Projekts inkl. Abgleichstand (n:1 zu Projekt) |
| `Task` | Aufgaben mit Spalte, Position, Fälligkeit, Labels, Wiederholung und Issue-Herkunft |
| `ProjectTemplate` | Vorlagen je Konto: Stammdaten, Tags, Notizen und Aufgaben |
| `Activity` | Verlauf je Projekt, neueste zuerst, auf 200 Einträge begrenzt |
| `NotificationTarget` | Zustellwege je Konto, mit verschlüsseltem Geheimnis |
| `Note` | Notizen (n:1 zu Projekt, Cascade-Delete) |
| `GitConnection` | Git-Systeme inkl. verschlüsseltem Token, Besitzer |
| `RepoSnapshot` | Zwischengespeicherter Repo-Stand (1:1 zu Repository) |

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
- **Sitzungen**: Zufallstoken mit 256 Bit, in der Datenbank nur als SHA-256-Hash — wer die
  Datenbank liest, kann keine Sitzung übernehmen. Geprüft wird bei jeder Anfrage, Abmelden
  und Sperren wirken also sofort. Zwei Fristen nach ASVS 3.3.2: **absolut** 30 Tage ab
  Anmeldung (`SESSION_TTL_DAYS`) und **im Leerlauf** 8 Stunden (`SESSION_IDLE_HOURS`).
  Ein Passwortwechsel entwertet alle Sitzungen und stellt für das eigene Gerät eine neue
  aus.
- **Cookies**: `HttpOnly`, `SameSite=Strict`, `Secure` sobald die App über HTTPS läuft, und
  dann zusätzlich mit dem Präfix `__Host-`. Der Präfix lässt den Browser selbst erzwingen,
  dass kein `Domain` gesetzt ist — eine andere Subdomain kann den Cookie damit nicht
  überschreiben und keine Sitzung unterschieben.
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

Zwei Ebenen. `npm run test:all` führt beide aus.

**`npm test` — Unit-Tests** (Vitest, 56 Stück, unter einer Sekunde, ohne DOM und ohne
Datenbank):

| Bereich | Was geprüft wird |
| --- | --- |
| `utils` | Slug-Erzeugung inklusive Umlauten und Längenbegrenzung, Tag-Aufbereitung, Kürzen, Zahlenformat |
| `git/parse` | URL-Zerlegung für https, SSH, verschachtelte GitLab-Gruppen und Oberflächenpfade; Provider-Erkennung; Bildung der Aktivitätskurve |
| `security/ssrf` | Sperrlisten für Loopback, Link-Local, Metadaten-Endpunkt, CGNAT und Multicast; Formprüfung; die drei Umgebungsschalter |
| `auth/password` | scrypt-Rundlauf, unterschiedliches Salz, Ablageformat, Verhalten bei kaputten Hashes, Passwortregeln |
| `tasks` | Berechnung des abgeleiteten Fortschritts, Spaltenreihenfolge |
| `notify/pending` | Wann eine Benachrichtigung fällig ist: neuer Fehler ja, gleicher Fehler nein; CI-Wechsel nach rot; Release erst ab dem zweiten Abgleich |
| `notify/stale` | Stillstandsschwelle, keine Zweitmeldung, aber erneute Meldung nach zwischenzeitlicher Aktivität |
| `validation` | Dass jeder Anlass, den die Oberfläche anbietet, auch vom Schema akzeptiert wird — entstanden aus genau diesem Fehler |

**`npm run test:e2e` — Ende-zu-Ende** (Playwright, 13 Stück, rund 20 Sekunden). Läuft
gegen die gebaute Anwendung mit eigener Datenbank auf Port 3111 — also durch Middleware,
Authentifizierung, Validierung und Datenbank hindurch:

| Datei | Was geprüft wird |
| --- | --- |
| `e2e/api.spec.ts` | Einrichtung sperrt sich nach dem ersten Konto · kein Zugriff ohne Anmeldung · fremdes Origin und falscher Content-Type abgewiesen · SSRF geblockt · **Datentrennung zwischen zwei Konten** · Aufgaben-Reihenfolge, abgeleiteter Fortschritt und untergeschobene IDs · Export ohne Geheimnisse, Import je Strategie |
| `e2e/ui.spec.ts` | Anmelden · Projekt anlegen · Aufgaben anlegen und **per Ziehen verschieben** (inklusive Prüfung nach dem Neuladen) · Volltextsuche · Abmelden sperrt geschützte Seiten wieder |

Zwei Dinge sind bewusst so gebaut:

- **Die Testdatenbank kann nicht die echte sein.** `e2e/global-setup.ts` bricht ab, wenn
  der Datenbankname nicht `test` enthält — vor dem `TRUNCATE`. Der teuerste denkbare
  Fehler wäre eine Testreihe, die die Produktivdaten leert.
- **Playwright startet den Server selbst** (`webServer` in `playwright.config.ts`) mit
  eigener `DATABASE_URL` und eigenem Port. Eine laufende Instanz auf 3000 stört nicht.

Einmalig vorbereiten:

```bash
docker exec nebula-db psql -U nebula -d postgres -c "CREATE DATABASE nebula_e2e_test"
```

### 6.5 Fortlaufende Prüfung

`.gitea/workflows/ci.yml` prüft jeden Push und jeden Pull Request: Typen, Unit-Tests,
Bau und Ende-zu-Ende-Tests gegen einen frischen PostgreSQL-Dienst. Schlägt etwas fehl,
wird der Playwright-Bericht als Artefakt abgelegt.

Dafür müssen in der Gitea-Instanz Actions aktiviert sein (`app.ini`: `[actions] ENABLED
= true`) und ein Runner registriert. Die Syntax ist GitHub-kompatibel — für GitHub die
Datei nach `.github/workflows/` kopieren.

### 6.6 API

Zehn REST-Endpunkte für Projekte, Notizen, Verbindungen, Sync, Repo-Listen und Health.
Alles, was die Oberfläche kann, ist damit auch scriptbar. Übersicht in der
[README](README.md#api).

---

## 7. Ideen für später

Was als Nächstes kommen könnte, steht mit Aufwandsschätzung und offenen Fragen in
**[ROADMAP.md](ROADMAP.md)** — gedacht zum Durchsprechen und schrittweisen Abarbeiten.
