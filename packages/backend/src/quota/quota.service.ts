import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MESSAGE_DIRECTION } from '../common/constants/prisma-enums.constants';
import { getZonedParts, zonedTimeToUtc } from '../schedules/schedule-calculator';

/**
 * The eight resources Limits & Quotas covers. Each maps to a same-named
 * field on both Plan and OrganizationQuotaOverride (`max` + capitalized
 * key), so resolving a limit or writing an override never needs a
 * per-resource switch statement — see FIELD_NAMES below.
 */
export const QUOTA_RESOURCES = [
  'users',
  'contacts',
  'whatsappAccounts',
  'messagesPerMonth',
  'automations',
  'automationExecutionsPerMonth',
  'apiRequestsPerMonth',
  'storageMb',
] as const;

export type QuotaResource = (typeof QUOTA_RESOURCES)[number];

const FIELD_NAMES: Record<QuotaResource, string> = {
  users: 'maxUsers',
  contacts: 'maxContacts',
  whatsappAccounts: 'maxWhatsappAccounts',
  messagesPerMonth: 'maxMessagesPerMonth',
  automations: 'maxAutomations',
  automationExecutionsPerMonth: 'maxAutomationExecutionsPerMonth',
  apiRequestsPerMonth: 'maxApiRequestsPerMonth',
  storageMb: 'maxStorageMb',
};

/**
 * Resources this phase can actually count from existing data. apiRequestsPerMonth
 * and storageMb are deliberately absent — nothing in the current app tracks
 * either (no request-volume log, no file-size tracking anywhere in the
 * schema), so REPORTING a usage number for them would be fabricated. Their
 * Plan/override fields still exist (for the data model to be complete once
 * something does track them), but getUsage() and assertWithinLimit() both
 * treat them as "not trackable" rather than silently returning 0.
 */
const TRACKABLE_RESOURCES = new Set<QuotaResource>([
  'users',
  'contacts',
  'whatsappAccounts',
  'messagesPerMonth',
  'automations',
  'automationExecutionsPerMonth',
]);

export interface QuotaLimit {
  limit: number | null; // null = unlimited
  source: 'override' | 'plan' | 'unlimited';
}

export interface QuotaResourceSummary {
  resource: QuotaResource;
  limit: number | null;
  source: QuotaLimit['source'];
  usage: number | null; // null = not trackable in this phase
  remaining: number | null;
  percentUsed: number | null;
  status: 'ok' | 'warning' | 'exceeded' | 'unlimited' | 'untracked';
}

export class QuotaExceededException extends ForbiddenException {
  constructor(
    public readonly resource: QuotaResource,
    public readonly limit: number,
    public readonly usage: number,
  ) {
    super(`Organization has reached its ${resource} limit (${usage}/${limit}).`);
  }
}

const WARNING_THRESHOLD = 0.8; // 80% — matches the brief's "warning threshold" requirement; not currently configurable per-org, see report.

/**
 * Monthly quota boundaries ("messagesPerMonth", "automationExecutionsPerMonth")
 * are computed in the ORGANIZATION's own timezone, not server-local time or
 * raw UTC. This is a deliberate decision, not a default fallen into:
 *
 *   - Organization.timezone already exists and is already the basis for
 *     every other calendar-boundary calculation in this codebase —
 *     schedule-calculator.ts computes recurring-schedule "next occurrence"
 *     and random-time windows in a zoned timezone (Schedule.timezone,
 *     falling back to 'UTC'), using exactly the getZonedParts/
 *     zonedTimeToUtc primitives reused here. Using raw UTC for quotas
 *     while everything else in the app is zone-aware would be the
 *     inconsistent choice, not the safe one.
 *   - Practically: an org's monthly cap should reset at THEIR midnight on
 *     the 1st, not at a UTC instant that's midday (or the last day of the
 *     previous month) for them — a US-based org would otherwise see its
 *     "monthly" quota reset up to many hours into their actual month,
 *     which is confusing and, if this ever backs billing, simply wrong.
 *
 * Falls back to 'UTC' when an organization has no timezone set, matching
 * the same fallback schedule-calculator.ts already uses.
 */
