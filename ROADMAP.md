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

## 2 · Danach

### 2.1 Commit-Aktivität als Heatmap `S`

Die Sparkline gibt es auf Karte und Projektseite. Eine Heatmap über ein Jahr
wäre die nächste Ausbaustufe — dafür braucht es allerdings mehr als eine
Seite Commits, also Paginierung oder die Statistik-Endpunkte.

### 2.2 Kanban mit freier Reihenfolge `M`

Heute folgt die Reihenfolge innerhalb einer Spalte der gewählten Sortierung.
Frei sortieren hieße, eine Position je Projekt zu speichern.

---

## 3 · Größere Brocken

### 3.1 Mehrere Repositories je Projekt `M`

Frontend und Backend getrennt, aber ein Projekt. Erfordert eine Zwischen­tabelle
und Anpassungen in der Anzeige.

### 3.2 Zwei-Faktor per TOTP `M`

Als Alternative zum Passkey — nützlich, wenn die Instanz aus dem Internet
erreichbar ist und nicht jedes Gerät Passkeys kann.

### 3.3 Passwort-Zurücksetzen per E-Mail `M`

Heute setzt ein Administrator das Passwort neu. Selbstbedienung braucht SMTP
und damit eine weitere Konfiguration — lohnt erst im Mehrbenutzerbetrieb.

### 3.4 Mehrsprachigkeit `L`

Die Oberfläche ist durchgängig deutsch verdrahtet. Englisch dazu wäre eine
Voraussetzung, falls du das Projekt veröffentlichen willst.

---

## 4 · Kleinigkeiten

| Idee | Aufwand | Nutzen |
| --- | --- | --- |
| Schnellsuche per `Strg+K` | `S` | Springt direkt zu Projekt oder Aktion |
| Suchtreffer in Notizen hervorheben | `S` | In der Notiz selbst, nicht nur in der Trefferliste |
| Mehrfachauswahl im Board | `S` | Status oder Tags für mehrere auf einmal |
| Aktivitätsverlauf je Projekt | `S` | Wer hat wann was geändert |
| Wiederkehrende Aufgaben | `M` | Etwa „jeden Montag Abhängigkeiten prüfen" |
| Aufgaben aus Git-Issues übernehmen | `M` | Offene Issues als Aufgaben einhängen |
| Projektvorlagen | `S` | Neues Projekt mit vorgefüllten Tags und Notizen |
| Hell/Dunkel umschaltbar | `M` | Aktuell nur dunkel |
| Eigenes Logo und Farbe | `S` | Ergänzt `APP_NAME` |
| PWA-Manifest | `S` | Auf dem Handy als App installierbar |
| Barrierefreiheits-Durchsicht | `M` | Fokusreihenfolge, Screenreader, Kontraste |
| `prisma.config.ts` | `S` | Beseitigt die Deprecation-Warnung vor Prisma 7. Achtung: danach lädt Prisma die `.env` nicht mehr von selbst |
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
| **v0.3.0** Markdown, Volltextsuche über Notizen, PR- und Issue-Listen, Testfundament | ✓ |
| **v0.4.0** Kanban mit Drag & Drop, CI-Status je Branch, Commit-Aktivität | ✓ |
| **v0.5.0** Aufgabenbrett je Projekt mit sortierbaren Spalten, Fortschritt aus Aufgaben | ✓ |
| **v0.6.0** Ende-zu-Ende-Tests mit Playwright, CI-Pipeline für Gitea Actions | ✓ |
| **v0.7.0** Benachrichtigungen über ntfy, Webhook und E-Mail | ✓ |
| **v0.8.0** Stillstehende Projekte melden, Schwelle im Adminbereich | ✓ |

Zur Entscheidung beim Export: Git-Tokens gehen **nicht** mit. Die Verbindung wird nur
beschrieben, das Token ist nach dem Import neu zu hinterlegen. Snapshots bleiben
ebenfalls draußen — sie sind reproduzierbar. Der Projekt-Export steht jedem Konto für
seine eigenen Daten offen, die Voll-Sicherung nur Administratoren.
