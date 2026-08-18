# Nebula – Hinweise für Claude Code

Dashboard für Vibe-Coding-Projekte. Next.js 15 (App Router), TypeScript,
Tailwind 4, Prisma, PostgreSQL. Oberfläche und Texte sind **deutsch**.

Funktionsumfang: [FEATURES.md](FEATURES.md) · Geplantes: [ROADMAP.md](ROADMAP.md) ·
Betrieb: [README.md](README.md) · Server: [DEPLOYMENT.md](DEPLOYMENT.md)

## Womit man arbeitet

```bash
npm run docker:db              # Postgres, muss laufen (mit dem dev-Overlay,
                               # sonst hat die DB keinen Host-Port)
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
- **Die feste Zeitzone gilt auch beim *Rechnen*, nicht nur beim Formatieren.**
  Im Container läuft die Anwendung nach UTC; „welcher Kalendertag" und
  „welche Woche" kippen dort abends um einen Tag. `lib/tasks` (`dueBucket`)
  und `lib/review` (`wocheUm`) rechnen deshalb über Berliner Kalendertage.
  Und eine Woche ist **nicht** „7 × 24 Stunden" — bei einer Zeitumstellung
  hat sie 167 oder 169.
- **`min-width: auto` bei Flex- und Grid-Kindern.** Hat hier zweimal
  zugeschlagen: ein Kind weigert sich, unter die Inhaltsbreite seines
  breitesten Kindes zu schrumpfen, und drückt stattdessen die Nachbarn aus
  dem Bild. Einmal war es ein Sortierfeld mit `min-width`, das „Neues
  Projekt" hinausschob; einmal die Heatmap, die die ganze Projektseite
  doppelt so breit machte. Heilmittel ist beide Male `min-w-0` am Kind —
  ohne das greift auch ein `overflow-x-auto` darin nicht.
- **`body { overflow-x: hidden }` versteckt genau diese Fehler.** Es steht in
  `globals.css` als Notnagel; was es abschneidet, ist auf dem Telefon
  schlicht nicht mehr erreichbar. Ursachen gehören in die Komponente.
- **Dialoge müssen der Bildschirmtastatur ausweichen.** Sie verkleinert nur
  das *sichtbare* Fenster, nicht das Layoutfenster — `position: fixed` und
  `100vh` beziehen sich weiter auf das volle. `components/ui/Modal.tsx` hängt
  dafür an `window.visualViewport`; wer ein eigenes Overlay baut, braucht
  dasselbe.
- **Blättern über Cursor, nicht über `skip`.** Der Aktivitätsverlauf schreibt
  mehrere Zeilen im selben Augenblick; ein Offset über so eine Grenze hinweg
  überspringt oder verdoppelt lautlos. Muster in `lib/timeline.ts`:
  `(createdAt, id)` als Cursor, Sortierung identisch zur Bedingung.

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

**Das Zielverzeichnis vorher *nicht* anlegen.** Ein leerer Ordner unter
`prisma/migrations/` lässt `--from-migrations` mit `P3015` abbrechen
(„Could not find the migration file"). Erst die SQL woandershin erzeugen,
dann Ordner anlegen und hineinkopieren.

**Die erzeugte SQL vor dem Anwenden lesen.** Die Volltextindizes
`Note_fulltext_idx` und `Task_fulltext_idx` sind Ausdrucksindizes, die Prisma
nicht kennt (sie werden bislang in Ruhe gelassen, aber das ist nicht
garantiert).

**Ein Ausdrucksindex greift nur bei Zeichengleichheit.** Weicht der Ausdruck
in der Abfrage auch nur in einem `coalesce` vom Index ab, rechnet Postgres
`to_tsvector` je Zeile neu — ohne Fehlermeldung. Nachsehen statt annehmen:

```bash
docker exec nebula-db psql -U nebula -d <db> -c "SET enable_seqscan = off;
EXPLAIN (COSTS OFF) SELECT …"    # muss einen Bitmap Index Scan zeigen
```

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

**Seitlichen Überlauf misst man.** `document.documentElement.scrollWidth`
gegen `clientWidth` auf 375 px — das findet in Sekunden, was beim Ansehen
durchrutscht. Ein Skript, das dabei nur die *obersten* Verursacher meldet
(Eltern, die selbst schon überlaufen, herausfiltern), ist deutlich brauchbarer
als eine Liste aller betroffenen Knoten.

**Die Testdaten müssen die Bausteine enthalten, um die es geht.** Eine
Messung gegen ein Projekt ohne Repository, ohne Snapshot und ohne README
bescheinigte hier einmal „alles in Ordnung", während die echte Projektseite
doppelt so breit war wie der Bildschirm. Erst mit vollständigen Daten
nachgestellt trat der Fehler zutage.

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
