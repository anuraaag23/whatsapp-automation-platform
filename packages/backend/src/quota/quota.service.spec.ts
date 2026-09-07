import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuotaService, QuotaExceededException } from './quota.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function createPrismaMock() {
  const organizations = new Map<string, any>();
  const plans = new Map<string, any>();
  const overrides = new Map<string, any>(); // keyed by organizationId
  const messages: { organizationId: string; createdAt: Date }[] = [];
  const automationRuns: { organizationId: string; startedAt: Date }[] = [];
  const counts: Record<string, number> = {
    user: 0,
    contact: 0,
    whatsappAccount: 0,
    automation: 0,
  };

  return {
    organization: {
      findUnique: jest.fn(async ({ where, select }: any) => {
        const org = organizations.get(where.id);
        if (!org) return null;
        if (select?.plan !== undefined || select?.quotaOverride !== undefined || select?.timezone !== undefined) {
          return {
            timezone: org.timezone,
            plan: org.planId ? plans.get(org.planId) ?? null : null,
            quotaOverride: overrides.get(where.id) ?? null,
          };
        }
        return org;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const updated = { ...organizations.get(where.id), ...data };
        organizations.set(where.id, updated);
        return updated;
      }),
    },
    organizationQuotaOverride: {
      findUnique: jest.fn(async ({ where }: any) => overrides.get(where.organizationId) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const existing = overrides.get(where.organizationId);
        const next = existing ? { ...existing, ...update } : { organizationId: where.organizationId, ...create };
        overrides.set(where.organizationId, next);
        return next;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const next = { ...overrides.get(where.organizationId), ...data };
        overrides.set(where.organizationId, next);
        return next;
      }),
    },
    plan: {
      findMany: jest.fn(async () => [...plans.values()]),
      findUnique: jest.fn(async ({ where }: any) => plans.get(where.id) ?? null),
    },
    user: { count: jest.fn(async () => counts.user) },
    contact: { count: jest.fn(async () => counts.contact) },
    whatsappAccount: { count: jest.fn(async () => counts.whatsappAccount) },
    automation: { count: jest.fn(async () => counts.automation) },
    // Both respect the `createdAt`/`startedAt: { gte }` filter for real, so
    // month-boundary/timezone behavior can actually be exercised rather
    // than stubbed with a fixed number.
    message: {
      count: jest.fn(async ({ where }: any) =>
        messages.filter((m) => m.organizationId === where.organizationId && m.createdAt.getTime() >= where.createdAt.gte.getTime()).length,
      ),
    },
    automationRun: {
      count: jest.fn(async ({ where }: any) =>
        automationRuns.filter((r) => r.organizationId === where.organizationId && r.startedAt.getTime() >= where.startedAt.gte.getTime())
          .length,
      ),
    },
    __organizations: organizations,
    __plans: plans,
    __overrides: overrides,
    __counts: counts,
    __messages: messages,
    __automationRuns: automationRuns,
  };
}

