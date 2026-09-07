-- Super Admin foundation: a platform-level flag on User (independent of the
-- org-scoped Role/OrganizationMember system), and a status field on
-- Organization for suspend/activate. Both default to the current, working
-- behavior (isSuperAdmin=false, status=ACTIVE) so this is a pure additive
-- change — no existing user or organization's behavior changes until a
-- Super Admin explicitly acts.

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "organizations" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "suspendedReason" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");
