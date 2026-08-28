import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';

function createPrismaMock() {
  const conversations = new Map<string, any>();
  const users = new Map<string, any>();
  const messages = new Map<string, any>();

  return {
    conversation: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.organizationId_contactId) {
          const { organizationId, contactId } = where.organizationId_contactId;
          return (
            [...conversations.values()].find(
              (c) => c.organizationId === organizationId && c.contactId === contactId,
            ) ?? null
          );
        }
        return conversations.get(where.id) ?? null;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          [...conversations.values()].find((c) => c.id === where.id && c.organizationId === where.organizationId) ??
          null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const id = `conv_${conversations.size + 1}`;
        const created = { id, status: 'OPEN', unreadCount: 0, ...data };
        conversations.set(id, created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = conversations.get(where.id);
        const updated = { ...existing, ...data };
        conversations.set(where.id, updated);
        return updated;
      }),
      findMany: jest.fn(async () => [...conversations.values()]),
      count: jest.fn(async () => conversations.size),
    },
    message: {
      findMany: jest.fn(async ({ where }: any) =>
        [...messages.values()].filter((m) => m.organizationId === where.organizationId && m.conversationId === where.conversationId),
      ),
      count: jest.fn(async () => 0),
    },
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        return [...users.values()].find((u) => u.id === where.id && u.organizationId === where.organizationId) ?? null;
      }),
    },
    __conversations: conversations,
    __users: users,
    __messages: messages,
  };
}

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [ConversationsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(ConversationsService);
  });

  describe('findOrCreateForContact', () => {
    it('creates a conversation when none exists yet', async () => {
      const conv = await service.findOrCreateForContact('org_a', 'contact_1');
      expect(conv.organizationId).toBe('org_a');
      expect(conv.contactId).toBe('contact_1');
    });

    it('reuses the existing conversation on a second call for the same contact', async () => {
      const first = await service.findOrCreateForContact('org_a', 'contact_1');
      const second = await service.findOrCreateForContact('org_a', 'contact_1');
      expect(second.id).toBe(first.id);
      expect(prismaMock.conversation.create).toHaveBeenCalledTimes(1);
    });

    it('re-reads instead of erroring on a P2002 race (concurrent first message)', async () => {
      prismaMock.__conversations.set('conv_won_race', {
        id: 'conv_won_race',
        organizationId: 'org_a',
        contactId: 'contact_1',
      });
      prismaMock.conversation.create.mockImplementationOnce(async () => {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
        });
      });
      // Force the initial findUnique to miss so create() is attempted.
      prismaMock.conversation.findUnique.mockImplementationOnce(async () => null);

      const result = await service.findOrCreateForContact('org_a', 'contact_1');
      expect(result.id).toBe('conv_won_race');
    });
  });

  describe('tenant isolation', () => {
    it('refuses to return a conversation belonging to a different organization', async () => {
      const conv = await service.findOrCreateForContact('org_a', 'contact_1');

      await expect(service.findOne('org_b', conv.id)).rejects.toThrow(NotFoundException);
      // Org A itself can still see it — proves this is a real org check, not just "always fails".
      await expect(service.findOne('org_a', conv.id)).resolves.toMatchObject({ id: conv.id });
    });

    it('refuses to list messages for a conversation belonging to a different organization', async () => {
      const conv = await service.findOrCreateForContact('org_a', 'contact_1');

      await expect(service.listMessages('org_b', conv.id, {})).rejects.toThrow(NotFoundException);
    });

    it('refuses to mark read a conversation belonging to a different organization', async () => {
      const conv = await service.findOrCreateForContact('org_a', 'contact_1');

      await expect(service.markRead('org_b', conv.id)).rejects.toThrow(NotFoundException);
    });

    it('refuses to assign a conversation to a user from a different organization', async () => {
      const conv = await service.findOrCreateForContact('org_a', 'contact_1');
      prismaMock.__users.set('user_b', { id: 'user_b', organizationId: 'org_b' });

      await expect(service.assign('org_a', conv.id, 'user_b')).rejects.toThrow(BadRequestException);
    });

    it('allows assigning a conversation to a user from the SAME organization', async () => {
      const conv = await service.findOrCreateForContact('org_a', 'contact_1');
      prismaMock.__users.set('user_a', { id: 'user_a', organizationId: 'org_a' });

      const updated = await service.assign('org_a', conv.id, 'user_a');
      expect(updated.assignedUserId).toBe('user_a');
    });
  });

  describe('markRead', () => {
    it('resets unreadCount to 0', async () => {
      const conv = await service.findOrCreateForContact('org_a', 'contact_1');
      prismaMock.__conversations.set(conv.id, { ...conv, unreadCount: 5 });

      const updated = await service.markRead('org_a', conv.id);
      expect(updated.unreadCount).toBe(0);
    });
  });
});
