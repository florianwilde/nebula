-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "autoSyncActiveOnly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoSyncBatchSize" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "lastAutoSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastAutoSyncReport" JSONB;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "autoSync" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "syncFailureCount" INTEGER NOT NULL DEFAULT 0;
