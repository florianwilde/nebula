# Nebula – Hinweise für Claude Code

Dashboard für Vibe-Coding-Projekte. Next.js 15 (App Router), TypeScript,
Tailwind 4, Prisma, PostgreSQL. Oberfläche und Texte sind **deutsch**.

Funktionsumfang: [FEATURES.md](FEATURES.md) · Geplantes: [ROADMAP.md](ROADMAP.md) ·
Betrieb: [README.md](README.md) · Server: [DEPLOYMENT.md](DEPLOYMENT.md)

## Womit man arbeitet

```bash
docker compose up -d db        # Postgres, muss laufen
npm run dev                    # Entwicklung
npm test                       # Unit-Tests (Vitest, ohne DB)
npx tsc --noEmit               # Typprüfung
npm run build                  # Produktionsbau
docker compose --profile full up -d --build    # alles im Container
```

**Vor dem `npm run build` einen laufenden `npm start`/`npm run dev` beenden.**
Sonst hält der Prozess die Prisma-Engine-DLL und der Bau bricht unter Windows
mit `EPERM … query_engine-windows.dll.node` ab.

## Nicht verhandelbar

**Datentrennung.** Jede Abfrage filtert auf den Besitzer, und zwar an erster
Stelle in der `where`-Klausel. Schreiben und Löschen laufen über
`updateMany`/`deleteMany` mit `ownerId`, damit fremde Datensätze gar nicht
erst getroffen werden. Fremde IDs liefern **404, nicht 403** — die Antwort
soll nicht bestätigen, dass es den Datensatz gibt.

**Jeder Endpunkt prüft selbst.** `requireUserApi()` bzw. `requireUserPage()`
sind die Sicherheitsgrenze. Die Middleware schaut nur, ob überhaupt ein
Cookie mitkommt — im Edge-Runtime gibt es keine Datenbank.

**Eingaben validieren.** Zod an jeder API-Grenze, Body über `readJsonBody`
(erzwingt `application/json` und begrenzt die Größe).

**Keine Geheimnisse nach außen.** Git-Tokens verlassen den Server nie;
Verbindungen werden über `connectionSafeSelect` geladen. Projekt-Exporte
enthalten grundsätzlich keine Tokens.

**Ausgehende Aufrufe nur über `lib/git/http.ts`** — dort greift der
SSRF-Schutz (`lib/security/ssrf.ts`).

## Fallstricke, die schon zugeschlagen haben

- **`node:`-Module in Client-Komponenten.** `lib/crypto`, `lib/auth/password`,
  `lib/git/index` ziehen `node:crypto`/`node:net` nach. Client-Komponenten
  importieren stattdessen `lib/git/meta` bzw. `lib/auth/constants`.
- **`instrumentation.ts` wird auch für Edge übersetzt.** Der dynamische Import
  muss *innerhalb* von `if (process.env.NEXT_RUNTIME === "nodejs")` stehen,
  sonst scheitert der Bau an `node:crypto`.
- **Eigene CSS-Klassen gehören in `app/components.css`** und dort in
  `@layer components`. Außerhalb eines Layers gewinnen sie gegen
  Tailwind-Utilities — dann greift `pl-9` neben `.field` nicht mehr.
- **Menüs und Dialoge über Portal.** Karten setzen `overflow-hidden` und
  `backdrop-filter`; Letzteres erzeugt einen neuen Bezugsrahmen, in dem
  `position: fixed` und `z-index` nicht mehr wie erwartet wirken. Dafür gibt
  es `components/ui/Popover.tsx` und `components/ui/Modal.tsx`.
- **Overlays brauchen einen deckenden Hintergrund** (`.popover`), nicht
  `.glass` — dessen 3,5 % Deckkraft lassen alles durchscheinen.
- **Datumsangaben** über `lib/utils` formatieren (feste Zeitzone), sonst
  weichen Server-Render und Hydration voneinander ab. Relative Zeiten
  bekommen `suppressHydrationWarning`.