describe('QuotaService', () => {
  let service: QuotaService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let auditMock: { record: jest.Mock };

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    auditMock = { record: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = moduleRef.get(QuotaService);

    prismaMock.__organizations.set('org_1', { id: 'org_1', planId: null });
    prismaMock.__plans.set('plan_pro', { id: 'plan_pro', key: 'PRO', maxContacts: 100, maxUsers: 10 });
  });

  describe('effective limit resolution', () => {
    it('is unlimited (null) for an organization with no plan and no override', async () => {
      const limits = await service.getEffectiveLimits('org_1');
      expect(limits.contacts).toEqual({ limit: null, source: 'unlimited' });
    });

    it('uses the plan default when a plan is assigned and no override exists', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });
      const limits = await service.getEffectiveLimits('org_1');
      expect(limits.contacts).toEqual({ limit: 100, source: 'plan' });
    });

    it('an organization override takes precedence over the plan default', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });
      prismaMock.__overrides.set('org_1', { maxContacts: 250 });
      const limits = await service.getEffectiveLimits('org_1');
      expect(limits.contacts).toEqual({ limit: 250, source: 'override' });
    });

    it('an override value of -1 means explicitly unlimited, even with a limiting plan', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });
      prismaMock.__overrides.set('org_1', { maxContacts: -1 });
      const limits = await service.getEffectiveLimits('org_1');
      expect(limits.contacts).toEqual({ limit: null, source: 'override' });
    });
  });

  describe('usage + summary calculation', () => {
    it('computes remaining, percentUsed, and status=ok below the warning threshold', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });
      prismaMock.__counts.contact = 50; // 50/100 = 50%

      const summary = await service.getQuotaSummary('org_1');
      const contacts = summary.find((r) => r.resource === 'contacts')!;
      expect(contacts).toMatchObject({ limit: 100, usage: 50, remaining: 50, percentUsed: 50, status: 'ok' });
    });

    it('flags status=warning at or above 80% usage', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });
      prismaMock.__counts.contact = 85;

      const summary = await service.getQuotaSummary('org_1');
      expect(summary.find((r) => r.resource === 'contacts')).toMatchObject({ status: 'warning', percentUsed: 85 });
    });

    it('flags status=exceeded once usage reaches the hard limit', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });
      prismaMock.__counts.contact = 100;

      const summary = await service.getQuotaSummary('org_1');
      expect(summary.find((r) => r.resource === 'contacts')).toMatchObject({ status: 'exceeded', remaining: 0 });
    });

    it('reports status=unlimited (not a percentage) for a resource with no effective limit', async () => {
      const summary = await service.getQuotaSummary('org_1'); // no plan assigned
      expect(summary.find((r) => r.resource === 'contacts')).toMatchObject({ status: 'unlimited', limit: null, percentUsed: null });
    });

    it('reports status=untracked for apiRequestsPerMonth and storageMb — nothing in this phase counts them', async () => {
      const summary = await service.getQuotaSummary('org_1');
      expect(summary.find((r) => r.resource === 'apiRequestsPerMonth')).toMatchObject({ status: 'untracked', usage: null });
      expect(summary.find((r) => r.resource === 'storageMb')).toMatchObject({ status: 'untracked', usage: null });
    });
  });

  describe('assertWithinLimit — the enforcement primitive', () => {
    it('resolves silently when there is no effective limit', async () => {
      await expect(service.assertWithinLimit('org_1', 'contacts')).resolves.toBeUndefined();
    });

    it('resolves silently when usage + increment is within the limit', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });
      prismaMock.__counts.contact = 99;
      await expect(service.assertWithinLimit('org_1', 'contacts')).resolves.toBeUndefined();
    });

    it('throws QuotaExceededException once usage + increment would exceed the limit', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });
      prismaMock.__counts.contact = 100;
      await expect(service.assertWithinLimit('org_1', 'contacts')).rejects.toThrow(QuotaExceededException);
    });

    it('is a no-op for untracked resources regardless of any configured limit', async () => {
      await expect(service.assertWithinLimit('org_1', 'apiRequestsPerMonth')).resolves.toBeUndefined();
    });
  });

  describe('Super Admin override writes', () => {
    it('setOverride creates an audit record with old and new values', async () => {
      await service.setOverride('org_1', 'contacts', 500, 'admin_1');

      expect(prismaMock.__overrides.get('org_1').maxContacts).toBe(500);
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org_1',
          userId: 'admin_1',
          action: 'super_admin.quota_override_set',
          metadata: { resource: 'contacts', oldValue: null, newValue: 500 },
        }),
      );
    });

    it('resetOverride clears the field back to null (deferring to the plan) and audits it', async () => {
      prismaMock.__overrides.set('org_1', { maxContacts: 500 });

      await service.resetOverride('org_1', 'contacts', 'admin_1');

      expect(prismaMock.__overrides.get('org_1').maxContacts).toBeNull();
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'super_admin.quota_override_reset', metadata: { resource: 'contacts', oldValue: 500, newValue: null } }),
      );
    });

    it('resetOverride is a no-op (no audit record) when there was nothing to reset', async () => {
      await service.resetOverride('org_1', 'contacts', 'admin_1');
      expect(auditMock.record).not.toHaveBeenCalled();
    });

    it('setOrganizationPlan changes the plan and audits old/new plan ids', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: null });

      await service.setOrganizationPlan('org_1', 'plan_pro', 'admin_1');

      expect(prismaMock.__organizations.get('org_1').planId).toBe('plan_pro');
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'super_admin.organization_plan_changed', metadata: { oldPlanId: null, newPlanId: 'plan_pro' } }),
      );
    });

    it('setOrganizationPlan rejects a nonexistent planId with a clean BadRequestException, not a raw FK error', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: null });

      await expect(service.setOrganizationPlan('org_1', 'plan_does_not_exist', 'admin_1')).rejects.toThrow(BadRequestException);
      // The organization must be left untouched — no partial write before the check failed.
      expect(prismaMock.__organizations.get('org_1').planId).toBeNull();
      expect(auditMock.record).not.toHaveBeenCalled();
    });

    it('setOrganizationPlan accepts null to remove the plan (already covered by the "unlimited by default" behavior)', async () => {
      prismaMock.__organizations.set('org_1', { id: 'org_1', planId: 'plan_pro' });

      await service.setOrganizationPlan('org_1', null, 'admin_1');

      expect(prismaMock.__organizations.get('org_1').planId).toBeNull();
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { oldPlanId: 'plan_pro', newPlanId: null } }),
      );
    });

    it('setOrganizationPlan throws NotFoundException for a nonexistent organization', async () => {
      await expect(service.setOrganizationPlan('no_such_org', 'plan_pro', 'admin_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setOverride value validation (defense in depth — SetQuotaOverrideDto is the primary check)', () => {
    it.each([-2, -100])('rejects a negative value other than -1 (%d) with BadRequestException', async (value) => {
      await expect(service.setOverride('org_1', 'contacts', value, 'admin_1')).rejects.toThrow(BadRequestException);
      expect(prismaMock.__overrides.get('org_1')).toBeUndefined();
    });

    it.each([1.5, -0.5])('rejects a decimal value (%d)', async (value) => {
      await expect(service.setOverride('org_1', 'contacts', value, 'admin_1')).rejects.toThrow(BadRequestException);
    });

    it('rejects NaN', async () => {
      await expect(service.setOverride('org_1', 'contacts', NaN, 'admin_1')).rejects.toThrow(BadRequestException);
    });

    it('rejects Infinity and -Infinity', async () => {
      await expect(service.setOverride('org_1', 'contacts', Infinity, 'admin_1')).rejects.toThrow(BadRequestException);
      await expect(service.setOverride('org_1', 'contacts', -Infinity, 'admin_1')).rejects.toThrow(BadRequestException);
    });

    it('accepts -1 (explicitly unlimited) and persists it', async () => {
      await service.setOverride('org_1', 'contacts', -1, 'admin_1');
      expect(prismaMock.__overrides.get('org_1').maxContacts).toBe(-1);
    });

    it('accepts 0 as a valid hard limit (not treated as "no override")', async () => {
      await service.setOverride('org_1', 'contacts', 0, 'admin_1');
      const limits = await service.getEffectiveLimits('org_1');
      expect(limits.contacts).toEqual({ limit: 0, source: 'override' });
    });

    it('a 0 limit means immediate exhaustion — assertWithinLimit rejects even the first unit', async () => {
      await service.setOverride('org_1', 'contacts', 0, 'admin_1');
      await expect(service.assertWithinLimit('org_1', 'contacts')).rejects.toThrow(QuotaExceededException);
    });

    it('accepts any non-negative integer as a valid hard limit', async () => {
      await service.setOverride('org_1', 'contacts', 250, 'admin_1');
      expect(prismaMock.__overrides.get('org_1').maxContacts).toBe(250);
    });

    it('accepts null directly via setOverride (equivalent to resetOverride) and clears the field', async () => {
      await service.setOverride('org_1', 'contacts', 500, 'admin_1');
      await service.setOverride('org_1', 'contacts', null, 'admin_1');
      expect(prismaMock.__overrides.get('org_1').maxContacts).toBeNull();
    });
  });

  describe('monthly quota boundaries — organization timezone, not UTC', () => {
    it('a message just after UTC midnight on the 1st still counts toward the PREVIOUS month for an organization west of UTC', async () => {
      // 2026-03-01T04:00:00Z is already March 1st in UTC, but it's still
      // 2026-02-28 20:00 in America/Los_Angeles (UTC-8, no DST in early
      // March) — so for an LA-based org, this message was sent in
      // February, not March, and must NOT count toward March's usage.
      prismaMock.__organizations.set('org_la', { id: 'org_la', planId: 'plan_pro', timezone: 'America/Los_Angeles' });
      prismaMock.__messages.push({ organizationId: 'org_la', createdAt: new Date('2026-03-01T04:00:00Z') });

      jest.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00Z'));
      try {
        const usage = await service.getUsage('org_la', 'messagesPerMonth');
        expect(usage).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('the same message DOES count for a UTC-timezone organization, since UTC midnight is the month boundary there', async () => {
      prismaMock.__organizations.set('org_utc', { id: 'org_utc', planId: 'plan_pro', timezone: 'UTC' });
      prismaMock.__messages.push({ organizationId: 'org_utc', createdAt: new Date('2026-03-01T04:00:00Z') });

      jest.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00Z'));
      try {
        const usage = await service.getUsage('org_utc', 'messagesPerMonth');
        expect(usage).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('a message from the same calendar day but before local midnight in an org EAST of UTC counts toward the earlier month', async () => {
      // 2026-03-01T20:00:00Z is 2026-03-02 05:00 in Asia/Tokyo (UTC+9, no
      // DST) — safely within March for a Tokyo-based org, so it DOES count
      // toward March usage there.
      prismaMock.__organizations.set('org_tokyo', { id: 'org_tokyo', planId: 'plan_pro', timezone: 'Asia/Tokyo' });
      prismaMock.__messages.push({ organizationId: 'org_tokyo', createdAt: new Date('2026-03-01T20:00:00Z') });

      jest.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00Z'));
      try {
        const usage = await service.getUsage('org_tokyo', 'messagesPerMonth');
        expect(usage).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('falls back to UTC when an organization has no timezone set', async () => {
      prismaMock.__organizations.set('org_no_tz', { id: 'org_no_tz', planId: 'plan_pro', timezone: undefined });
      prismaMock.__messages.push({ organizationId: 'org_no_tz', createdAt: new Date('2026-03-01T00:00:01Z') });

      jest.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00Z'));
      try {
        const usage = await service.getUsage('org_no_tz', 'messagesPerMonth');
        expect(usage).toBe(1); // counts, since UTC midnight IS the boundary when there's no zone to differ from it
      } finally {
        jest.useRealTimers();
      }
    });

    it('automationExecutionsPerMonth uses the same organization-timezone month boundary as messagesPerMonth', async () => {
      prismaMock.__organizations.set('org_la', { id: 'org_la', planId: 'plan_pro', timezone: 'America/Los_Angeles' });
      prismaMock.__automationRuns.push({ organizationId: 'org_la', startedAt: new Date('2026-03-01T04:00:00Z') });

      jest.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00Z'));
      try {
        const usage = await service.getUsage('org_la', 'automationExecutionsPerMonth');
        expect(usage).toBe(0); // still February in LA
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
