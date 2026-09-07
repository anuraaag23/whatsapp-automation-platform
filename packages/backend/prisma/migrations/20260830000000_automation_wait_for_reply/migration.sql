-- AlterEnum: a run can now be durably parked waiting for an inbound reply,
-- distinct from RUNNING (actively executing this tick) and COMPLETED/FAILED
-- (terminal). Postgres requires ADD VALUE to run outside a transaction with
-- other DDL in some versions, but since nothing else in this migration reads
-- the new enum value, a single statement is safe here.
ALTER TYPE "AutomationRunStatus" ADD VALUE 'WAITING_FOR_REPLY';

-- AlterTable: persisted wait-for-reply state. See schema.prisma's
-- AutomationRun model comments for what each column is for.
ALTER TABLE "automation_runs" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "automation_runs" ADD COLUMN "waitingNodeId" TEXT;
ALTER TABLE "automation_runs" ADD COLUMN "waitingSince" TIMESTAMP(3);
ALTER TABLE "automation_runs" ADD COLUMN "waitExpiresAt" TIMESTAMP(3);
ALTER TABLE "automation_runs" ADD COLUMN "waitTimeoutJobId" TEXT;
ALTER TABLE "automation_runs" ADD COLUMN "resumedByMessageId" TEXT;
ALTER TABLE "automation_runs" ADD COLUMN "contextVariables" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex: the lookup InboundMessageService's event handler does on
-- every inbound message — "is anything waiting on this conversation, in
-- this org, right now" — needs to be fast and org-scoped.
CREATE INDEX "automation_runs_organizationId_conversationId_status_idx" ON "automation_runs"("organizationId", "conversationId", "status");
