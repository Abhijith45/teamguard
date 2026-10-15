-- CreateTable: Comment table
CREATE TABLE IF NOT EXISTS "Comment" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Organization index
CREATE INDEX IF NOT EXISTS "Comment_organizationId_idx" ON "Comment"("organizationId");

-- CreateIndex: Task and createdAt composite index for chronological feed
CREATE INDEX IF NOT EXISTS "Comment_taskId_createdAt_idx" ON "Comment"("taskId", "createdAt");

-- CreateIndex: Author index
CREATE INDEX IF NOT EXISTS "Comment_authorId_idx" ON "Comment"("authorId");

-- AddForeignKey: Organization foreign key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Comment_organizationId_fkey'
    ) THEN
        ALTER TABLE "Comment" ADD CONSTRAINT "Comment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: Task foreign key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Comment_taskId_fkey'
    ) THEN
        ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: User (author) foreign key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Comment_authorId_fkey'
    ) THEN
        ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
