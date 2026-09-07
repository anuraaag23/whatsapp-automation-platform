-- Consent history: append-only record of every opt-in/opt-out transition,
-- independent of the current-state snapshot on contacts.optInStatus.

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('OPT_IN', 'OPT_OUT');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('MANUAL', 'INBOUND_KEYWORD', 'IMPORT', 'API');

-- CreateTable
CREATE TABLE "contact_consent_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "reason" TEXT,
    "actorUserId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_consent_events_organizationId_contactId_createdAt_idx" ON "contact_consent_events"("organizationId", "contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "contact_consent_events" ADD CONSTRAINT "contact_consent_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_consent_events" ADD CONSTRAINT "contact_consent_events_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
