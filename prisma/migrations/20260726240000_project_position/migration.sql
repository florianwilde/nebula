-- Freie Reihenfolge im Projektbrett.
--
-- Der Bestand bekommt seine Position aus der bisherigen Anzeige: je Konto und
-- Spalte nach Aenderungsdatum absteigend. Ohne diesen Schritt staenden alle
-- auf 0 und das Brett zeigte eine willkuerliche Reihenfolge, die sich bei
-- jedem Laden anders ergeben koennte.

ALTER TABLE "Project" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "Project" AS p
SET "position" = nummeriert.rang - 1
FROM (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "ownerId", "status" ORDER BY "updatedAt" DESC, "id"
    ) AS rang
    FROM "Project"
) AS nummeriert
WHERE nummeriert."id" = p."id";

CREATE INDEX "Project_ownerId_status_position_idx" ON "Project"("ownerId", "status", "position");
