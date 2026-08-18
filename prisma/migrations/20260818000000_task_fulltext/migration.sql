-- Volltextsuche ueber Aufgaben.
--
-- Wie Note_fulltext_idx ein Ausdrucksindex: Prisma kann so etwas im Schema
-- nicht abbilden und kennt ihn deshalb nicht. Nachgeprueft mit
-- "prisma migrate diff" gegen das Schema - es kommt "empty migration"
-- heraus, der Index wird also weder angelegt noch geloescht. Trotzdem beim
-- Erzeugen kuenftiger Migrationen kurz hinsehen.
--
-- Faellt er doch einmal weg, funktioniert die Suche weiter, nur langsamer:
-- Postgres berechnet to_tsvector dann je Zeile.
--
-- Der Ausdruck muss Zeichen fuer Zeichen dem in src/app/api/search/route.ts
-- entsprechen, sonst greift der Index nicht. Die zweistellige Form von
-- to_tsvector mit fester Konfiguration ist IMMUTABLE und damit indizierbar.
--
-- Anders als bei der Notiz ist auch die Beschreibung optional, deshalb steht
-- coalesce um beide Spalten.

CREATE INDEX "Task_fulltext_idx" ON "Task"
  USING GIN (to_tsvector('german', coalesce("title", '') || ' ' || coalesce("description", '')));
