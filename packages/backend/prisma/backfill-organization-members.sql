-- Run once after migrating in an environment that had users/organizations
-- created before OrganizationMember existed (i.e. anyone who ran Phase 1-4
-- of this app before this change). Safe to re-run — ON CONFLICT DO NOTHING.
--
-- Usage:
--   docker compose exec postgres psql -U waplatform -d waplatform \
--     -f /path/to/backfill-organization-members.sql
-- or paste into any Postgres client connected to the app database.

INSERT INTO organization_members (id, "userId", "organizationId", role, "isActive", "joinedAt")
SELECT
  'member_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20),
  u.id,
  u."organizationId",
  u.role,
  u."isActive",
  u."createdAt"
FROM users u
ON CONFLICT ("userId", "organizationId") DO NOTHING;
