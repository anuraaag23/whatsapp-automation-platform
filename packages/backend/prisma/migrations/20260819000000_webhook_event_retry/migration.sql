-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
