-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "webhookLastAt" TIMESTAMP(3),
ADD COLUMN     "webhookSecret" TEXT;
