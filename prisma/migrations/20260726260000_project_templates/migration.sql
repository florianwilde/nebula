-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "summary" TEXT,
    "projectDescription" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'IDEA',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "accent" TEXT NOT NULL DEFAULT 'violet',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "progressFromTasks" BOOLEAN NOT NULL DEFAULT false,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "tasks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTemplate_ownerId_idx" ON "ProjectTemplate"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTemplate_ownerId_name_key" ON "ProjectTemplate"("ownerId", "name");

-- AddForeignKey
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
