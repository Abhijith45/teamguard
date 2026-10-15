-- AlterTable: Add completedAt timestamp to Task table
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- CreateIndex: Organization and status composite index
CREATE INDEX IF NOT EXISTS "Task_organizationId_status_idx" ON "Task"("organizationId", "status");

-- CreateIndex: Organization and priority composite index
CREATE INDEX IF NOT EXISTS "Task_organizationId_priority_idx" ON "Task"("organizationId", "priority");

-- CreateIndex: Organization and dueDate composite index
CREATE INDEX IF NOT EXISTS "Task_organizationId_dueDate_idx" ON "Task"("organizationId", "dueDate");
