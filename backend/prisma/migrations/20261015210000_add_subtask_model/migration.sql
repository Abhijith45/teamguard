-- CreateTable: Subtask table
CREATE TABLE IF NOT EXISTS "Subtask" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Organization index
CREATE INDEX IF NOT EXISTS "Subtask_organizationId_idx" ON "Subtask"("organizationId");

-- CreateIndex: Task and order composite index
CREATE INDEX IF NOT EXISTS "Subtask_taskId_order_idx" ON "Subtask"("taskId", "order");

-- AddForeignKey: Organization foreign key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Subtask_organizationId_fkey'
    ) THEN
        ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: Task foreign key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Subtask_taskId_fkey'
    ) THEN
        ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
