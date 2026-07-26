-- AlterTable
ALTER TABLE "RepoSnapshot" ADD COLUMN     "readme" TEXT,
ADD COLUMN     "readmeAt" TIMESTAMP(3),
ADD COLUMN     "readmeBaseUrl" TEXT,
ADD COLUMN     "readmePath" TEXT;
