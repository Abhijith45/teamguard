-- AlterTable: Organization Phase 5 fields
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "storageQuotaBytes" BIGINT NOT NULL DEFAULT 10737418240;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "usedStorageBytes" BIGINT NOT NULL DEFAULT 0;

-- AlterTable: User Phase 5 fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: FileAsset Phase 5 fields
ALTER TABLE "FileAsset" ADD COLUMN IF NOT EXISTS "fileType" TEXT NOT NULL DEFAULT 'FILE';
ALTER TABLE "FileAsset" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'READY';
ALTER TABLE "FileAsset" ADD COLUMN IF NOT EXISTS "etag" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN IF NOT EXISTS "checksumSha256" TEXT;
ALTER TABLE "FileAsset" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "FileAsset_storageKey_idx" ON "FileAsset"("storageKey");
CREATE INDEX IF NOT EXISTS "FileAsset_status_idx" ON "FileAsset"("status");

-- CreateTable: PlatformAuditLog
CREATE TABLE IF NOT EXISTS "PlatformAuditLog" (
    "id" SERIAL NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "targetOrganizationId" INTEGER,
    "ticketId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "prevLogHash" TEXT NOT NULL,
    "currentHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformAuditLog_operatorId_idx" ON "PlatformAuditLog"("operatorId");
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_targetOrganizationId_idx" ON "PlatformAuditLog"("targetOrganizationId");
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");

-- CreateTable: BreakGlassAlertOutbox
CREATE TABLE IF NOT EXISTS "BreakGlassAlertOutbox" (
    "id" SERIAL NOT NULL,
    "targetOrganizationId" INTEGER NOT NULL,
    "designatedMemberId" INTEGER NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "ticketId" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakGlassAlertOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BreakGlassAlertOutbox_status_idx" ON "BreakGlassAlertOutbox"("status");
CREATE INDEX IF NOT EXISTS "BreakGlassAlertOutbox_targetOrganizationId_idx" ON "BreakGlassAlertOutbox"("targetOrganizationId");
CREATE INDEX IF NOT EXISTS "BreakGlassAlertOutbox_createdAt_idx" ON "BreakGlassAlertOutbox"("createdAt");

-- CreateTable: PlatformMfaNonce
CREATE TABLE IF NOT EXISTS "PlatformMfaNonce" (
    "id" SERIAL NOT NULL,
    "nonce" TEXT NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "targetOrganizationId" INTEGER,
    "purpose" TEXT NOT NULL DEFAULT 'break-glass',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformMfaNonce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformMfaNonce_nonce_key" ON "PlatformMfaNonce"("nonce");
CREATE INDEX IF NOT EXISTS "PlatformMfaNonce_nonce_idx" ON "PlatformMfaNonce"("nonce");
CREATE INDEX IF NOT EXISTS "PlatformMfaNonce_expiresAt_idx" ON "PlatformMfaNonce"("expiresAt");

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PlatformAuditLog_operatorId_fkey'
    ) THEN
        ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PlatformAuditLog_targetOrganizationId_fkey'
    ) THEN
        ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BreakGlassAlertOutbox_targetOrganizationId_fkey'
    ) THEN
        ALTER TABLE "BreakGlassAlertOutbox" ADD CONSTRAINT "BreakGlassAlertOutbox_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BreakGlassAlertOutbox_operatorId_fkey'
    ) THEN
        ALTER TABLE "BreakGlassAlertOutbox" ADD CONSTRAINT "BreakGlassAlertOutbox_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BreakGlassAlertOutbox_designatedMemberId_fkey'
    ) THEN
        ALTER TABLE "BreakGlassAlertOutbox" ADD CONSTRAINT "BreakGlassAlertOutbox_designatedMemberId_fkey" FOREIGN KEY ("designatedMemberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
