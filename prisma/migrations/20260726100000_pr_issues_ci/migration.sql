-- AlterTable
ALTER TABLE "RepoSnapshot" ADD COLUMN     "ciBranch" TEXT,
ADD COLUMN     "ciFinishedAt" TIMESTAMP(3),
ADD COLUMN     "ciName" TEXT,
ADD COLUMN     "ciState" TEXT,
ADD COLUMN     "ciUrl" TEXT,
ADD COLUMN     "commitActivity" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "issues" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "pullRequests" JSONB NOT NULL DEFAULT '[]';
