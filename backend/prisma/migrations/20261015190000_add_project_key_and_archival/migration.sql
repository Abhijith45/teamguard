-- AlterTable: Add key and isArchived to Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "key" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- Backfill default keys for existing projects if null
UPDATE "Project"
SET "key" = CASE
  WHEN "name" = 'Nova UI Revamp' THEN 'NOV'
  WHEN "name" = 'Orion SaaS Platform' THEN 'ORION'
  WHEN "name" = 'PixelFrame Website' THEN 'PIXEL'
  WHEN "name" = 'Zetta Landing Page' THEN 'ZETTA'
  ELSE 'PROJ_' || id
END
WHERE "key" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Project_organizationId_key_key" ON "Project"("organizationId", "key");
CREATE INDEX IF NOT EXISTS "Project_organizationId_isArchived_idx" ON "Project"("organizationId", "isArchived");
