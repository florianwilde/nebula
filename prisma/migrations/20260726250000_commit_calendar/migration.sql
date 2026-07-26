-- AlterTable
ALTER TABLE "RepoSnapshot" ADD COLUMN     "commitCalendar" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "commitCalendarAt" TIMESTAMP(3);
