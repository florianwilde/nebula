-- Volltextsuche ueber Notizen.
--
-- Dies ist ein Ausdrucksindex. Prisma kann so etwas im Schema nicht abbilden
-- und kennt ihn deshalb nicht. Nachgeprueft: "prisma migrate diff" laesst ihn
-- in Ruhe und schlaegt kein DROP vor - Ausdrucksindizes werden schlicht
-- ignoriert. Trotzdem beim Erzeugen kuenftiger Migrationen kurz hinsehen.
--
-- Faellt er doch einmal weg, funktioniert die Suche weiter, nur langsamer:
-- Postgres berechnet to_tsvector dann je Zeile.
--
-- Der Ausdruck muss mit dem in src/app/api/search/route.ts uebereinstimmen,
-- sonst greift der Index nicht. Die zweistellige Form von to_tsvector mit
-- fester Konfiguration ist IMMUTABLE und damit indizierbar.

CREATE INDEX "Note_fulltext_idx" ON "Note"
  USING GIN (to_tsvector('german', coalesce("title", '') || ' ' || "content"));
