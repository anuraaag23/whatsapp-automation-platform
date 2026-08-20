import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { MessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MESSAGE_TYPE } from '../common/constants/prisma-enums.constants';
import { SendMessageDto } from './dto/send-message.dto';

interface ListParams {
  status?: MessageStatus;
  contactId?: string;
  campaignId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

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

  /**
   * Sends a one-off message (text or image) to a single contact right now,
   * outside of any campaign/schedule/automation. This is the Messages page
   * "compose" action — previously that page was read-only (list/filter
   * only), with no way to actually send anything from it.
   */
  async sendAdHoc(organizationId: string, dto: SendMessageDto) {
    // Scope check: fails fast with a clear message before attempting to
    // send. WhatsappService.sendToContact() now also enforces this same
    // (id, organizationId) scoping itself, so this isn't the only thing
    // standing between a crafted cross-org contactId and an actual send —
    // but checking it here too means a bad contactId is rejected before
    // this method does anything else (e.g. the opt-in check below), rather
    // than only failing deeper in the call chain.
    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, organizationId },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    if (contact.optInStatus !== 'OPTED_IN') {
      throw new BadRequestException(
        'This contact is not opted-in yet — mark them as opted-in on the Contacts page before messaging them.',
      );
    }

    if (dto.type === 'IMAGE') {
      return this.whatsappService.sendToContact({
        organizationId,
        contactId: dto.contactId,
        type: MESSAGE_TYPE.IMAGE,
        content: { link: dto.imageUrl, caption: dto.caption },
      });
    }

    return this.whatsappService.sendToContact({
      organizationId,
      contactId: dto.contactId,
      type: MESSAGE_TYPE.TEXT,
      content: { body: dto.body },
    });
  }
}
