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

Alle Daten liegen in **deiner lokalen PostgreSQL**. Es gibt keinen Cloud-Dienst dahinter,
Access Tokens werden verschlüsselt abgelegt.

Eine vollständige Auflistung aller Funktionen steht in **[FEATURES.md](FEATURES.md)**.

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
docker compose up -d db      # Postgres 17 auf localhost:5432
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
| `DATABASE_URL` | PostgreSQL-Verbindung (Prisma) | `postgresql://nebula:nebula@localhost:5432/nebula` |
| `APP_SECRET` | Schlüssel für die Token-Verschlüsselung (AES-256-GCM) | — **unbedingt setzen** |
| `PORT` | Port der Anwendung | `3000` |
| `APP_PORT` | Host-Port-Mapping des App-Containers | `3000` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Zugangsdaten des DB-Containers | `nebula` |
| `POSTGRES_PORT` | Host-Port der Datenbank | `5432` |
| `ADMINER_PORT` | Host-Port von Adminer (`--profile tools`) | `8080` |
| `GIT_API_TIMEOUT_MS` | Timeout für Git-API-Aufrufe | `15000` |

> **`APP_SECRET` nachträglich ändern** macht bereits gespeicherte Git-Tokens unlesbar.
> Sie müssen dann in den Verbindungen neu hinterlegt werden — die restlichen Daten bleiben
> unberührt.

---

## Git-Verbindung einrichten

1. Im Git-System einen **Personal Access Token** mit Leserechten erzeugen:

   | System | Scopes |
   | --- | --- |
   | GitHub | Fine-grained Token: *Contents: Read*, *Metadata: Read*, *Issues: Read*, *Pull requests: Read* |
   | GitLab | `read_api` (alternativ `read_repository`) |
   | Gitea / Forgejo | `repository:read`, `issue:read`, `user:read` |

2. In Nebula unter **Git-Verbindungen → Verbindung hinzufügen** eintragen:
   System wählen, Basis-URL (z. B. `https://git.meine-firma.de`, ohne `/api`) und Token.
3. Mit **Testen** prüfen — Nebula meldet den erkannten Benutzer zurück.
4. Beim Anlegen oder Bearbeiten eines Projekts die Verbindung auswählen und über
   **Repos laden** das Repository aussuchen (oder die URL direkt eintippen).
5. Auf der Projektseite **Jetzt synchronisieren** — Branches, Tags, Commits und Releases
   werden geholt und als Snapshot gespeichert.

Der Snapshot bleibt in der Datenbank, das Dashboard funktioniert also auch offline.
Ohne Token gehen nur öffentliche Repositories, mit strengem Rate-Limit.

---

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
    │   ├── projects/[id]/      Projektdetail: Beschreibung, Notizen, Git
    │   ├── connections/        Verwaltung der Git-Verbindungen
    │   └── api/                REST-Endpunkte (Projekte, Notizen, Verbindungen, Sync)
    ├── components/             UI-Komponenten (Board, Karten, Panels, Dialoge)
    ├── lib/
    │   ├── crypto.ts           AES-256-GCM für Access Tokens
    │   ├── db.ts               Prisma-Client
    │   ├── git/                Provider-Adapter: github.ts · gitlab.ts · gitea.ts
    │   ├── sync.ts             Repo-Snapshot holen und speichern
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
| `npm run typecheck` | TypeScript prüfen |
| `npm run docker:db` | Nur die Datenbank starten |
| `npm run docker:up` / `docker:down` | Kompletten Stack starten / stoppen |
| `npm run docker:tools` | Adminer auf `http://localhost:8080` |

---

## API

Alle Endpunkte liefern und erwarten JSON.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/health` | Status inkl. Datenbankverbindung (Docker-Healthcheck) |
| `GET` `POST` | `/api/projects` | Projekte auflisten / anlegen |
| `GET` `PATCH` `DELETE` | `/api/projects/:id` | Projekt lesen / ändern / löschen |
| `POST` | `/api/projects/:id/sync` | Repo-Daten vom Git-System holen |
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

## Sicherheitshinweise

- Nebula hat **keine Benutzerverwaltung** und ist für den Betrieb im eigenen Netz gedacht.
  Vor einer Veröffentlichung im Internet unbedingt einen Reverse Proxy mit Authentifizierung
  davorschalten.
- Access Tokens werden mit **AES-256-GCM** verschlüsselt gespeichert, aus `APP_SECRET` per
  scrypt abgeleitet. Sie werden ausschließlich serverseitig entschlüsselt und nie an den
  Browser ausgeliefert — die API zeigt nur einen Hinweis wie `ghp_…9f3a`.
- Ist `APP_SECRET` nicht gesetzt, warnt die App beim Start und nutzt einen unsicheren
  Entwicklungsschlüssel.

---

## Fehlersuche

| Symptom | Ursache / Lösung |
| --- | --- |
| `Can't reach database server` | Läuft `docker compose up -d db`? Stimmt `DATABASE_URL`? |
| `The table ... does not exist` | Migrationen fehlen: `npm run db:migrate` |
| Sync meldet `401` | Token abgelaufen oder falsche Scopes — unter Git-Verbindungen neu setzen |
| Sync meldet `404` | Owner/Repo prüfen; bei GitLab gehört die volle Gruppenkette in „Owner" |
| Sync meldet `403 Rate-Limit` | Ohne Token ist das Limit sehr niedrig — Token hinterlegen |
| Tokens plötzlich ungültig | `APP_SECRET` wurde geändert — Tokens neu eintragen |
| Port 3000 belegt | `APP_PORT` in der `.env` ändern (Docker) bzw. `npm run dev -- -p 3001` |

---

## Lizenz

MIT — siehe [LICENSE](LICENSE).
