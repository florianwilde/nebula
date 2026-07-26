# Roadmap

Sammlung dessen, was als Nächstes kommen könnte — zum Durchsprechen und
Stück für Stück abarbeiten. Reihenfolge ist ein Vorschlag, keine Festlegung.

**Aufwand:** `S` = überschaubar · `M` = halber Tag · `L` = größerer Brocken

Was bereits steht, listet [FEATURES.md](FEATURES.md).

---

## 1 · Als Nächstes empfohlen

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
| Aufgabe ↔ Commit verknüpfen | `M` | Enthält ein Commit `#5`, wird die übernommene Aufgabe verlinkt |
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

Zur Entscheidung beim Export: Git-Tokens gehen **nicht** mit. Die Verbindung wird nur
beschrieben, das Token ist nach dem Import neu zu hinterlegen. Snapshots bleiben
ebenfalls draußen — sie sind reproduzierbar. Der Projekt-Export steht jedem Konto für
seine eigenen Daten offen, die Voll-Sicherung nur Administratoren.
