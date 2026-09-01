import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface RecordAuditEntryInput {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  status?: 'success' | 'failure';
  metadata?: Record<string, unknown>;
  device?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes a single audit entry. Deliberately swallows its own errors —
   * audit logging must never break the mutation it's recording. Callers
   * fire-and-forget this (no await required, but awaiting is safe too).
   */
  async record(input: RecordAuditEntryInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId ?? undefined,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? undefined,
          status: input.status ?? 'success',
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          device: input.device ?? undefined,
          ipAddress: input.ipAddress ?? undefined,
        },
      });
    } catch (err) {
      // Never let audit-logging failures break the underlying request.
      this.logger.error('Failed to record audit entry', err instanceof Error ? err.stack : err);
    }
  }

  async list(organizationId: string, filters: AuditLogFilters) {
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);

    const where: Record<string, unknown> = { organizationId };
    if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.userId) where.userId = filters.userId;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  /** Distinct action/entityType values seen for this org, to drive filter dropdowns. */
  async listFilterOptions(organizationId: string) {
    const [actions, entityTypes] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { organizationId },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
    ]);

    return {
      actions: actions.map((a: { action: string }) => a.action),
      entityTypes: entityTypes.map((e: { entityType: string }) => e.entityType),
    };
  }
}
