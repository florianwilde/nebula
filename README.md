<div align="center">

# ✦ Nebula

**Das Kontrollzentrum für deine Vibe-Coding Projekte.**

Ideen festhalten · Status pflegen · Notizen sammeln · Git-Repos live im Blick

<sub>Next.js 15 · TypeScript · Tailwind CSS 4 · Prisma · PostgreSQL · Docker</sub>

</div>

---

## Was ist Nebula?

Vibe Coding produziert schnell viele halbfertige Projekte: ein Repo hier, eine Idee dort,
irgendwo eine Notiz in einer Textdatei. Nebula bündelt das an einem Ort.

Jedes Projekt bekommt einen **Status** (von der rohen Idee bis „Fertig"), beliebig viele
**Notizen** und optional ein **verknüpftes Repository**. Nebula holt sich von dort per API
Branches, Tags, Commits, Releases und offene Issues/PRs — egal ob **GitHub**, **GitLab**
oder eine selbst gehostete **Gitea**-Instanz.

Neben dem Projektbrett gibt es **Aufgaben über alle Projekte hinweg** (nach Fälligkeit
geordnet), einen **Wochenrückblick** und eine **fortlaufende Zeitleiste** aus dem
Aktivitätsverlauf. Aufgaben lassen sich als **Git-Issue** anlegen; wird das Issue
geschlossen, hakt Nebula die Aufgabe ab — sofort per **Webhook** oder verzögert beim
nächsten Abgleich.

Die Anmeldung läuft über **Benutzername und Passwort oder Passkey** (WebAuthn). Nebula
kennt zwei Betriebsarten: **Einzelbetrieb** für ein Konto oder **Mehrbenutzerbetrieb**, in
dem jede Person ihren eigenen, streng getrennten Bereich hat. Umschalten geht jederzeit in
den Admin-Einstellungen.

Alle Daten liegen in **deiner lokalen PostgreSQL**. Es gibt keinen Cloud-Dienst dahinter,
Access Tokens werden verschlüsselt abgelegt.

Eine vollständige Auflistung aller Funktionen steht in **[FEATURES.md](FEATURES.md)**,
geplante Erweiterungen in **[ROADMAP.md](ROADMAP.md)**. Für den Dauerbetrieb auf einem
Server — TLS, Firewall, Sicherungen und Updates — gibt es **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Schnellstart

Zwei Betriebsarten, dieselbe Codebasis. Beide brauchen zuerst eine `.env`:

```bash
node scripts/setup.mjs      # legt .env an und erzeugt ein zufälliges APP_SECRET
```

> Ohne Node zur Hand? Einfach `.env.example` nach `.env` kopieren und `APP_SECRET` von Hand
> auf einen langen Zufallswert setzen.

### Variante A — Standalone (empfohlen zum Entwickeln)

Die App läuft nativ auf dem Rechner, nur PostgreSQL kommt aus dem Container:

```bash
npm run docker:db            # Postgres 17 auf 127.0.0.1:5432
npm install
npm run db:migrate           # Schema anlegen
npm run db:seed              # optional: drei Beispielprojekte
npm run dev                  # → http://localhost:3000
```

Für den Produktivbetrieb ohne Docker:

```bash
npm run build
npm start                    # → http://localhost:3000
```

### Variante B — Alles in Docker

```bash
docker compose --profile full up -d --build     # → http://localhost:3000
```

Der App-Container spielt beim Start automatisch die Migrationen ein und wartet dabei auf
die Datenbank. Logs mitlesen:

```bash
docker compose --profile full logs -f app
```

Stoppen:

```bash
docker compose --profile full down              # Container weg, Daten bleiben
docker compose --profile full down -v           # inkl. Datenbank-Volume
```

### Variante C — Eigene, bereits laufende PostgreSQL

Docker wird gar nicht gebraucht. In der `.env` nur den Connection-String setzen:

```env
DATABASE_URL="postgresql://benutzer:passwort@dbhost:5432/nebula?schema=public"
```

Dann `npm install && npm run db:migrate && npm run dev`.

---

## Voraussetzungen

| Variante | Benötigt |
| --- | --- |
| Standalone | Node.js ≥ 20.11, npm, PostgreSQL ≥ 14 (lokal oder via Docker) |
| Docker | Docker Engine ≥ 24 mit Compose v2 |

---

## Konfiguration

Alle Variablen sind in [`.env.example`](.env.example) dokumentiert.

| Variable | Bedeutung | Default |
| --- | --- | --- |
| `APP_NAME` | Anzeigename: Seitentitel, Kopfzeile, Passkey-Dialog | `Nebula` |
| `APP_TAGLINE` | Kleine Zeile unter dem Namen | `Vibe Coding` |
| `APP_URL` | Öffentliche Adresse — bestimmt die WebAuthn-RP-ID | `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL-Verbindung (Prisma) | `postgresql://nebula:nebula@localhost:5432/nebula` |
| `APP_SECRET` | Schlüssel für die Token-Verschlüsselung (AES-256-GCM) | — **unbedingt setzen** |
| `SESSION_TTL_DAYS` | Absolute Lebensdauer einer Anmeldung in Tagen | `30` |
| `SESSION_IDLE_HOURS` | Nach so vielen Stunden ohne Nutzung läuft die Sitzung ab (`0` = aus) | `8` |
| `PORT` | Port der Anwendung | `3000` |
| `APP_PORT` | Host-Port-Mapping des App-Containers | `127.0.0.1:3000` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Zugangsdaten des DB-Containers | `nebula` |
| `POSTGRES_PORT` | Host-Port der Datenbank — wirkt nur mit `docker-compose.dev.yml`, sonst hat die DB keinen | `127.0.0.1:5432` |
| `ADMINER_PORT` | Host-Port von Adminer (`--profile tools`) | `127.0.0.1:8080` |
| `GIT_API_TIMEOUT_MS` | Timeout für Git-API-Aufrufe | `15000` |
| `GIT_ALLOW_LOOPBACK` | Git-Instanz auf demselben Rechner erlauben | `false` |
| `GIT_BLOCK_PRIVATE` | Zugriff ins private LAN sperren | `false` |
| `GIT_ALLOWED_HOSTS` | Strengster Modus: nur diese Hosts erlauben | leer |
| `NOTIFY_TIMEOUT_MS` | Timeout beim Zustellen von Benachrichtigungen | `10000` |
| `SMTP_HOST` … `SMTP_FROM` | SMTP-Zugang; ohne `SMTP_HOST` steht der Weg „E-Mail" nicht zur Verfügung | leer |

`APP_NAME`, `APP_TAGLINE` und `APP_URL` werden **zur Laufzeit** gelesen. Dasselbe
Docker-Image lässt sich also ohne Neubau umbenennen oder unter einer anderen Adresse
betreiben — Container neu starten genügt.

> **`APP_SECRET` nachträglich ändern** macht bereits gespeicherte Git-Tokens unlesbar.
> Sie müssen dann in den Verbindungen neu hinterlegt werden — Konten, Passwörter und
> Passkeys bleiben unberührt.

> **`APP_URL` nachträglich ändern** (anderer Hostname) macht bestehende **Passkeys**
> ungültig, weil sie an die RP-ID gebunden sind. Passwörter funktionieren weiter.

---

## Erste Anmeldung

Beim ersten Aufruf landest du auf `/setup`. Dort legst du das Administratorkonto an und
wählst die Betriebsart:

- **Einzelbetrieb** — genau ein Konto, keine Registrierung, keine Benutzerliste.
- **Mehrbenutzerbetrieb** — beliebig viele Konten. Projekte, Notizen und Git-Verbindungen
  sind pro Konto strikt getrennt; auch ein Administrator sieht fremde Projekte nicht.

Nach der Einrichtung ist `/setup` gesperrt. Bereits vorhandene Projekte ohne Besitzer
(etwa aus den Seed-Daten) werden dem neuen Konto zugeordnet.

**Passkey einrichten:** unter *Mein Konto → Passkeys → Passkey hinzufügen*. Danach genügt
auf der Anmeldeseite ein Klick auf „Mit Passkey anmelden" — ohne Benutzernamen, weil
Nebula auffindbare Credentials nutzt.

> Passkeys brauchen einen sicheren Kontext. Sie funktionieren über `https://` und über
> `http://localhost`, **nicht** über eine LAN-IP ohne TLS. `APP_URL` muss dabei exakt der
> Adresse entsprechen, unter der du die App aufrufst.

## Git-Verbindung einrichten

1. Im Git-System einen **Personal Access Token** erzeugen — mit den Rechten aus dem
   Abschnitt [Welche Rechte der Token braucht](#welche-rechte-der-token-braucht).
2. In Nebula unter **Git-Verbindungen → Verbindung hinzufügen** eintragen:
   System wählen, Basis-URL (z. B. `https://git.meine-firma.de`, ohne `/api`) und Token.
3. Mit **Testen** prüfen — Nebula meldet den erkannten Benutzer zurück.
4. Beim Anlegen oder Bearbeiten eines Projekts die Verbindung auswählen und über
   **Repos laden** das Repository aussuchen (oder die URL direkt eintippen).
5. Auf der Projektseite **Jetzt synchronisieren** — Branches, Tags, Commits und Releases
   werden geholt und als Snapshot gespeichert.

Der Snapshot bleibt in der Datenbank, das Dashboard funktioniert also auch offline.
Ohne Token gehen nur öffentliche Repositories, mit strengem Rate-Limit.

### Welche Rechte der Token braucht

Nebula liest fast alles nur. Geschrieben wird an **genau zwei Stellen**: wenn du eine
Aufgabe als Issue anlegst, und wenn eine Aufgabe auf `DONE` wandert und Nebula das
verknüpfte Issue schließt. Alles andere sind `GET`-Aufrufe. Deshalb lohnt es, zwei Fälle
zu unterscheiden:

**Fall A — nur Abgleich.** Branches, Tags, Commits, Releases, CI-Zustand, README,
Heatmap, offene Issues und PRs anzeigen. Rein lesend.

**Fall B — zusätzlich die Issue-Anbindung.** Eine Aufgabe als Issue anlegen; wird das
Issue geschlossen, hakt Nebula die Aufgabe ab und schließt sie umgekehrt mit.

| System | Fall A (nur lesen) | Fall B zusätzlich |
| --- | --- | --- |
| **GitHub** | Fine-grained Token: *Metadata: Read*, *Contents: Read*, *Issues: Read*, *Pull requests: Read*, *Actions: Read* | *Issues: **Read and write*** |
| **GitLab** | `read_api` | `api` — **es gibt nichts dazwischen** |
| **Gitea / Forgejo** | `read:repository`, `read:issue`, `read:user` | `write:issue` |

#### Jeder Aufruf einzeln

Die folgenden Tabellen sind vollständig: mehr als das ruft Nebula nicht nach draußen.
Sie sind aus `src/lib/git/github.ts`, `gitlab.ts` und `gitea.ts` erhoben — wer prüfen
will, ob hier etwas fehlt, greppt dort nach `getJson`, `getJsonSafe` und `sendJson`.

**GitHub** — `https://api.github.com`, Header `Authorization: Bearer …`

| Aufruf | Wofür | Benötigtes Recht |
| --- | --- | --- |
| `GET /rate_limit` | Verbindungstest | keins |
| `GET /user` | Kontoname beim Testen zurückmelden | keins |
| `GET /user/repos` | Auswahlliste hinter **Repos laden** | Metadata: Read |
| `GET /repos/{o}/{r}` | Stammdaten, Default-Branch, Sichtbarkeit | Metadata: Read |
| `GET …/languages` | Sprachverteilung | Metadata: Read |
| `GET …/tags` | Tags | Metadata: Read |
| `GET …/stats/commit_activity` | Commit-Heatmap über ein Jahr | Metadata: Read |
| `GET …/branches` | Branch-Liste | Contents: Read |
| `GET …/commits` | die letzten 100 Commits | Contents: Read |
| `GET …/releases` | Releases | Contents: Read |
| `GET …/readme` | README-Vorschau | Contents: Read |
| `GET …/pulls?state=open` | offene Pull Requests | Pull requests: Read |
| `GET …/issues?state=open` | offene Issues | Issues: Read |
| `GET …/issues/{nr}` | Abgleich: ist das verknüpfte Issue noch offen? | Issues: Read |
| `GET …/actions/runs` | CI-Zustand des Default-Branch | Actions: Read |
| `POST …/issues` | **Aufgabe als Issue anlegen** | Issues: Read and write |
| `PATCH …/issues/{nr}` | **Issue schließen oder wieder öffnen** | Issues: Read and write |

Dass `/tags` und `/stats/commit_activity` unter *Metadata* fallen und nicht unter
*Contents*, ist nicht zu erraten — es steht so in
[GitHubs Berechtigungsübersicht](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens).

**GitLab** — `{Basis-URL}/api/v4`, Header `PRIVATE-TOKEN: …`

| Aufruf | Wofür | Benötigtes Recht |
| --- | --- | --- |
| `GET /projects?per_page=1` | Verbindungstest | `read_api` |
| `GET /user` | Kontoname beim Testen zurückmelden | `read_user` (in `read_api` enthalten) |
| `GET /projects?membership=true` | Auswahlliste hinter **Repos laden** | `read_api` |
| `GET /projects/{id}?statistics=true` | Stammdaten, Default-Branch, Sichtbarkeit | `read_api` |
| `GET …/repository/branches` · `/tags` · `/commits` | Snapshot und Heatmap | `read_api` |
| `GET …/repository/tree` · `/repository/files/{datei}` | README (zwei Aufrufe, GitLab hat keinen README-Endpunkt) | `read_api` |
| `GET …/releases` · `/languages` | Releases, Sprachverteilung | `read_api` |
| `GET …/merge_requests?state=opened` | offene Merge Requests | `read_api` |
| `GET …/issues?state=opened` | offene Issues | `read_api` |
| `GET …/issues/{nr}` | Abgleich: ist das verknüpfte Issue noch offen? | `read_api` |
| `GET …/pipelines` | CI-Zustand des Default-Branch | `read_api` |
| `POST …/issues` | **Aufgabe als Issue anlegen** | `api` |
| `PUT …/issues/{nr}` (`state_event`) | **Issue schließen oder wieder öffnen** | `api` |

**Gitea / Forgejo** — `{Basis-URL}/api/v1`, Header `Authorization: token …`

| Aufruf | Wofür | Benötigtes Recht |
| --- | --- | --- |
| `GET /version` | Verbindungstest | keins — der Aufruf darf fehlschlagen, Nebula wertet ihn nur ergänzend aus |
| `GET /user` | Kontoname beim Testen zurückmelden | `read:user` |
| `GET /user/repos` bzw. `GET /repos/search` | Auswahlliste hinter **Repos laden** | `read:repository` |
| `GET /repos/{o}/{r}` | Stammdaten, Default-Branch, Sichtbarkeit | `read:repository` |
| `GET …/branches` · `/tags` · `/commits` · `/releases` · `/languages` | Snapshot und Heatmap | `read:repository` |
| `GET …/contents` · `/contents/{datei}` | README (zwei Aufrufe, wie bei GitLab) | `read:repository` |
| `GET …/commits/{branch}/status` | CI-Zustand des Default-Branch | `read:repository` |
| `GET …/pulls?state=open` | offene Pull Requests | `read:repository` — Gitea zählt PRs zum Repository-Scope, nicht zu den Issues |
| `GET …/issues?state=open&type=issues` | offene Issues | `read:issue` |
| `GET …/issues/{nr}` | Abgleich: ist das verknüpfte Issue noch offen? | `read:issue` |
| `POST …/issues` | **Aufgabe als Issue anlegen** | `write:issue` |
| `PATCH …/issues/{nr}` | **Issue schließen oder wieder öffnen** | `write:issue` |

`write:issue` schließt `read:issue` mit ein — Gitea versteht `write:` als „lesen und
schreiben". Beide anzuhaken schadet nicht, nötig ist es nicht.

#### Was Nebula nicht tut

- **Keine Kommentare.** Nebula schreibt nie einen Issue-Kommentar, weder beim Anlegen
  noch beim Schließen. Was im Rumpf des angelegten Issues steht, ist die
  Aufgabenbeschreibung plus eine Zeile Rückverweis — danach fasst Nebula den Text
  nicht mehr an.
- **Kein Code.** Nichts wird committet, gepusht, gemergt oder getaggt. Nebula ist eine
  Übersicht, keine Entwicklungsumgebung.
- **Keine Webhooks anlegen.** Den Haken trägst du selbst im Git-System ein — genau
  deshalb verlangt Nebula dafür keine Administrationsrechte.
- **Keine Labels, keine Meilensteine, keine Zuweisungen.**
- **Keine Adminrechte**, keine Organisations- oder Benutzerverwaltung.

Kommentare und Labels, die an einem Issue hängen, stammen also entweder aus der
Weboberfläche deines Git-Systems oder von einem anderen Werkzeug mit eigenem Token —
nicht von Nebula.

#### Der GitLab-Sonderfall

GitLab kennt keinen schmalen Schreib-Scope für Issues. Laut
[Access token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/)
gibt es nur `api` — „complete read and write access to the API" — und darunter direkt
`read_api`. Wer bei GitLab Aufgaben als Issue anlegen will, vergibt damit ein Token, das
auch Code ändern darf.

Wenn dir das zu weit geht: bleib bei `read_api` und verzichte auf die Issue-Anbindung.
Der Abgleich läuft vollständig, und geschlossene Issues werden weiterhin erkannt und
haken ihre Aufgabe ab — nur der Rückweg von Nebula ins Issue fällt weg. Ein eigenes
Dienstkonto, das nur Zugriff auf die betroffenen Projekte hat, ist der andere Ausweg.

#### Im Zweifel klein anfangen

Ein fehlendes Recht führt zu einem `403` mit dem Hinweis „Token hat nicht die noetigen
Scopes"; die Meldung steht am Repository auf der Projektseite. Fang mit Fall A an und
leg gezielt nach, wenn du die Issue-Anbindung wirklich benutzt — statt vorsorglich
alles zu vergeben.

### Automatisch statt auf Knopfdruck

Unter **Admin-Einstellungen → Automatischer Abgleich** lässt sich der Sync in den
Hintergrund verlegen: Abstand von 15 Minuten bis täglich, Anzahl Projekte je Durchlauf,
und wahlweise ohne fertige und archivierte Projekte. Standardmäßig ist er **aus**, weil
jeder Durchlauf API-Kontingent verbraucht.

Der Zeitgeber läuft im Serverprozess — kein zusätzlicher Container, kein externer Cron.
Nach Fehlschlägen wird ein Repository mit wachsendem Abstand zurückgehalten, damit ein
abgelaufener Token nicht dauerhaft Kontingent verbrennt. Einzelne Projekte lassen sich im
Projektdialog ausnehmen; manuell synchronisieren geht immer.

Wer lieber von außen taktet, lässt den Automatismus aus und ruft
`POST /api/admin/sync/run` per eigenem Cron auf.

---

## Export, Import und Sicherung

### Projekte mitnehmen

| Weg | Wo | Inhalt |
| --- | --- | --- |
| **Alle Projekte als JSON** | Dashboard → Datenbank-Symbol | Stammdaten, Notizen, Repo-Verknüpfung |
| **Ein Projekt als JSON** | Projektseite → Download-Symbol | dasselbe, für ein Projekt |
| **Ein Projekt als Markdown** | Projektseite → Download-Symbol | lesbar, inklusive letztem Git-Stand |
| **Import** | Dashboard → Datenbank-Symbol | JSON einlesen, mit Vorschau |

**Access Tokens sind nie enthalten.** Die Git-Verbindung wird nur beschrieben (Name,
System, Basis-URL); nach dem Import muss das Token neu hinterlegt werden. Verweist eine
importierte Datei auf eine hier unbekannte Verbindung, wird das Projekt ohne Verknüpfung
angelegt und in der Vorschau angezeigt.

Beim Import wird über den Slug abgeglichen. Für Treffer gibt es drei Strategien:

- **Überspringen** — Vorhandene bleiben unverändert
- **Zusätzlich anlegen** — Kopie mit freiem Slug (`nebula` → `nebula-2`)
- **Ersetzen** — Stammdaten überschreiben, Notizen austauschen

Vor dem Schreiben zeigt eine Vorschau, was passieren würde. Erst dann wird geschrieben.

### Sicherung

Zwei Wege, mit unterschiedlichem Zweck:

**JSON-Sicherung** (Admin-Einstellungen → Sicherung) enthält Einstellungen, Konten,
Verbindungen, Projekte und Notizen. Gut zum Umziehen. Passwörter liegen als scrypt-Hash
vor, Git-Tokens als Chiffrat — ohne dasselbe `APP_SECRET` sind sie wertlos. Trotzdem
vertraulich behandeln.

**Datenbank-Sicherung** über `pg_dump` — das, was man zum Wiederherstellen einer kaputten
Instanz braucht:

```powershell
.\scripts\backup.ps1                    # → .\backups\nebula-<datum>.sql
.\scripts\restore.ps1 -File .\backups\nebula-....sql
```

```bash
./scripts/backup.sh                     # → ./backups/nebula-<datum>.sql
./scripts/restore.sh backups/nebula-....sql
```

Die Skripte lesen Benutzer und Datenbankname aus der `.env` und führen `pg_dump` im
Container aus — auf dem Rechner selbst muss nichts installiert sein.

> Eine Sicherung ist erst dann eine Sicherung, wenn du sie einmal zurückgespielt hast.
> Das geht ohne Risiko in eine Wegwerf-Datenbank:
>
> ```powershell
> docker exec nebula-db psql -U nebula -d postgres -c "CREATE DATABASE nebula_test"
> .\scripts\restore.ps1 -File .\backups\nebula-....sql -Database nebula_test -Force
> ```

## Projektstruktur

```
nebula/
├── docker/entrypoint.sh        Migrationen + Serverstart im Container
├── docker-compose.yml          db (immer) · app (--profile full) · adminer (--profile tools)
├── Dockerfile                  Multi-Stage-Build auf Basis des Next-Standalone-Outputs
├── prisma/
│   ├── schema.prisma           Datenmodell
│   ├── migrations/             versionierte SQL-Migrationen
│   └── seed.ts                 Beispieldaten
├── scripts/setup.mjs           .env erzeugen inkl. APP_SECRET
└── src/
    ├── app/
    │   ├── page.tsx            Dashboard (Board, Filter, Kennzahlen)
    │   ├── projects/[id]/      Projektdetail: Beschreibung, Notizen, Aufgaben, Git
    │   ├── tasks/              Aufgaben über alle Projekte, nach Fälligkeit
    │   ├── rueckblick/         Wochenrückblick
    │   ├── verlauf/            Fortlaufende Zeitleiste
    │   ├── connections/        Verwaltung der Git-Verbindungen
    │   ├── account/ admin/     Eigenes Konto · Adminbereich
    │   └── api/                REST-Endpunkte (siehe Abschnitt „API")
    ├── components/             UI-Komponenten (Board, Karten, Panels, Dialoge)
    ├── lib/
    │   ├── auth/               Sitzungen, Passwörter, TOTP, WebAuthn, Zugriffsschutz
    │   ├── crypto.ts           AES-256-GCM für Access Tokens
    │   ├── db.ts               Prisma-Client
    │   ├── git/                Provider-Adapter: github.ts · gitlab.ts · gitea.ts
    │   ├── sync/               Repo-Snapshot holen, speichern, Zeitgeber
    │   ├── tasks/              Aufgabenlogik, Brücke zu Git-Issues
    │   ├── webhooks/           Signaturprüfung eingehender Webhooks
    │   ├── review.ts           Wochengrenzen und Kennzahlen
    │   ├── timeline.ts         Cursor-Blättern für den Verlauf
    │   ├── security/           SSRF-Schutz, Ratenbegrenzung, Body-Prüfung
    │   └── validation.ts       Zod-Schemas für alle Eingaben
    └── types/                  gemeinsame Typen für Server und Client
```

---

## npm-Skripte

| Skript | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver mit Hot Reload |
| `npm run build` / `npm start` | Produktionsbuild und -start (ohne Docker) |
| `npm run setup` | `.env` anlegen inkl. generiertem `APP_SECRET` |
| `npm run db:migrate` | Migrationen einspielen (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Neue Migration aus Schemaänderungen erzeugen |
| `npm run db:seed` | Beispielprojekte anlegen |
| `npm run db:studio` | Prisma Studio öffnen |
| `npm run db:reset` | Datenbank zurücksetzen (**löscht alles**) |
| `npm test` | Unit-Tests (Vitest), unter einer Sekunde |
| `npm run test:watch` | Tests im Beobachtungsmodus |
| `npm run typecheck` | TypeScript prüfen |
| `npm test` | Unit-Tests (Vitest, ohne Datenbank) |
| `npm run test:e2e` | Ende-zu-Ende-Tests (Playwright, baut vorher) |
| `npm run test:all` | Beides nacheinander |
| `npm run docker:db` | Nur die Datenbank starten, mit Host-Port für `npm run dev` |
| `npm run docker:up` / `docker:down` | Kompletten Stack starten / stoppen |
| `npm run docker:tools` | Adminer auf `http://localhost:8080` |

---

## API

Alle Endpunkte liefern und erwarten JSON.

Bis auf `/api/health` und `/api/auth/*` erfordern alle Endpunkte eine Anmeldung und liefern
ausschließlich Daten des angemeldeten Kontos.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/health` | Status inkl. Datenbankverbindung (Docker-Healthcheck) |
| `POST` | `/api/auth/setup` | Administratorkonto anlegen (nur beim ersten Mal) |
| `POST` | `/api/auth/login` `/api/auth/logout` `/api/auth/register` | Anmeldung |
| `POST` | `/api/auth/mfa` | Zweiter Faktor: Einmalkennwort oder Wiederherstellungscode |
| `GET` | `/api/auth/session` | Aktuelle Sitzung und Instanzzustand |
| `POST` | `/api/auth/passkey/{login,register}/{options,verify}` | WebAuthn |
| `PATCH` | `/api/account/profile` | Eigenes Profil |
| `POST` | `/api/account/password` | Eigenes Passwort setzen |
| `GET` `DELETE` | `/api/account/sessions` | Eigene Sitzungen / überall abmelden |
| `PATCH` `DELETE` | `/api/account/passkeys/:id` | Passkey umbenennen / entfernen |
| `GET` `POST` `PUT` `DELETE` | `/api/account/totp` | Zwei-Faktor: Zustand, einrichten, aktivieren, abschalten |
| `POST` | `/api/account/totp/recovery` | Neue Wiederherstellungscodes |
| `GET` `PATCH` | `/api/admin/settings` | Betriebsart, Registrierung, Abgleich (Admin) |
| `POST` | `/api/admin/sync/run` | Abgleich sofort anstoßen (Admin) |
| `GET` `POST` | `/api/admin/users` | Konten auflisten / anlegen (Admin) |
| `PATCH` `DELETE` | `/api/admin/users/:id` | Konto ändern / löschen (Admin) |
| `GET` `POST` | `/api/projects` | Projekte auflisten / anlegen |
| `GET` | `/api/projects/export` | Alle eigenen Projekte als JSON |
| `GET` | `/api/projects/:id/export` | Ein Projekt (`?format=md` für Markdown) |
| `POST` | `/api/projects/import` | Import, mit `dryRun` für die Vorschau |
| `GET` `POST` | `/api/templates` | Projektvorlagen auflisten / anlegen |
| `PATCH` `DELETE` | `/api/templates/:id` | Vorlage ändern / löschen |
| `POST` | `/api/templates/from-project` | Aus einem Projekt eine Vorlage machen |
| `GET` | `/api/admin/backup` | Vollständige Sicherung als JSON (Admin) |
| `GET` | `/api/search?q=` | Volltextsuche über eigene Notizen **und Aufgaben** |
| `GET` | `/api/activity` | Verlauf über alle Projekte, per Cursor (`?vor=&id=&limit=`) |
| `GET` `POST` | `/api/notifications` | Benachrichtigungsziele |
| `PATCH` `DELETE` | `/api/notifications/:id` | Ziel ändern / entfernen |
| `POST` | `/api/notifications/:id/test` | Testnachricht senden |
| `GET` `PATCH` `DELETE` | `/api/projects/:id` | Projekt lesen / ändern / löschen |
| `POST` | `/api/projects/:id/sync` | Alle Repositories des Projekts abgleichen |
| `PATCH` | `/api/projects/reorder` | Neue Reihenfolge im Brett |
| `POST` | `/api/projects/bulk` | Status, Tags oder Löschen für mehrere |
| `GET` | `/api/projects/:id/activity` | Verlauf des Projekts (`?limit=`) |
| `GET` `POST` | `/api/projects/:id/repositories` | Repositories des Projekts |
| `PATCH` `DELETE` | `/api/repositories/:id` | Repository ändern / vom Projekt lösen |
| `POST` | `/api/repositories/:id/sync` | Ein einzelnes Repository abgleichen |
| `POST` `DELETE` | `/api/repositories/:id/webhook` | Webhook einrichten / zurücknehmen |
| `POST` | `/api/webhooks/:repositoryId` | **Eingehend** von GitHub/GitLab/Gitea, per Signatur geprüft |
| `GET` `POST` | `/api/projects/:id/tasks` | Aufgaben des Projekts |
| `PATCH` | `/api/projects/:id/tasks/reorder` | Neue Reihenfolge nach dem Ziehen |
| `POST` | `/api/projects/:id/tasks/from-issues` | Offene Issues als Aufgaben übernehmen |
| `PATCH` `DELETE` | `/api/tasks/:id` | Aufgabe ändern / löschen |
| `POST` | `/api/tasks/:id/issue` | Aufgabe als Issue im verknüpften Repository anlegen |
| `GET` `POST` | `/api/projects/:id/notes` | Notizen des Projekts |
| `PATCH` `DELETE` | `/api/notes/:id` | Notiz ändern / löschen |
| `GET` `POST` | `/api/connections` | Git-Verbindungen |
| `PATCH` `DELETE` | `/api/connections/:id` | Verbindung ändern / löschen |
| `POST` | `/api/connections/:id/check` | Verbindung und Token testen |
| `GET` | `/api/connections/:id/repos` | Zugängliche Repositories auflisten |

Beispiel — Idee per Kommandozeile anlegen:

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Neue Idee","status":"IDEA","tags":["experiment"]}'
```

---

## Sicherheit

| Bereich | Umsetzung |
| --- | --- |
| **Anmeldung** | Passwort-Hashing mit **scrypt** (N=32768, r=8, p=1), serverseitige Sitzungen — in der Datenbank liegt nur der SHA-256-Hash des Cookie-Tokens |
| **Passkeys** | WebAuthn über SimpleWebAuthn, Challenges einmalig verwendbar und in der DB abgelegt, Signaturzähler wird fortgeschrieben |
| **Cookies** | `HttpOnly`, `SameSite=Lax`, `Secure` automatisch bei https |
| **CSRF** | Jede schreibende Anfrage muss vom eigenen Origin kommen (`Sec-Fetch-Site` / `Origin`); zusätzlich wird `Content-Type: application/json` erzwungen, was den Formular-Trick ohne Preflight ausschließt |
| **CSP** | Strikte Policy mit Per-Request-**Nonce** und `strict-dynamic`, dazu `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'` |
| **Weitere Header** | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` |
| **SSRF** | Die Basis-URL einer Git-Verbindung ist Benutzereingabe. Vor jedem ausgehenden Aufruf werden Hostname und **alle** aufgelösten IPs geprüft (auch nach Redirects); Loopback, Link-Local samt Cloud-Metadaten, Multicast und CGNAT sind gesperrt |
| **Datentrennung** | Jede Abfrage filtert auf den Besitzer. Fremde IDs liefern `404`, nicht `403` — die Antwort verrät also nicht einmal, dass es den Datensatz gibt |
| **Rate-Limiting** | Anmeldung pro IP und Konto, ausgehende Git-Aufrufe, WebAuthn-Optionen; Konto sperrt sich nach 8 Fehlversuchen für 15 Minuten |
| **Eingaben** | Zod-Schemas an jeder API-Grenze, Body auf 256 KB begrenzt |
| **Git-Tokens** | AES-256-GCM, Schlüssel per scrypt aus `APP_SECRET`. Werden nie an den Browser ausgeliefert — die API zeigt nur `ghp_…9f3a` |
| **Sitzungsende** | Deaktivieren, Löschen oder ein neues Passwort beenden sofort alle Sitzungen des Kontos |

Grenzen, die du kennen solltest:

- Ist `APP_SECRET` nicht gesetzt, warnt die App beim Start und nutzt einen unsicheren
  Entwicklungsschlüssel.
- Ohne `Origin`- **und** `Sec-Fetch-Site`-Header wird eine schreibende Anfrage
  durchgelassen. Das betrifft nur Nicht-Browser-Clients (curl, Skripte) und ist bewusst so,
  damit die API skriptbar bleibt — ein CSRF-Vektor ist es nicht, weil jeder Browser
  mindestens einen der beiden Header sendet.
- Das Rate-Limiting liegt im Arbeitsspeicher und wird beim Neustart zurückgesetzt.
- Es gibt **kein** HSTS und keine TLS-Terminierung. Für den Betrieb im Internet gehört ein
  Reverse Proxy mit gültigem Zertifikat davor — der ist ohnehin nötig, damit Passkeys
  funktionieren.
- Passwort-Zurücksetzen per E-Mail gibt es nicht; ein Administrator setzt Passwörter neu.

---

## Fehlersuche

| Symptom | Ursache / Lösung |
| --- | --- |
| `Can't reach database server` | Läuft `npm run docker:db`? Ein blosses `docker compose up -d db` startet die DB **ohne Host-Port** — dann ist sie von `npm run dev` aus nicht erreichbar. Stimmt `DATABASE_URL`? |
| `The table ... does not exist` | Migrationen fehlen: `npm run db:migrate` |
| Sync meldet `401` | Token abgelaufen oder falsche Scopes — unter Git-Verbindungen neu setzen |
| Sync meldet `404` | Owner/Repo prüfen; bei GitLab gehört die volle Gruppenkette in „Owner" |
| Sync meldet `403 Rate-Limit` | Ohne Token ist das Limit sehr niedrig — Token hinterlegen |
| Tokens plötzlich ungültig | `APP_SECRET` wurde geändert — Tokens neu eintragen |
| Port 3000 belegt | `APP_PORT` in der `.env` ändern (Docker) bzw. `npm run dev -- -p 3001` |
| `package.json#prisma is deprecated` | Harmlose Warnung von Prisma 6.19. Die Umstellung auf `prisma.config.ts` steht aus, weil dann die `.env` nicht mehr automatisch geladen wird — vor Prisma 7 zu erledigen |
| Passkey-Knopf fehlt / „kein sicherer Kontext" | `APP_URL` zeigt weder auf `https://` noch auf `http://localhost` |
| Passkey wird nicht akzeptiert | `APP_URL` weicht von der aufgerufenen Adresse ab, oder der Hostname wurde geändert (RP-ID) |
| Nach `docker compose down -v` ist alles weg | Das Volume enthielt Konten und Projekte — `-v` löscht es |
| Kein Zugriff auf die eigene Gitea im LAN | Läuft sie auf demselben Rechner? Dann `GIT_ALLOW_LOOPBACK=true` setzen |

---

## Getestet mit

Am 25.07.2026 gegen echte Systeme verifiziert — beide Betriebsarten, alle drei
Git-Adapter (GitHub, GitLab und Gitea jeweils gegen die öffentliche Instanz). Seitdem
laufen die Ende-zu-Ende-Tests bei jeder Änderung mit; live nach draußen geht davon nur
ein Test gegen die GitHub-API.

Werkzeugstand vom 18.08.2026:

| | Version |
| --- | --- |
| Node.js | 24.19.0 |
| npm | 11.17.0 |
| Next.js | 15.5.21 |
| Prisma | 6.19.3 |
| PostgreSQL | 17.11 (Alpine) |
| Docker | 29.7.2 |

---

## Lizenz

MIT — siehe [LICENSE](LICENSE).
