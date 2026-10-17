-- CreateTable: NotificationPreference table
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER,
    "emailDigest" TEXT NOT NULL DEFAULT 'DAILY',
    "notifyTaskAssigned" BOOLEAN NOT NULL DEFAULT true,
    "notifyTaskStatusChanged" BOOLEAN NOT NULL DEFAULT true,
    "notifyCommentAdded" BOOLEAN NOT NULL DEFAULT true,
    "notifyProjectArchived" BOOLEAN NOT NULL DEFAULT true,
    "notifyDueSoon" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_organizationId_key" ON "NotificationPreference"("userId", "organizationId");
CREATE INDEX IF NOT EXISTS "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");
CREATE INDEX IF NOT EXISTS "NotificationPreference_organizationId_idx" ON "NotificationPreference"("organizationId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_userId_fkey'
    ) THEN
        ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_organizationId_fkey'
    ) THEN
        ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
