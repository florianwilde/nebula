-- AlterTable
ALTER TABLE "RepoSnapshot" ADD COLUMN     "completeAt" TIMESTAMP(3),
ADD COLUMN     "missing" JSONB NOT NULL DEFAULT '{}';