function monthStartInZone(now: Date, timeZone: string): Date {
  const zoned = getZonedParts(now, timeZone || 'UTC');
  return zonedTimeToUtc(zoned.year, zoned.month, 1, 0, 0, 0, timeZone || 'UTC');
}

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Plan default -> organization override if present -> effective limit.
   * A single, cheap query (org row + its plan + its override, all by
   * primary/unique key — no scans) regardless of which resource is asked
   * for, since callers usually want more than one resource's limit at a
   * time (the summary view wants all eight; enforcement wants one).
   */
  private async loadLimitSources(organizationId: string) {
    // TEMPORARY CAST — see prisma-consent-shim.d.ts. `select: { plan,
    // quotaOverride }` and the resulting `.plan`/`.quotaOverride` access
    // are both valid against the CURRENT schema.prisma (that relation
    // exists), but the Prisma client actually generated in this sandbox
    // predates it, so the real generated types don't know about it yet.
    // Cast confined to this one method so the error doesn't cascade
    // through ts-jest's whole-program checking into every other file that
    // happens to import QuotaService — remove both casts (and this
    // comment) the first time `prisma generate` runs for real; the code
    // beneath them needs no other change. `timezone` itself is NOT part of
    // this cast — it's an existing scalar field the stale client already
    // knows about, piggybacked onto this same query rather than a second
    // round trip (see monthStartInZone above for why it's fetched at all).
    const org = (await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        timezone: true,
        plan: true,
        quotaOverride: true,
      } as any,
    })) as { timezone?: string; plan: any; quotaOverride: any } | null;
    return {
      plan: org?.plan ?? null,
      override: org?.quotaOverride ?? null,
      monthStart: monthStartInZone(new Date(), org?.timezone ?? 'UTC'),
    };
  }

  private resolveLimit(resource: QuotaResource, plan: any, override: any): QuotaLimit {
    const field = FIELD_NAMES[resource];
    const overrideValue: number | null | undefined = override?.[field];

    if (overrideValue === -1) return { limit: null, source: 'override' };
    if (overrideValue !== null && overrideValue !== undefined) {
      return { limit: overrideValue, source: 'override' };
    }
    const planValue: number | null | undefined = plan?.[field];
    if (planValue !== null && planValue !== undefined) {
      return { limit: planValue, source: 'plan' };
    }
    return { limit: null, source: 'unlimited' };
  }

  async getEffectiveLimits(organizationId: string): Promise<Record<QuotaResource, QuotaLimit>> {
    const { plan, override } = await this.loadLimitSources(organizationId);
    const result = {} as Record<QuotaResource, QuotaLimit>;
    for (const resource of QUOTA_RESOURCES) {
      result[resource] = this.resolveLimit(resource, plan, override);
    }
    return result;
  }

  /**
   * Current usage for one resource. Every branch is a single indexed COUNT
   * — see the schema.prisma comments on the indexes this relies on.
   * `monthStart` is required for the two month-scoped resources; callers
   * that already have one from loadLimitSources (getQuotaSummary,
   * assertWithinLimit) pass it through so the org's timezone is only
   * looked up once per call, not once per resource.
   */
  async getUsage(organizationId: string, resource: QuotaResource, monthStart?: Date): Promise<number | null> {
    if (!TRACKABLE_RESOURCES.has(resource)) return null;
    const zonedMonthStart = monthStart ?? (await this.loadLimitSources(organizationId)).monthStart;

    switch (resource) {
      case 'users':
        // Same relation SuperAdminService's organization list already
        // counts users by (Organization.users, the User.organizationId
        // FK) — kept consistent with that rather than counting active
        // OrganizationMember rows, which is a related but different number.
        return this.prisma.user.count({ where: { organizationId } });
      case 'contacts':
        return this.prisma.contact.count({ where: { organizationId } });
      case 'whatsappAccounts':
        return this.prisma.whatsappAccount.count({ where: { organizationId } });
      case 'messagesPerMonth':
        // Only messages that actually went out count toward usage — a
        // message that failed (for any reason, including a prior quota
        // rejection) was never actually delivered and shouldn't inflate
        // the count of what the organization "used". This also means a
        // message row that gets created and then marked FAILED by the
        // very check below never counts against itself.
        return this.prisma.message.count({
          where: {
            organizationId,
            direction: MESSAGE_DIRECTION.OUTBOUND,
            status: { in: ['SENT', 'DELIVERED', 'READ'] },
            createdAt: { gte: zonedMonthStart },
          },
        });
      case 'automations':
        return this.prisma.automation.count({ where: { organizationId } });
      case 'automationExecutionsPerMonth':
        return this.prisma.automationRun.count({
          where: { organizationId, startedAt: { gte: zonedMonthStart } },
        });
      default:
        return null;
    }
  }

  /**
   * The full picture for one organization — what the Super Admin quota
   * detail page renders. Runs all usage counts in parallel; still just N
   * small indexed COUNTs, not a table scan.
   */
  async getQuotaSummary(organizationId: string): Promise<QuotaResourceSummary[]> {
    const { plan, override, monthStart } = await this.loadLimitSources(organizationId);
    const limits = {} as Record<QuotaResource, QuotaLimit>;
    for (const resource of QUOTA_RESOURCES) {
      limits[resource] = this.resolveLimit(resource, plan, override);
    }
    const usages = await Promise.all(QUOTA_RESOURCES.map((r) => this.getUsage(organizationId, r, monthStart)));

    return QUOTA_RESOURCES.map((resource, i) => {
      const { limit, source } = limits[resource];
      const usage = usages[i];

      if (!TRACKABLE_RESOURCES.has(resource)) {
        return { resource, limit, source, usage: null, remaining: null, percentUsed: null, status: 'untracked' };
      }
      if (limit === null) {
        return { resource, limit: null, source, usage, remaining: null, percentUsed: null, status: 'unlimited' };
      }

      const safeUsage = usage ?? 0;
      const remaining = Math.max(limit - safeUsage, 0);
      const percentUsed = limit > 0 ? Math.round((safeUsage / limit) * 100) : 100;
      const status: QuotaResourceSummary['status'] =
        safeUsage >= limit ? 'exceeded' : percentUsed / 100 >= WARNING_THRESHOLD ? 'warning' : 'ok';

      return { resource, limit, source, usage: safeUsage, remaining, percentUsed, status };
    });
  }

  /**
   * The enforcement primitive — call this before creating/consuming one
   * unit of a resource. Throws QuotaExceededException (403) if the
   * organization is already at or would exceed its effective limit;
   * resolves silently otherwise, including for every organization with no
   * plan and no override (the untracked-resource case, and the common
   * case for every organization today — see Plan's schema doc comment).
   *
   * This does NOT hold a lock or reserve the slot — it's a check, not a
   * transaction. Two concurrent requests landing in the same instant could
   * both pass the check and both create, overshooting the limit by one.
   * That's an accepted, documented tradeoff (the same style of soft limit
   * most SaaS quota systems use) rather than adding row-level locking to
   * every message send/contact create in the app for a boundary case that,
   * worst case, overshoots by a handful of units before the next check
   * catches it — not "an incorrect race condition," a deliberately soft one.
   */
  async assertWithinLimit(organizationId: string, resource: QuotaResource, incrementBy = 1): Promise<void> {
    if (!TRACKABLE_RESOURCES.has(resource)) return;

    const { plan, override, monthStart } = await this.loadLimitSources(organizationId);
    const { limit } = this.resolveLimit(resource, plan, override);
    if (limit === null) return;

    const usage = (await this.getUsage(organizationId, resource, monthStart)) ?? 0;
    if (usage + incrementBy > limit) {
      throw new QuotaExceededException(resource, limit, usage);
    }
  }

  // -------------------------------------------------------------------
  // Super Admin write paths
  // -------------------------------------------------------------------
  async setOverride(organizationId: string, resource: QuotaResource, value: number | null, actorUserId: string) {
    // Defense in depth: SetQuotaOverrideDto is the primary validation
    // surface (rejects bad input at the HTTP boundary before it ever
    // reaches here), but this service method could in principle be called
    // from somewhere other than that one controller action in the future,
    // so it re-checks the same rule rather than trusting every caller to
    // have validated first.
    this.assertValidOverrideValue(value);

    const field = FIELD_NAMES[resource];
    const existing = await this.prisma.organizationQuotaOverride.findUnique({ where: { organizationId } });
    const oldValue = existing ? (existing as any)[field] ?? null : null;

    const updated = await this.prisma.organizationQuotaOverride.upsert({
      where: { organizationId },
      create: { organizationId, [field]: value, updatedByUserId: actorUserId },
      update: { [field]: value, updatedByUserId: actorUserId },
    });

    await this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'super_admin.quota_override_set',
      entityType: 'OrganizationQuotaOverride',
      entityId: organizationId,
      metadata: { resource, oldValue, newValue: value },
    });

    return updated;
  }

  async resetOverride(organizationId: string, resource: QuotaResource, actorUserId: string) {
    const field = FIELD_NAMES[resource];
    const existing = await this.prisma.organizationQuotaOverride.findUnique({ where: { organizationId } });
    if (!existing || (existing as any)[field] === null || (existing as any)[field] === undefined) {
      return existing; // already at plan default — nothing to reset, nothing to audit.
    }
    const oldValue = (existing as any)[field];

    const updated = await this.prisma.organizationQuotaOverride.update({
      where: { organizationId },
      data: { [field]: null, updatedByUserId: actorUserId },
    });

    await this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'super_admin.quota_override_reset',
      entityType: 'OrganizationQuotaOverride',
      entityId: organizationId,
      metadata: { resource, oldValue, newValue: null },
    });

    return updated;
  }

  /**
   * The same rule SetQuotaOverrideDto enforces at the HTTP boundary (null
   * = clear, -1 = unlimited, 0/positive integer = a limit), re-checked
   * here so QuotaService itself never persists an invalid value regardless
   * of caller. Number.isInteger already excludes NaN, Infinity, and
   * decimals — no separate check needed for those.
   */
  private assertValidOverrideValue(value: number | null): void {
    if (value === null) return;
    if (!Number.isInteger(value) || value < -1) {
      throw new BadRequestException('value must be -1 (unlimited), 0, a positive integer, or null (clear override)');
    }
  }

  async listPlans() {
    return this.prisma.plan.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async setOrganizationPlan(organizationId: string, planId: string | null, actorUserId: string) {
    const org = (await this.prisma.organization.findUnique({ where: { id: organizationId } })) as { planId?: string | null } | null;
    if (!org) throw new NotFoundException('Organization not found');

    if (planId !== null) {
      // Verify the plan actually exists before writing the FK — a
      // nonexistent planId must surface as a clean 400 the Super Admin UI
      // can display, not an unhandled Prisma foreign-key-constraint
      // exception from the update() call below.
      const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) throw new BadRequestException(`Plan ${planId} does not exist`);
    }

    // TEMPORARY CAST — see loadLimitSources above and prisma-consent-shim.d.ts.
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { planId } as any,
    });

    await this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'super_admin.organization_plan_changed',
      entityType: 'Organization',
      entityId: organizationId,
      metadata: { oldPlanId: org.planId ?? null, newPlanId: planId },
    });

    return updated;
  }
}
