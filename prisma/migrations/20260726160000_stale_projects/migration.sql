-- AlterEnum
ALTER TYPE "NotificationEvent" ADD VALUE 'PROJECT_STALE';

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "lastStaleCheckAt" TIMESTAMP(3),
ADD COLUMN     "staleAfterDays" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "notifiedStaleAt" TIMESTAMP(3);
