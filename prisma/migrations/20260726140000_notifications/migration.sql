-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WEBHOOK', 'NTFY', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('SYNC_FAILED', 'CI_FAILED', 'NEW_RELEASE');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "notifiedCiState" TEXT,
ADD COLUMN     "notifiedRelease" TEXT,
ADD COLUMN     "notifiedSyncError" TEXT;

-- CreateTable
CREATE TABLE "NotificationTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "secretCipher" TEXT,
    "secretHint" TEXT,
    "events" "NotificationEvent"[] DEFAULT ARRAY[]::"NotificationEvent"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "lastOk" BOOLEAN,
    "lastMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationTarget_userId_idx" ON "NotificationTarget"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTarget_userId_name_key" ON "NotificationTarget"("userId", "name");

-- AddForeignKey
ALTER TABLE "NotificationTarget" ADD CONSTRAINT "NotificationTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
