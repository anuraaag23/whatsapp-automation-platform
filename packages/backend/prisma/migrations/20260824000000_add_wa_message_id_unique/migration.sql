-- Add unique constraint on (organizationId, waMessageId) for inbound message idempotency
-- This ensures a retried webhook event or Meta redelivery cannot create duplicate Message rows
CREATE UNIQUE INDEX IF NOT EXISTS "messages_organizationId_waMessageId_key" ON "messages"("organizationId", "waMessageId");