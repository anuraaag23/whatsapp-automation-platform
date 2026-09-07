import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MESSAGE_DISPATCH_QUEUE } from '../queue/queue.module';
import {
  MESSAGE_DIRECTION,
  AUTOMATION_STATUS,
  AUTOMATION_RUN_STATUS,
  ORGANIZATION_STATUS,
} from '../common/constants/prisma-enums.constants';

function since(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(MESSAGE_DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
  ) {}

  // -------------------------------------------------------------------
  // Overview — every number here comes from a COUNT/groupBy/aggregate,
  // never a findMany of full rows, so this stays cheap regardless of how
  // large the platform grows. See section 21 (Performance) in the brief.
  // -------------------------------------------------------------------
  async getOverview() {
    const windows = { day: since(24), week: since(24 * 7), month: since(24 * 30) };

    const [
      orgsByStatus,
      totalUsers,
      activeUsers,
      verifiedUsers,
      totalWaAccounts,
      connectedWaAccounts,
      totalAutomations,
      activeAutomations,
      automationRunsByStatus,
      messagesDay,
      messagesWeek,
      messagesMonth,
      dbHealth,
      redisHealth,
      queueCounts,
    ] = await Promise.all([
      this.prisma.organization.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { emailVerified: true } }),
      this.prisma.whatsappAccount.count(),
      // WhatsappAccount.status is a plain String field, not a Prisma enum — no constant to reuse here.
      this.prisma.whatsappAccount.count({ where: { status: 'connected' } }),
      this.prisma.automation.count(),
      this.prisma.automation.count({ where: { status: AUTOMATION_STATUS.ACTIVE } }),
      this.prisma.automationRun.groupBy({ by: ['status'], _count: true }),
      this.countMessagesByDirection(windows.day),
      this.countMessagesByDirection(windows.week),
      this.countMessagesByDirection(windows.month),
      this.checkDb(),
      this.checkRedis(),
      this.dispatchQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    ]);

    const orgCount = (status: string) => orgsByStatus.find((r) => r.status === status)?._count ?? 0;
    const runCount = (status: string) => automationRunsByStatus.find((r) => r.status === status)?._count ?? 0;

    return {
      organizations: {
        total: orgsByStatus.reduce((sum, r) => sum + r._count, 0),
        active: orgCount(ORGANIZATION_STATUS.ACTIVE),
        suspended: orgCount(ORGANIZATION_STATUS.SUSPENDED),
      },
      users: { total: totalUsers, active: activeUsers, verified: verifiedUsers },
      whatsappAccounts: { total: totalWaAccounts, connected: connectedWaAccounts },
      automations: {
        total: totalAutomations,
        active: activeAutomations,
        runs: {
          running: runCount(AUTOMATION_RUN_STATUS.RUNNING) + runCount(AUTOMATION_RUN_STATUS.WAITING_FOR_REPLY),
          completed: runCount(AUTOMATION_RUN_STATUS.COMPLETED),
          failed: runCount(AUTOMATION_RUN_STATUS.FAILED),
        },
      },
      messages: { last24h: messagesDay, last7d: messagesWeek, last30d: messagesMonth },
      queue: {
        waiting: queueCounts.waiting ?? 0,
        active: queueCounts.active ?? 0,
        delayed: queueCounts.delayed ?? 0,
        failed: queueCounts.failed ?? 0,
      },
      health: { database: dbHealth, redis: redisHealth },
    };
  }

  private async countMessagesByDirection(sinceDate: Date) {
    const [sent, received] = await Promise.all([
      this.prisma.message.count({ where: { direction: MESSAGE_DIRECTION.OUTBOUND, createdAt: { gte: sinceDate } } }),
      this.prisma.message.count({ where: { direction: MESSAGE_DIRECTION.INBOUND, createdAt: { gte: sinceDate } } }),
    ]);
    return { sent, received };
  }

  // -------------------------------------------------------------------
  // Health — reuses the exact same checks as HealthController's /health/
  // ready (raw SELECT 1, queue client access), just also timed and
  // surfaced with a per-check status rather than an all-or-nothing 200/503.
  // Deliberately doesn't touch/import HealthController itself, so nothing
  // about the existing load-balancer health check path is at risk here.
  // -------------------------------------------------------------------
  private async checkDb(): Promise<{ status: 'healthy' | 'down'; latencyMs: number | null }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }

  private async checkRedis(): Promise<{ status: 'healthy' | 'down'; latencyMs: number | null }> {
    const start = Date.now();
    try {
      await this.dispatchQueue.client;
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }

  async getHealth() {
    const [dbHealth, redisHealth, queueCounts, lastInbound] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.dispatchQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      this.prisma.message.findFirst({
        where: { direction: MESSAGE_DIRECTION.INBOUND },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      backend: { status: 'healthy' as const },
      database: dbHealth,
      redis: redisHealth,
      queue: {
        status: (queueCounts.failed ?? 0) > 100 ? ('degraded' as const) : ('healthy' as const),
        waiting: queueCounts.waiting ?? 0,
        active: queueCounts.active ?? 0,
        delayed: queueCounts.delayed ?? 0,
        failed: queueCounts.failed ?? 0,
      },
      whatsappWebhooks: {
        lastInboundMessageAt: lastInbound?.createdAt ?? null,
      },
    };
  }

  // -------------------------------------------------------------------
  // Organizations
  // -------------------------------------------------------------------
  async listOrganizations(params: { search?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 100);

    const where: Record<string, unknown> = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.status) where.status = params.status;

    const [organizations, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          suspendedAt: true,
          _count: { select: { users: true, contacts: true, automations: true } },
          whatsappAccount: { select: { status: true } },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      organizations,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async getOrganization(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, contacts: true, automations: true, campaigns: true } },
        whatsappAccount: {
          select: { status: true, displayPhoneNumber: true, businessAccountId: true, createdAt: true },
        },
        members: {
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const [messageCount, recentAudit] = await Promise.all([
      this.prisma.message.count({ where: { organizationId: id } }),
      this.audit.listGlobal({ organizationId: id, pageSize: 20 }),
    ]);

    return { ...org, messageCount, recentAudit: recentAudit.entries };
  }

  /** Every mutation below re-validates the id server-side (findUnique / a WHERE clause) rather than trusting that a client-supplied id refers to a real row — see section 20 (Security). */
  async suspendOrganization(id: string, actorUserId: string, reason?: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.status === ORGANIZATION_STATUS.SUSPENDED) throw new BadRequestException('Organization is already suspended');

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { status: ORGANIZATION_STATUS.SUSPENDED, suspendedAt: new Date(), suspendedReason: reason ?? null },
    });

    await this.audit.record({
      organizationId: id,
      userId: actorUserId,
      action: 'super_admin.organization_suspended',
      entityType: 'Organization',
      entityId: id,
      metadata: { reason },
    });

    return updated;
  }

  async activateOrganization(id: string, actorUserId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.status === ORGANIZATION_STATUS.ACTIVE) throw new BadRequestException('Organization is already active');

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { status: ORGANIZATION_STATUS.ACTIVE, suspendedAt: null, suspendedReason: null },
    });

    await this.audit.record({
      organizationId: id,
      userId: actorUserId,
      action: 'super_admin.organization_activated',
      entityType: 'Organization',
      entityId: id,
    });

    return updated;
  }

  // -------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------
  async listUsers(params: {
    search?: string;
    organizationId?: string;
    isActive?: boolean;
    emailVerified?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 100);

    const where: Record<string, unknown> = {};
    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.emailVerified !== undefined) where.emailVerified = params.emailVerified;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          emailVerified: true,
          isSuperAdmin: true,
          createdAt: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
  }

  async setUserActive(id: string, actorUserId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({ where: { id }, data: { isActive } });

    await this.audit.record({
      organizationId: user.organizationId,
      userId: actorUserId,
      action: isActive ? 'super_admin.user_activated' : 'super_admin.user_deactivated',
      entityType: 'User',
      entityId: id,
    });

    return updated;
  }

  // -------------------------------------------------------------------
  // Audit — thin pass-through, kept here only so the frontend has one
  // consistent /super-admin/* base path; AuditService.listGlobal does the
  // actual work (see audit.service.ts).
  // -------------------------------------------------------------------
  async listAudit(filters: Parameters<AuditService['listGlobal']>[0]) {
    return this.audit.listGlobal(filters);
  }
}
