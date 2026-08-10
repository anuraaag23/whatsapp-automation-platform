import { Injectable } from '@nestjs/common';
import type { MessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface ListParams {
  status?: MessageStatus;
  contactId?: string;
  campaignId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, params: ListParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 25;

    const where = {
      organizationId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.contactId ? { contactId: params.contactId } : {}),
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: { contact: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.message.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async statusCounts(organizationId: string) {
    const grouped = await this.prisma.message.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: { _all: true },
    });

    return grouped.reduce((acc: Record<string, number>, row: { status: string; _count: { _all: number } }) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {} as Record<string, number>);
  }
}
