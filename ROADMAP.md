# Roadmap

Sammlung dessen, was als Nächstes kommen könnte — zum Durchsprechen und
Stück für Stück abarbeiten. Reihenfolge ist ein Vorschlag, keine Festlegung.

**Aufwand:** `S` = überschaubar · `M` = halber Tag · `L` = größerer Brocken

Was bereits steht, listet [FEATURES.md](FEATURES.md).

---

## 1 · Als Nächstes empfohlen

### 1.0 Rest aus v1.6.0: persönliche API-Token `M`

Schnellerfassung und die projektübergreifende Aufgabenseite sind mit v1.6.0
ausgeliefert. Offen bleibt der dritte Teil — siehe 1.3. Er gehört sachlich
dazu: erfassen am Telefon, überblicken an einer Stelle, ansprechen per
Shortcut.

Bewusst nicht mitgeliefert wurde ein **Index für die übergreifende
Aufgabenabfrage**. `Task` hat kein `ownerId`, die Trennung läuft über
`project: { ownerId }`, und `[projectId, status, position]` greift dafür
nicht. Bei einigen hundert Aufgaben fällt das nicht auf; wird die Seite
träge, ist ein Index auf `dueDate` der erste Griff — und dann eine
Migration wert.

---

### 1.1 Webhooks statt Polling `M`

Ein Push aktualisiert den Snapshot sofort, statt bis zum nächsten Durchlauf
zu warten. Braucht einen öffentlich erreichbaren Endpunkt mit
Signaturprüfung je Provider — sinnvoll erst, wenn die Instanz von außen
erreichbar ist. Der Zeitplan bleibt als Rückfalllösung.

---

### 1.2 Läuft es noch? `M`

Eine Health-Check-URL je Projekt, die der Zeitgeber regelmäßig anpingt.
Nebula wüsste dann, ob ein Projekt nicht nur existiert, sondern auch läuft.
Nutzt Zeitgeber und Benachrichtigungen, die es schon gibt. Der SSRF-Schutz
greift dabei wie bei den Git-Aufrufen.

### 1.3 Persönliche API-Token `M`

Derzeit geht die API nur mit Sitzungscookie. Ein Token je Konto würde
`curl`-Aufrufe und Handy-Shortcuts erlauben — Idee aus dem Terminal anlegen,
ohne den Browser zu öffnen. Nur der Hash in der Datenbank, wie bei den
Sitzungen.

---

### 1.4 v1.7.0 „Aufgaben und Issues" `M` + `M`

Nachverfolgbarkeit zwischen Nebula-Aufgabe und Git. Die Zuordnung steht im
Schema bereits: `sourceIssue`, `sourceUrl`, `sourceRepositoryId` samt
`@@unique`. Die Richtung **Git → Nebula** gibt es seit v0.9.0
(`tasks/from-issues`); es fehlt die Gegenrichtung.

**Kein Widerspruch zu „Bewusst nicht".** Ausgeschlossen sind dort *eigene
Git-Operationen* — klonen, committen, pushen. Issues laufen über die
HTTP-API der Provider, dieselbe Schicht wie alles andere (`lib/git/http.ts`,
SSRF-Schutz inklusive). Kein Klon, kein Arbeitsverzeichnis.

Warum Issues und nicht eine Datei im Repo: **dort verlinkt Git ohnehin.**
Ein `fixes #12` in der Commit-Nachricht stellt die Verbindung von selbst
her — die Kette Aufgabe → Commit → PR gibt es geschenkt, statt sie zu bauen.
Damit erledigt sich auch „Aufgabe ↔ Commit verknüpfen" aus Abschnitt 3.

**Stufe 1 — eine Richtung, ausdrücklich** `M`
Ein Knopf „als Issue anlegen" an der Aufgabe. Nummer und URL wandern in die
vorhandenen Felder. Kein Automatismus: was nach außen geht, wird
angestoßen, nicht nebenbei mitgeschrieben.

**Stufe 2 — Rückweg über Webhooks** `M`
Setzt 1.1 voraus. Geschlossenes Issue → Aufgabe nach `DONE`. Erst damit ist
„synchron" ehrlich, ohne im Minutentakt fremde APIs zu fragen.

**Die Zustände passen nicht aufeinander, und das bleibt so.** Nebula kennt
`TODO/DOING/BLOCKED/DONE`, ein Issue nur offen/geschlossen. Ein Rundlauf
verliert also `DOING` und `BLOCKED` — bewusst hingenommen: die feine
Abstufung bleibt in Nebula, nach Git geht nur offen/zu. Labels wie
`nebula:doing` wären die Alternative, würden aber den Issue-Tracker mit
Zuständen zumüllen, die dort niemand pflegt.

**Echte beidseitige Synchronisation mit Konfliktauflösung ist nicht
vorgesehen.** Das ist der klassische Ort für stillen Datenverlust, und für
ein persönliches Dashboard steht der Aufwand in keinem Verhältnis.

Für Projekte ohne Issue-Tracker wäre eine `.nebula/tasks.md` über die
Contents-API denkbar — aber nur als **einseitiger Spiegel**, nicht als
Synchronisation: zwei Schreiber auf einer Datei, und jede Statusänderung
ein Commit.

---

## 2 · Größere Brocken

### 2.1 Passwort-Zurücksetzen per E-Mail `M`

Heute setzt ein Administrator das Passwort neu. Selbstbedienung braucht SMTP
und damit eine weitere Konfiguration — lohnt erst im Mehrbenutzerbetrieb.

### 2.2 Mehrsprachigkeit `L`

Die Oberfläche ist durchgängig deutsch verdrahtet. Englisch dazu wäre eine
Voraussetzung, falls du das Projekt veröffentlichen willst.

---

## 3 · Kleinigkeiten

| Idee | Aufwand | Nutzen |
| --- | --- | --- |
| Wochenrückblick | `S` | „Was ist diese Woche passiert" über alle Projekte, aus dem Aktivitätsverlauf |
| Globale Zeitleiste | `S` | Derselbe Verlauf, aber projektübergreifend als eigene Seite |
| Suche über Aufgaben | `S` | Die Volltextsuche deckt bisher nur Notizen ab |
| Suchtreffer in Notizen hervorheben | `S` | In der Notiz selbst, nicht nur in der Trefferliste |
| Aufgabe ↔ Commit verknüpfen | `M` | Enthält ein Commit `#5`, wird die übernommene Aufgabe verlinkt — fällt weitgehend mit 1.4 ab |
| Tastaturkürzel-Übersicht mit `?` | `S` | Es gibt inzwischen genug davon |
| Hell/Dunkel umschaltbar | `M` | Aktuell nur dunkel |
| Eigenes Logo und Farbe | `S` | Ergänzt `APP_NAME` |
| Audit-Log für Adminaktionen | `M` | Nachvollziehbar, wer Konten geändert hat |

---

## 4 · Bewusst nicht

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
  Übersicht, keine Entwicklungsumgebung.
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

Zur Entscheidung beim Export: Git-Tokens gehen **nicht** mit. Die Verbindung wird nur
beschrieben, das Token ist nach dem Import neu zu hinterlegen. Snapshots bleiben
ebenfalls draußen — sie sind reproduzierbar. Der Projekt-Export steht jedem Konto für
seine eigenen Daten offen, die Voll-Sicherung nur Administratoren.
