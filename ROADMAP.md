# Roadmap

Sammlung dessen, was als Nächstes kommen könnte — zum Durchsprechen und
Stück für Stück abarbeiten. Reihenfolge ist ein Vorschlag, keine Festlegung.

**Aufwand:** `S` = überschaubar · `M` = halber Tag · `L` = größerer Brocken

Was bereits steht, listet [FEATURES.md](FEATURES.md).

**Stand:** v1.10.1. Alle Issues aus dem Dashboard sind abgearbeitet.

---

## 1 · Als Nächstes empfohlen

### 1.1 Persönliche API-Token `M`

Der letzte offene Teil aus v1.6.0 („unterwegs erfassen"). Derzeit geht die
API nur mit Sitzungscookie. Ein Token je Konto würde `curl`-Aufrufe und
Handy-Shortcuts erlauben — eine Idee aus dem Terminal anlegen, ohne den
Browser zu öffnen. Nur der Hash in der Datenbank, wie bei den Sitzungen.

Bewusst noch nicht angefasst, weil sicherheitsrelevant: Geltungsbereich,
Widerruf und Ablauf wollen entschieden sein, nicht nebenbei gebaut.

### 1.2 Läuft es noch? `M`

Eine Health-Check-URL je Projekt, die der Zeitgeber regelmäßig anpingt.
Nebula wüsste dann, ob ein Projekt nicht nur existiert, sondern auch läuft.
Nutzt Zeitgeber und Benachrichtigungen, die es schon gibt. Der SSRF-Schutz
greift dabei wie bei den Git-Aufrufen.

### 1.3 Aufgaben ↔ Issues: der Rest `S`

Beide Richtungen stehen — „als Issue anlegen" seit v1.7.0, der Rückweg über
Webhook (v1.7.0) und zusätzlich über den Abgleich (v1.9.0). Offen ist
Kleinkram:

- **Mehrere Repositories.** Der Knopf nimmt immer das führende. Bei einem
  Projekt aus Frontend und Backend fehlt die Wahl.
- **Webhook beim Verknüpfen anbieten.** Er ist getrennt einzurichten, und
  wer das nicht tut, merkt nur an der Verzögerung, dass etwas fehlt. Ein
  Hinweis an der richtigen Stelle würde reichen.

Was **nicht** kommt, bleibt wie besprochen: eine echte beidseitige
Synchronisation mit Konfliktauflösung. Die Zustände passen ohnehin nicht
aufeinander — ein Issue kennt nur offen und geschlossen, `DOING` und
`BLOCKED` gehen im Rundlauf verloren. Das ist hingenommen, statt den
Issue-Tracker mit Labels zu füllen, die dort niemand pflegt.

---

## 2 · Größere Brocken

### 2.1 Passwort-Zurücksetzen per E-Mail `M`

Heute setzt ein Administrator das Passwort neu. Selbstbedienung braucht SMTP
und damit eine weitere Konfiguration — lohnt erst im Mehrbenutzerbetrieb.

### 2.2 Mehrsprachigkeit `L`

Die Oberfläche ist durchgängig deutsch verdrahtet. Englisch dazu wäre eine
Voraussetzung, falls du das Projekt veröffentlichen willst.

---

## 3 · Aufgefallen beim Bauen

Beobachtungen aus der Arbeit an v1.6.0 bis v1.10.1 — festgehalten, damit sie
nicht verloren gehen. Nichts davon ist dringend.

### 3.1 Anwendungsname bricht in der Kopfleiste ab `S`

Zwischen 320 und 375 px wird aus „Nebula" ein „Neb…". Gemessen über fünf
Breiten und zwei Seiten: betrifft alle Seiten gleichermaßen. Seit die
Aufgaben als dritter Punkt danebenstehen, ist es enger geworden.

### 3.2 Indizes für die projektübergreifenden Seiten `S`

Weder `Task` noch `Activity` haben einen Besitzer — die Trennung läuft über
`project: { ownerId }`. Die vorhandenen Indizes
(`[projectId, status, position]` bzw. `[projectId, createdAt]`) greifen für
Abfragen über alle Projekte deshalb nicht.

Betroffen sind inzwischen vier Seiten: Aufgabenübersicht, Wochenrückblick,
Zeitleiste und die Volltextsuche. Bei einigen hundert Datensätzen fällt das
nicht auf. Wird eine der Seiten träge, sind Indizes auf `Task.dueDate` und
`Activity.createdAt` der erste Griff — und dann eine Migration wert.

### 3.3 Projektfilter auf der Zeitleiste `S`

Über alle Projekte wird die Liste schnell lang. Der Wochenrückblick hat
Wochengrenzen als natürliche Bremse, die Zeitleiste nicht. Bewusst
weggelassen, weil das Issue nur „derselbe Verlauf, projektübergreifend"
verlangte.

### 3.4 Abgleich gegen geleakte Passwörter `M`

ASVS 2.1.7 verlangt es; umgesetzt ist bisher nur eine lokale Sperrliste plus
Mustererkennung (Wiederholungen, Zeichenfolgen, Benutzername im Passwort).
Have-I-Been-Pwned scheidet aus — Nebula ruft grundsätzlich nichts von außen,
und ein Passwort-Präfix nach draußen zu geben widerspräche dem erst recht.
Eine lokale Top-10000-Liste als Datei wäre der Kompromiss.

### 3.5 v0.2.0 und v0.3.0 ohne Release `S`

Beide stehen im Änderungsverlauf, existierten aber nie in der
`package.json` — dort springt die Historie von 0.1.0 auf 0.4.0. Nachgetragen
wurden sie in dem Commit, der den Verlauf einführte, und der liegt *nach*
0.4.0. Es gibt also keinen ehrlichen Commit, an dem ein Tag hängen könnte.
Die übrigen 19 Fassungen haben seit dem 18.08.2026 ein Release in Gitea.

---

## 4 · Kleinigkeiten

| Idee | Aufwand | Nutzen |
| --- | --- | --- |
| Suchtreffer in Notizen hervorheben | `S` | In der Notiz selbst, nicht nur in der Trefferliste |
| Aufgabe ↔ Commit verknüpfen | `M` | Enthält ein Commit `#5`, wird die übernommene Aufgabe verlinkt — fällt weitgehend mit 1.3 ab |
| Tastaturkürzel-Übersicht mit `?` | `S` | Es gibt inzwischen genug davon |
| Hell/Dunkel umschaltbar | `M` | Aktuell nur dunkel |
| Eigenes Logo und Farbe | `S` | Ergänzt `APP_NAME` |
| Audit-Log für Adminaktionen | `M` | Nachvollziehbar, wer Konten geändert hat |

---

## 5 · Bewusst nicht

Damit klar ist, was **nicht** kommt und warum:

- **Geteilte Projekte zwischen Konten.** Die Trennung ist derzeit hart und
  einfach zu prüfen. Freigaben bringen eine Rechteverwaltung mit sich — nur
  sinnvoll, wenn wirklich mehrere Leute zusammenarbeiten.
- **Veraltete Abhängigkeiten prüfen.** Klingt verlockend, aber Renovate und
  Dependabot machen das besser, und es wären viele Aufrufe an fremde
  Registries — für eine Zahl, die im Repo selbst schon steht.
- **Anhänge an Notizen.** Bräuchte Dateispeicher und damit eine zweite Sorge
  bei jeder Sicherung. Ein Link ins Git tut es auch.
- **Eigene Git-Operationen** (klonen, committen, pushen). Nebula ist eine
  Übersicht, keine Entwicklungsumgebung. Issues über die HTTP-API der
  Provider sind davon nicht berührt — die gibt es seit v1.7.0.
- **Beidseitige Synchronisation von Aufgaben und Issues** mit
  Konfliktauflösung — siehe 1.3.
- **Zeiterfassung, Rechnungen, Kundenverwaltung.** Andere Baustelle.
- **Cloud-Synchronisation.** Die Daten bleiben in deiner Datenbank; das ist
  der Punkt.

---

## Erledigt

| | |
| --- | --- |
| Dashboard mit Status, Notizen, Git-Anbindung | ✓ |
| GitHub, GitLab und Gitea | ✓ |
| Benutzerverwaltung, Passwort und Passkeys | ✓ |
| Einzel- und Mehrbenutzerbetrieb | ✓ |
| Härtung: CSRF, CSP, SSRF, Ratenbegrenzung, Datentrennung | ✓ |
| Docker- und Standalone-Betrieb | ✓ |
| Automatischer Abgleich mit Zeitplan | ✓ |
| Export, Import und Sicherung | ✓ |
| **v0.3.0** Markdown, Volltextsuche über Notizen, PR- und Issue-Listen, Testfundament | ✓ |
| **v0.4.0** Kanban mit Drag & Drop, CI-Status je Branch, Commit-Aktivität | ✓ |
| **v0.5.0** Aufgabenbrett je Projekt mit sortierbaren Spalten, Fortschritt aus Aufgaben | ✓ |
| **v0.6.0** Ende-zu-Ende-Tests mit Playwright, CI-Pipeline für Gitea Actions | ✓ |
| **v0.7.0** Benachrichtigungen über ntfy, Webhook und E-Mail | ✓ |
| **v0.8.0** Stillstehende Projekte melden, Schwelle im Adminbereich | ✓ |
| **v0.9.0** Schnellsuche per `Strg+K`, Aufgaben aus Git-Issues | ✓ |
| **v1.0.0** Aktivitätsverlauf je Projekt, Zwei-Faktor per TOTP, mehrere Repositories je Projekt | ✓ |
| **v1.1.0** Freie Reihenfolge im Brett, Mehrfachauswahl, installierbar als App, Änderungsverlauf | ✓ |
| **v1.2.0** Commit-Heatmap über ein Jahr, Projektvorlagen | ✓ |
| **v1.3.0** Wiederkehrende Aufgaben, Barrierefreiheit nach WCAG 2.1 AA | ✓ |
| **v1.4.0** README-Vorschau auf der Projektseite | ✓ |
| **v1.5.0** Sicherheitsdurchsicht, Server-Anleitung und Update-Skript | ✓ |
| **v1.6.0** Mobile Ansicht, Listenansicht, Schnellerfassung, Aufgaben über alle Projekte | ✓ |
| **v1.7.0** Aufgabe als Git-Issue anlegen, Webhooks für Push und Issues | ✓ |
| **v1.8.0** Anmeldung und Sitzungen nach OWASP: scrypt-Aufwand, Aufzählbarkeit, Leerlauffrist, Cookie-Härtung | ✓ |
| **v1.9.0** Geschlossene Issues haken ihre Aufgabe auch ohne Webhook ab | ✓ |
| **v1.10.0** Wochenrückblick, globale Zeitleiste, Suche über Aufgaben | ✓ |
| **v1.10.1** Issue-Kennzeichen auf der Aufgabenkarte, Token-Rechte Aufruf für Aufruf belegt | ✓ |

Zur Entscheidung beim Export: Git-Tokens gehen **nicht** mit. Die Verbindung wird nur
beschrieben, das Token ist nach dem Import neu zu hinterlegen. Snapshots bleiben
ebenfalls draußen — sie sind reproduzierbar. Der Projekt-Export steht jedem Konto für
seine eigenen Daten offen, die Voll-Sicherung nur Administratoren.
