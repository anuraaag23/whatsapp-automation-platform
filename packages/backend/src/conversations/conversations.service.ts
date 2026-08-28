import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface ListParams {
  status?: string;
  assignedUserId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds the one conversation for this (organization, contact) pair, or
   * creates it. The unique constraint on (organizationId, contactId) is
   * what actually prevents duplicates under concurrent inbound messages —
   * this find-then-create is a convenience, not the source of truth; on a
   * P2002 race (two inbound messages from a brand-new contact arriving at
   * nearly the same time), the loser just re-reads what the winner
   * created rather than erroring.
   */
  async findOrCreateForContact(organizationId: string, contactId: string) {
    const existing = await this.prisma.conversation.findUnique({
      where: { organizationId_contactId: { organizationId, contactId } },
    });
    if (existing) return existing;

    try {
      return await this.prisma.conversation.create({ data: { organizationId, contactId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const created = await this.prisma.conversation.findUnique({
          where: { organizationId_contactId: { organizationId, contactId } },
        });
        if (created) return created;
      }
      throw error;
    }
  }

  async list(organizationId: string, params: ListParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 25;

    const where: Prisma.ConversationWhereInput = {
      organizationId,
      ...(params.status ? { status: params.status as Prisma.ConversationWhereInput['status'] } : {}),
      ...(params.assignedUserId ? { assignedUserId: params.assignedUserId } : {}),
      ...(params.search
        ? {
            contact: {
              OR: [
                { firstName: { contains: params.search, mode: 'insensitive' as const } },
                { lastName: { contains: params.search, mode: 'insensitive' as const } },
                { phoneNumber: { contains: params.search } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: { contact: true, assignedUser: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /** Scoped by (id, organizationId) together — never trust an id alone across a tenant boundary. */
  async findOne(organizationId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, organizationId },
      include: { contact: true, assignedUser: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async listMessages(organizationId: string, conversationId: string, params: { page?: number; pageSize?: number }) {
    // Confirms the conversation belongs to this org before touching its
    // messages — the messages query itself is also organizationId-scoped
    // below as a second, independent layer, not because this check could
    // be bypassed, but because a lone `where: { conversationId }` on the
    // messages query would look correct in isolation and silently stop
    // being safe the moment someone edits this method later without
    // re-deriving the org boundary from the conversation lookup.
    await this.findOne(organizationId, conversationId);

    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 200) : 50;

    const where = { organizationId, conversationId };
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.message.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async markRead(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
  }

  async updateStatus(organizationId: string, id: string, status: string) {
    await this.findOne(organizationId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { status: status as Prisma.ConversationUpdateInput['status'] },
    });
  }

  async assign(organizationId: string, id: string, userId: string | null | undefined) {
    await this.findOne(organizationId, id);

    if (userId) {
      // The assignee has to be a member of the SAME organization — an id
      // alone isn't enough, same reasoning as every other tenant-boundary
      // fix elsewhere in this codebase.
      const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId } });
      if (!user) throw new BadRequestException('Assignee must belong to the same organization');
    }

    return this.prisma.conversation.update({
      where: { id },
      data: { assignedUserId: userId ?? null },
    });
  }
}