## Migrationen

`prisma migrate dev` ist hier nicht benutzbar (interaktiv). Stattdessen:

```bash
docker exec nebula-db psql -U nebula -d postgres -c "CREATE DATABASE nebula_shadow"
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://nebula:nebula@localhost:5432/nebula_shadow \
  --script --output prisma/migrations/<stempel>_<name>/migration.sql
npx prisma migrate deploy
```

**`--from-migrations`, nicht `--from-schema-datasource`.** Letzteres
vergleicht mit der *laufenden* Datenbank. Ist eine eben erzeugte Migration
dort noch nicht eingespielt, steht ihr Inhalt in der nächsten gleich noch
einmal.

**Die erzeugte SQL vor dem Anwenden lesen.** Der Volltextindex
`Note_fulltext_idx` ist ein Ausdrucksindex, den Prisma nicht kennt (er wird
bislang in Ruhe gelassen, aber das ist nicht garantiert).

**Datenmigrationen von Hand schreiben.** `migrate diff` kennt nur den
Zielzustand: Spalten, die woandershin wandern, würde es ersatzlos löschen.
Vorgehen wie in `20260726230000_repositories`: neue Tabelle anlegen, Bestand
per `INSERT … SELECT` übernehmen, dann erst die alten Spalten entfernen.
Danach `migrate diff` erneut laufen lassen — kommt „empty migration“ heraus,
stimmt das Ergebnis mit dem Schema überein. Und gegen eine Kopie mit echten
Daten prüfen, nicht nur gegen eine leere Datenbank.

## Prüfen, nicht behaupten

Vor „fertig": `npx tsc --noEmit`, `npm test`, `npm run build`.

Bei Änderungen an der Oberfläche **hinsehen**. Chrome ist installiert, ein
Skript mit `playwright-core` und `channel: "chrome"` genügt für Screenshots.
Mehrere Anzeigefehler dieses Projekts sind ausschließlich so aufgefallen.

**Barrierefreiheit misst man, statt sie zu behaupten.** `axe-core` liegt als
Entwicklungsabhängigkeit bereit; ein Skript hängt es per `addScriptTag` in
die laufende Seite und ruft `axe.run` mit den WCAG-Tags auf. Jeder
Dialogzustand ist eine eigene Prüfung — geschlossene Dialoge stehen nicht im
DOM. Der Kontrast gedämpfter Texte ist der Punkt, der hier schon einmal
gerissen wurde; die aufgehellten Stufen stehen in `globals.css` im `@theme`.

Wer den Standalone-Bau von Hand startet (`node .next/standalone/server.js`),
muss vorher `.next/static` und `public` danebenkopieren — sonst lädt kein
JavaScript, die Seite bleibt serverseitig gerendert, und Formulare senden
sich nativ ab. Das sieht aus wie ein Anwendungsfehler, ist aber keiner:

```bash
cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
```

`pkill` gibt es in dieser Git-Bash nicht. Prozesse über PowerShell beenden
(`Get-CimInstance Win32_Process … | Stop-Process`) — sonst läuft der alte
Server weiter, hält die Prisma-DLL und blockiert den nächsten Bau.

**Niemals gegen die echte Datenbank testen.** Eine Wegwerf-Datenbank anlegen
und danach löschen:

```bash
docker exec nebula-db psql -U nebula -d postgres -c "CREATE DATABASE nebula_test"
DATABASE_URL=postgresql://nebula:nebula@localhost:5432/nebula_test npx prisma migrate deploy
```

## Sprache

Code-Kommentare, Commit-Nachrichten und Oberfläche auf Deutsch, **ohne
Umlaute in Bezeichnern und Commit-Nachrichten** (bestehende Konvention).
In Markdown-Dateien und in der Oberfläche sind Umlaute erwünscht.

Commits: Conventional Commits, Betreff deutsch, Rumpf erklärt **warum** —
nicht was der Diff ohnehin zeigt.
