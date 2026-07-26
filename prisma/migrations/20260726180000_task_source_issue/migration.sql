-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "sourceIssue" INTEGER,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_sourceIssue_key" ON "Task"("projectId", "sourceIssue");
