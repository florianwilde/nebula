# Roadmap

Sammlung dessen, was als Nächstes kommen könnte — zum Durchsprechen und
Stück für Stück abarbeiten. Reihenfolge ist ein Vorschlag, keine Festlegung.

**Aufwand:** `S` = überschaubar · `M` = halber Tag · `L` = größerer Brocken

Was bereits steht, listet [FEATURES.md](FEATURES.md).

---

## 1 · Als Nächstes empfohlen

### 1.1 Markdown in Beschreibung und Notizen `S`

Heute wird alles als reiner Text dargestellt. Mit Markdown werden aus
`- [ ] Aufgabe` echte Checklisten, Codeblöcke bekommen Hervorhebung, Links
werden klickbar.

Zu beachten: HTML muss beim Rendern entfernt werden, sonst reißt es ein
XSS-Loch. Mit `react-markdown` plus `rehype-sanitize` ist das sauber lösbar.

### 1.2 Volltextsuche über Notizen `S`

Die Suche im Board deckt Namen, Kurzbeschreibung und Tags ab — Notizen nicht.
Postgres kann das nativ (`tsvector` mit deutscher Konfiguration), also ohne
zusätzlichen Dienst.

### 1.3 Kanban-Board mit Drag & Drop `M`

Die gruppierte Ansicht gibt es schon, aber Statuswechsel geht nur über das
Menü. Spalten mit Ziehen und Ablegen wären der natürlichere Weg.

Bibliothek: `@dnd-kit` — leichtgewichtig, tastaturbedienbar. Auf Mobilgeräten
bleibt die Listenansicht.

---

## 2 · Danach

### 2.1 Offene Pull Requests und Issues als Liste `S`

Aktuell werden sie nur gezählt. Titel, Autor, Alter und Link wären deutlich
nützlicher — die Daten holen wir ohnehin schon ab.

### 2.2 CI-Status je Branch `M`

Grün oder rot direkt an der Projektkarte, gespeist aus GitHub Actions,
GitLab Pipelines und Gitea Actions. Erfordert je Provider einen weiteren
Endpunkt und einen zusätzlichen Token-Scope.

### 2.3 Webhooks statt Polling `M`

Ein Push aktualisiert den Snapshot sofort, statt bis zum nächsten Durchlauf
zu warten. Braucht einen öffentlich erreichbaren Endpunkt mit
Signaturprüfung je Provider — sinnvoll erst, wenn die Instanz von außen
erreichbar ist. Der Zeitplan bleibt als Rückfalllösung.

### 2.4 Commit-Aktivität als Verlauf `S`

Kleine Sparkline auf der Karte, Heatmap auf der Projektseite. Datenbasis ist
da, es fehlt nur die Darstellung.

### 2.5 Aufgaben und Checklisten `M`

Eigene Entität statt Freitext-Notiz, mit Häkchen und automatisch
berechnetem Fortschritt. Ersetzt das manuelle Schieben des Reglers.

### 2.6 Benachrichtigungen `M`

Bei Sync-Fehlern, neuen Releases oder Projekten, die lange stillstehen.
Kanäle: E-Mail (SMTP), ntfy, generischer Webhook. Zusammen mit dem
automatischen Abgleich ergibt das ein brauchbares Frühwarnsystem.

---

## 3 · Größere Brocken

### 3.1 Automatisierte Tests und CI `L`

Aktuell prüfe ich jede Änderung von Hand — Typecheck, Build, API-Durchläufe,
Browser-Screenshots. Das gehört in eine Pipeline:

- **Vitest** für die Logik: URL-Parsing, SSRF-Regeln, Passwort-Hashing,
  Backoff-Berechnung
- **Playwright** für die Wege durch die App: Einrichtung, Anmeldung,
  Datentrennung
- **GitHub Actions** oder Gitea Actions, je nachdem wohin du das Repo legst

Aus meiner Sicht der wertvollste Punkt der ganzen Liste, sobald das Projekt
länger lebt: er macht alles Weitere billiger und sicherer.

### 3.2 Mehrere Repositories je Projekt `M`

Frontend und Backend getrennt, aber ein Projekt. Erfordert eine Zwischen­tabelle
und Anpassungen in der Anzeige.

### 3.3 Zwei-Faktor per TOTP `M`

Als Alternative zum Passkey — nützlich, wenn die Instanz aus dem Internet
erreichbar ist und nicht jedes Gerät Passkeys kann.

### 3.4 Passwort-Zurücksetzen per E-Mail `M`

Heute setzt ein Administrator das Passwort neu. Selbstbedienung braucht SMTP
und damit eine weitere Konfiguration — lohnt erst im Mehrbenutzerbetrieb.

### 3.5 Mehrsprachigkeit `L`

Die Oberfläche ist durchgängig deutsch verdrahtet. Englisch dazu wäre eine
Voraussetzung, falls du das Projekt veröffentlichen willst.

---

## 4 · Kleinigkeiten

| Idee | Aufwand | Nutzen |
| --- | --- | --- |
| Schnellsuche per `Strg+K` | `S` | Springt direkt zu Projekt oder Aktion |
| Mehrfachauswahl im Board | `S` | Status oder Tags für mehrere auf einmal |
| Aktivitätsverlauf je Projekt | `S` | Wer hat wann was geändert |
| Projektvorlagen | `S` | Neues Projekt mit vorgefüllten Tags und Notizen |
| Hell/Dunkel umschaltbar | `M` | Aktuell nur dunkel |
| Eigenes Logo und Farbe | `S` | Ergänzt `APP_NAME` |
| PWA-Manifest | `S` | Auf dem Handy als App installierbar |
| Barrierefreiheits-Durchsicht | `M` | Fokusreihenfolge, Screenreader, Kontraste |
| `prisma.config.ts` | `S` | Beseitigt die Deprecation-Warnung vor Prisma 7 |
| Audit-Log für Adminaktionen | `M` | Nachvollziehbar, wer Konten geändert hat |

---

## 5 · Bewusst nicht

Damit klar ist, was **nicht** kommt und warum:

- **Geteilte Projekte zwischen Konten.** Die Trennung ist derzeit hart und
  einfach zu prüfen. Freigaben bringen eine Rechteverwaltung mit sich — nur
  sinnvoll, wenn wirklich mehrere Leute zusammenarbeiten.
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

Zur Entscheidung beim Export: Git-Tokens gehen **nicht** mit. Die Verbindung wird nur
beschrieben, das Token ist nach dem Import neu zu hinterlegen. Snapshots bleiben
ebenfalls draußen — sie sind reproduzierbar. Der Projekt-Export steht jedem Konto für
seine eigenen Daten offen, die Voll-Sicherung nur Administratoren.
