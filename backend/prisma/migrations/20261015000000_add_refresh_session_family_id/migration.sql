-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "familyId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RefreshSession_familyId_idx" ON "RefreshSession"("familyId");
