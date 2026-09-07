-- Limits & Quotas foundation. Purely additive: two new tables, one new
-- nullable FK column on organizations, and three new indexes to support
-- efficient usage counting. No existing column is altered or dropped, and
-- Organization.planId is left NULL for every existing (and, for now, every
-- newly created) organization — see Plan's doc comment in schema.prisma
-- for why that's the deliberately safe choice for this rollout: no
-- organization's behavior changes as a result of this migration.

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxUsers" INTEGER,
    "maxContacts" INTEGER,
    "maxWhatsappAccounts" INTEGER,
    "maxMessagesPerMonth" INTEGER,
    "maxAutomations" INTEGER,
    "maxAutomationExecutionsPerMonth" INTEGER,
    "maxApiRequestsPerMonth" INTEGER,
    "maxStorageMb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_quota_overrides" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "maxUsers" INTEGER,
    "maxContacts" INTEGER,
    "maxWhatsappAccounts" INTEGER,
    "maxMessagesPerMonth" INTEGER,
    "maxAutomations" INTEGER,
    "maxAutomationExecutionsPerMonth" INTEGER,
    "maxApiRequestsPerMonth" INTEGER,
    "maxStorageMb" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "organization_quota_overrides_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "planId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "organization_quota_overrides_organizationId_key" ON "organization_quota_overrides"("organizationId");

-- CreateIndex (monthly message usage lookups)
CREATE INDEX "messages_organizationId_direction_createdAt_idx" ON "messages"("organizationId", "direction", "createdAt");

-- CreateIndex (monthly automation-execution usage lookups)
CREATE INDEX "automation_runs_organizationId_startedAt_idx" ON "automation_runs"("organizationId", "startedAt");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_quota_overrides" ADD CONSTRAINT "organization_quota_overrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the five named tiers so the (later, separate) Plans management phase
-- has real rows to work with. Numbers are reasonable placeholder defaults
-- for a WhatsApp automation SaaS, not finalized pricing — a Super Admin
-- can edit them once the Plans UI ships. NULL = unlimited for that
-- resource (CUSTOM is deliberately all-NULL: it exists purely as an
-- assignment target for a fully bespoke, override-driven organization).
INSERT INTO "plans" ("id", "key", "name", "maxUsers", "maxContacts", "maxWhatsappAccounts", "maxMessagesPerMonth", "maxAutomations", "maxAutomationExecutionsPerMonth", "maxApiRequestsPerMonth", "maxStorageMb", "createdAt", "updatedAt") VALUES
  ('plan_free',     'FREE',     'Free',     2,   250,   1, 250,    2,   500,    1000,   250,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_starter',  'STARTER',  'Starter',  5,   2500,  1, 2500,   5,   5000,   10000,  1000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_pro',      'PRO',      'Pro',      20,  10000, 1, 100000, 25,  50000,  100000, 5000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_business', 'BUSINESS', 'Business', 100, 50000, 1, 500000, 100, 250000, 500000, 20000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_custom',   'CUSTOM',   'Custom',   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
