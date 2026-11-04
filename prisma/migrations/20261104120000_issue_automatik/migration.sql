-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "autoCreateIssues" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoImportIssues" BOOLEAN NOT NULL DEFAULT false;
