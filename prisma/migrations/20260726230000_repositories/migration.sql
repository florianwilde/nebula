-- Mehrere Repositories je Projekt.
--
-- Die Git-Felder wandern vom Projekt in eine eigene Tabelle. Bestehende
-- Projekte bekommen daraus genau ein Repository, damit nichts verlorengeht;
-- der Snapshot haengt danach am Repository statt am Projekt.
--
-- Von Hand geschrieben: prisma migrate diff wuerde die Spalten am Projekt
-- ersatzlos loeschen und die Snapshots gleich mit.

-- ── 1. Neue Tabelle ─────────────────────────────────────────
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT,
    "repoUrl" TEXT,
    "repoOwner" TEXT,
    "repoName" TEXT,
    "defaultBranch" TEXT,
    "connectionId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "syncFailureCount" INTEGER NOT NULL DEFAULT 0,
    "notifiedSyncError" TEXT,
    "notifiedCiState" TEXT,
    "notifiedRelease" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Repository_projectId_position_idx" ON "Repository"("projectId", "position");
CREATE INDEX "Repository_connectionId_idx" ON "Repository"("connectionId");

ALTER TABLE "Repository" ADD CONSTRAINT "Repository_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "GitConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Bestand uebernehmen ──────────────────────────────────
-- Nur Projekte, an denen wirklich etwas haengt. Ein Projekt, das bloss eine
-- Verbindung ausgewaehlt hatte, ohne je ein Repo zu nennen, braucht keine
-- leere Zeile.
INSERT INTO "Repository" (
    "id", "projectId", "repoUrl", "repoOwner", "repoName", "defaultBranch",
    "connectionId", "position", "lastSyncedAt", "syncError", "autoSync",
    "syncFailureCount", "notifiedSyncError", "notifiedCiState", "notifiedRelease",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text, "id", "repoUrl", "repoOwner", "repoName", "defaultBranch",
    "connectionId", 0, "lastSyncedAt", "syncError", "autoSync",
    "syncFailureCount", "notifiedSyncError", "notifiedCiState", "notifiedRelease",
    "createdAt", CURRENT_TIMESTAMP
FROM "Project"
WHERE "repoUrl" IS NOT NULL
   OR ("repoOwner" IS NOT NULL AND "repoName" IS NOT NULL);

-- ── 3. Snapshots umhaengen ──────────────────────────────────
ALTER TABLE "RepoSnapshot" ADD COLUMN "repositoryId" TEXT;

UPDATE "RepoSnapshot" AS s
SET "repositoryId" = r."id"
FROM "Repository" AS r
WHERE r."projectId" = s."projectId";

-- Ein Snapshot ohne zugehoeriges Repository kann nur entstanden sein, wenn
-- jemand die Repo-Angaben nachtraeglich geleert hat. Er ist ohnehin nicht
-- mehr zuzuordnen und beim naechsten Abgleich neu geholt.
DELETE FROM "RepoSnapshot" WHERE "repositoryId" IS NULL;

ALTER TABLE "RepoSnapshot" ALTER COLUMN "repositoryId" SET NOT NULL;
ALTER TABLE "RepoSnapshot" DROP CONSTRAINT "RepoSnapshot_projectId_fkey";
DROP INDEX "RepoSnapshot_projectId_key";
ALTER TABLE "RepoSnapshot" DROP COLUMN "projectId";

CREATE UNIQUE INDEX "RepoSnapshot_repositoryId_key" ON "RepoSnapshot"("repositoryId");
ALTER TABLE "RepoSnapshot" ADD CONSTRAINT "RepoSnapshot_repositoryId_fkey"
    FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. Herkunft uebernommener Aufgaben ──────────────────────
-- Bisher war die Issue-Nummer je Projekt eindeutig. Mit mehreren Repos
-- reicht das nicht mehr: Frontend und Backend haben beide ein Issue 5.
ALTER TABLE "Task" ADD COLUMN "sourceRepositoryId" TEXT;

UPDATE "Task" AS t
SET "sourceRepositoryId" = r."id"
FROM "Repository" AS r
WHERE r."projectId" = t."projectId" AND t."sourceIssue" IS NOT NULL;

DROP INDEX "Task_projectId_sourceIssue_key";
CREATE UNIQUE INDEX "Task_projectId_sourceRepositoryId_sourceIssue_key"
    ON "Task"("projectId", "sourceRepositoryId", "sourceIssue");

-- ── 5. Projekt aufraeumen ───────────────────────────────────
ALTER TABLE "Project" DROP CONSTRAINT "Project_connectionId_fkey";
DROP INDEX "Project_connectionId_idx";

ALTER TABLE "Project"
    DROP COLUMN "repoUrl",
    DROP COLUMN "repoOwner",
    DROP COLUMN "repoName",
    DROP COLUMN "defaultBranch",
    DROP COLUMN "connectionId",
    DROP COLUMN "lastSyncedAt",
    DROP COLUMN "syncError",
    DROP COLUMN "autoSync",
    DROP COLUMN "syncFailureCount",
    DROP COLUMN "notifiedSyncError",
    DROP COLUMN "notifiedCiState",
    DROP COLUMN "notifiedRelease";
