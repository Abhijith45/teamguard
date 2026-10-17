-- CreateTable: MembershipInvitation table
CREATE TABLE IF NOT EXISTS "MembershipInvitation" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "inviterId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "MembershipInvitation_tokenHash_key" ON "MembershipInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "MembershipInvitation_organizationId_idx" ON "MembershipInvitation"("organizationId");
CREATE INDEX IF NOT EXISTS "MembershipInvitation_email_idx" ON "MembershipInvitation"("email");
CREATE INDEX IF NOT EXISTS "MembershipInvitation_status_idx" ON "MembershipInvitation"("status");
CREATE INDEX IF NOT EXISTS "MembershipInvitation_tokenHash_idx" ON "MembershipInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "MembershipInvitation_expiresAt_idx" ON "MembershipInvitation"("expiresAt");

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MembershipInvitation_organizationId_fkey'
    ) THEN
        ALTER TABLE "MembershipInvitation" ADD CONSTRAINT "MembershipInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MembershipInvitation_inviterId_fkey'
    ) THEN
        ALTER TABLE "MembershipInvitation" ADD CONSTRAINT "MembershipInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MembershipInvitation_roleId_fkey'
    ) THEN
        ALTER TABLE "MembershipInvitation" ADD CONSTRAINT "MembershipInvitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MembershipInvitation_acceptedById_fkey'
    ) THEN
        ALTER TABLE "MembershipInvitation" ADD CONSTRAINT "MembershipInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
