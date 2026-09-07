import { Controller, Get, Patch, Post, Param, Query, Body, BadRequestException } from '@nestjs/common';
import { SuperAdminOnly } from '../common/decorators/super-admin.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { QuotaService, QUOTA_RESOURCES, QuotaResource } from '../quota/quota.service';
import { PrismaService } from '../prisma/prisma.service';
import { SetQuotaOverrideDto, SetOrganizationPlanDto } from './dto/quota.dto';

function isQuotaResource(value: string): value is QuotaResource {
  return (QUOTA_RESOURCES as readonly string[]).includes(value);
}

/**
 * Every route here requires SUPER_ADMIN — same enforcement as
 * super-admin.controller.ts (@SuperAdminOnly() + the globally-registered
 * SuperAdminGuard). Kept as its own controller under the same
 * /super-admin prefix rather than folded into SuperAdminController, purely
 * to keep that file from growing indefinitely as more sections
 * (Plans, Alerts, ...) land in later phases.
 */
@Controller('super-admin/quotas')
@SuperAdminOnly()
export class SuperAdminQuotaController {
  constructor(
    private readonly quota: QuotaService,
    private readonly prisma: PrismaService,
  ) {}

  /** Plan + usage summary for every organization, for the Limits & Quotas list page — paginated, not a full-table load. */
  @Get()
  async listOrganizationQuotas(@Query('search') search?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const pageNum = Math.max(Number(page) || 1, 1);
    const pageSizeNum = Math.min(Math.max(Number(pageSize) || 25, 1), 100);

    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { slug: { contains: search, mode: 'insensitive' as const } }] }
      : {};

    const [organizations, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
        // TEMPORARY CAST — see prisma-consent-shim.d.ts / quota.service.ts's
        // loadLimitSources for the full explanation. `plan` is a valid
        // selectable relation against the current schema.prisma; the
        // generated client in this sandbox just predates it.
        select: { id: true, name: true, slug: true, plan: { select: { id: true, key: true, name: true } } } as any,
      }),
      this.prisma.organization.count({ where }),
    ]) as unknown as [Array<{ id: string; name: string; slug: string; plan: { id: string; key: string; name: string } | null }>, number];

    // One quota summary per organization on this page only — never every
    // organization on the platform at once, per the brief's performance
    // requirement.
    const withUsage = await Promise.all(
      organizations.map(async (org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        // A compact signal for the list view (worst status across all
        // trackable resources) — the detail endpoint below has the full
        // per-resource breakdown.
        worstStatus: await this.worstStatus(org.id),
      })),
    );

    return { organizations: withUsage, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.max(Math.ceil(total / pageSizeNum), 1) };
  }

  private async worstStatus(organizationId: string) {
    const summary = await this.quota.getQuotaSummary(organizationId);
    if (summary.some((r) => r.status === 'exceeded')) return 'exceeded';
    if (summary.some((r) => r.status === 'warning')) return 'warning';
    return 'ok';
  }

  @Get(':organizationId')
  async getOrganizationQuota(@Param('organizationId') organizationId: string) {
    const [summary, plans] = await Promise.all([this.quota.getQuotaSummary(organizationId), this.quota.listPlans()]);
    // TEMPORARY CAST — same reason as above.
    const org = (await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, planId: true, plan: true } as any,
    })) as { id: string; name: string; slug: string; planId: string | null; plan: any } | null;
    return { organization: org, summary, availablePlans: plans };
  }

  @Patch(':organizationId/plan')
  setPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: SetOrganizationPlanDto,
  ) {
    return this.quota.setOrganizationPlan(organizationId, dto.planId, user.userId);
  }

  @Patch(':organizationId/override')
  setOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: SetQuotaOverrideDto,
  ) {
    return this.quota.setOverride(organizationId, dto.resource, dto.value, user.userId);
  }

  @Post(':organizationId/override/:resource/reset')
  resetOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('resource') resource: string,
  ) {
    if (!isQuotaResource(resource)) {
      throw new BadRequestException(`Unknown quota resource: ${resource}`);
    }
    return this.quota.resetOverride(organizationId, resource, user.userId);
  }
}
