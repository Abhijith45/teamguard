-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_deletedAt_idx" ON "Project"("deletedAt");
CREATE INDEX IF NOT EXISTS "Project_organizationId_deletedAt_idx" ON "Project"("organizationId", "deletedAt");
