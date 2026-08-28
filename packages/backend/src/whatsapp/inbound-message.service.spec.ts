import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InboundMessageService } from './inbound-message.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../conversations/conversations.service';

function createPrismaMock() {
  const whatsappAccounts = new Map<string, any>();
  const contacts = new Map<string, any>();
  const conversations = new Map<string, any>();
  const messages = new Map<string, any>();
  let seq = 0;

  return {
    whatsappAccount: {
      findFirst: jest.fn(async ({ where }: any) => {
        return [...whatsappAccounts.values()].find((a) => a.phoneNumberId === where.phoneNumberId) ?? null;
      }),
    },
    contact: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          [...contacts.values()].find(
            (c) => c.organizationId === where.organizationId && c.phoneNumber === where.phoneNumber,
          ) ?? null
        );
      }),
    },
    message: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          [...messages.values()].find(
            (m) => m.organizationId === where.organizationId && m.waMessageId === where.waMessageId,
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const id = `msg_${++seq}`;
        const created = { id, ...data };
        messages.set(id, created);
        return created;
      }),
    },
    conversation: {
      update: jest.fn(async ({ where, data }: any) => {
        const existing = conversations.get(where.id);
        const merged = { ...existing };
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'increment' in (value as any)) {
            merged[key] = (existing[key] ?? 0) + (value as any).increment;
          } else {
            merged[key] = value;
          }
        }
        conversations.set(where.id, merged);
        return merged;
      }),
    },
    __whatsappAccounts: whatsappAccounts,
    __contacts: contacts,
    __conversations: conversations,
    __messages: messages,
  };
}

describe('InboundMessageService', () => {
  let service: InboundMessageService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let contactsServiceMock: { create: jest.Mock };
  let conversationsServiceMock: { findOrCreateForContact: jest.Mock };
  let events: EventEmitter2;

  const ORG_ID = 'org_1';

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    prismaMock.__whatsappAccounts.set('acct_1', { organizationId: ORG_ID, phoneNumberId: 'phone_abc' });

    contactsServiceMock = {
      create: jest.fn(async (organizationId: string, dto: { phoneNumber: string }) => {
        const contact = { id: `contact_${dto.phoneNumber}`, organizationId, phoneNumber: dto.phoneNumber, firstName: null, lastName: null, company: null, city: null };
        prismaMock.__contacts.set(contact.id, contact);
        return contact;
      }),
    };

    conversationsServiceMock = {
      findOrCreateForContact: jest.fn(async (organizationId: string, contactId: string) => {
        const existing = [...prismaMock.__conversations.values()].find(
          (c) => c.organizationId === organizationId && c.contactId === contactId,
        );
        if (existing) return existing;
        const conversation = { id: `conv_${contactId}`, organizationId, contactId, status: 'OPEN', unreadCount: 0 };
        prismaMock.__conversations.set(conversation.id, conversation);
        return conversation;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InboundMessageService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ContactsService, useValue: contactsServiceMock },
        { provide: ConversationsService, useValue: conversationsServiceMock },
        EventEmitter2,
      ],
    }).compile();

    service = moduleRef.get(InboundMessageService);
    events = moduleRef.get(EventEmitter2);
  });

  function textPayload(overrides: Partial<any> = {}) {
    return {
      id: 'wamid.1',
      from: '15550001111',
      type: 'text',
      text: { body: 'hello there' },
      timestamp: '1700000000',
      _phoneNumberId: 'phone_abc',
      ...overrides,
    };
  }

  it('drops the message safely when _phoneNumberId is missing (no org can be derived)', async () => {
    await service.handle({ id: 'x', from: '1', type: 'text', text: { body: 'hi' } });
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it('drops the message safely when phoneNumberId matches no connected account', async () => {
    await service.handle(textPayload({ _phoneNumberId: 'unknown_phone' }));
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it('creates a new contact via ContactsService (not a second implementation) for a first-time sender', async () => {
    await service.handle(textPayload());

    expect(contactsServiceMock.create).toHaveBeenCalledWith(ORG_ID, { phoneNumber: '15550001111' });
  });

  it('reuses an existing contact instead of creating a duplicate', async () => {
    prismaMock.__contacts.set('existing', { id: 'existing', organizationId: ORG_ID, phoneNumber: '15550001111' });

    await service.handle(textPayload());

    expect(contactsServiceMock.create).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contactId: 'existing' }) }),
    );
  });

  it('falls back to re-reading the contact on a ConflictException race (concurrent first message)', async () => {
    contactsServiceMock.create.mockImplementationOnce(async () => {
      // Simulate a concurrent request having just created it.
      prismaMock.__contacts.set('won_the_race', {
        id: 'won_the_race',
        organizationId: ORG_ID,
        phoneNumber: '15550001111',
      });
      throw new ConflictException('phoneNumber already exists');
    });

    await service.handle(textPayload());

    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contactId: 'won_the_race' }) }),
    );
  });

  it('persists an inbound TEXT message with the correct fields', async () => {
    await service.handle(textPayload());

    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG_ID,
        direction: 'INBOUND',
        type: 'TEXT',
        content: { body: 'hello there' },
        status: 'DELIVERED',
        waMessageId: 'wamid.1',
        providerTimestamp: new Date(1700000000 * 1000),
      }),
    });
  });

  it('skips processing a message that already exists for this waMessageId (retried webhook event or Meta redelivery)', async () => {
    prismaMock.__messages.set('already_there', {
      id: 'already_there',
      organizationId: ORG_ID,
      waMessageId: 'wamid.1',
    });

    await service.handle(textPayload());

    expect(prismaMock.message.create).not.toHaveBeenCalled();
    expect(prismaMock.conversation.update).not.toHaveBeenCalled();
  });

  it('does not create a duplicate Message when two deliveries of the same waMessageId race past the findFirst check', async () => {
    // Both requests pass the findFirst idempotency check before either has
    // committed (findFirst finds nothing, since neither has created yet),
    // so the real guarantee has to come from the DB's unique index, not
    // that check. Simulate the loser's create() hitting P2002 because the
    // winner's row landed first.
    prismaMock.message.create.mockImplementationOnce(async () => {
      const winner = { id: 'won_the_race', organizationId: ORG_ID, waMessageId: 'wamid.1' };
      prismaMock.__messages.set(winner.id, winner);
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });
    });

    await service.handle(textPayload());

    // The loser must not throw, and must not touch the conversation or
    // emit automation a second time for the message the winner already
    // persisted.
    expect(prismaMock.conversation.update).not.toHaveBeenCalled();
  });

  it('maps an unrecognized inbound type to UNKNOWN, preserving the raw payload rather than dropping or mislabeling it', async () => {
    await service.handle(textPayload({ type: 'sticker', text: undefined, sticker: { id: 'sticker_id' } }));

    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'UNKNOWN',
          content: expect.objectContaining({ rawType: 'sticker' }),
        }),
      }),
    );
  });

  it('maps a location message correctly', async () => {
    await service.handle(
      textPayload({ type: 'location', text: undefined, location: { latitude: 1.23, longitude: 4.56, name: 'Cafe' } }),
    );

    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'LOCATION',
          content: expect.objectContaining({ latitude: 1.23, longitude: 4.56, name: 'Cafe' }),
        }),
      }),
    );
  });

  it('updates the conversation (lastMessageAt, lastInboundAt, unreadCount) after persisting the message', async () => {
    await service.handle(textPayload());

    const conversation = [...prismaMock.__conversations.values()][0];
    expect(conversation.unreadCount).toBe(1);
    expect(conversation.lastMessageAt).toBeInstanceOf(Date);
    expect(conversation.lastInboundAt).toBeInstanceOf(Date);
  });

  it('reopens a RESOLVED conversation on a new inbound message', async () => {
    const contact = { id: 'c1', organizationId: ORG_ID, phoneNumber: '15550001111' };
    prismaMock.__contacts.set('c1', contact);
    prismaMock.__conversations.set('conv_c1', { id: 'conv_c1', organizationId: ORG_ID, contactId: 'c1', status: 'RESOLVED', unreadCount: 0 });

    await service.handle(textPayload());

    expect(prismaMock.__conversations.get('conv_c1').status).toBe('OPEN');
  });

  it('does not reopen an ARCHIVED conversation', async () => {
    const contact = { id: 'c1', organizationId: ORG_ID, phoneNumber: '15550001111' };
    prismaMock.__contacts.set('c1', contact);
    prismaMock.__conversations.set('conv_c1', { id: 'conv_c1', organizationId: ORG_ID, contactId: 'c1', status: 'ARCHIVED', unreadCount: 0 });

    await service.handle(textPayload());

    expect(prismaMock.__conversations.get('conv_c1').status).toBe('ARCHIVED');
  });

  it('emits whatsapp.inbound_message with organizationId/contactId/conversationId already resolved', async () => {
    const listener = jest.fn();
    events.on('whatsapp.inbound_message', listener);

    await service.handle(textPayload());

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        contactId: 'contact_15550001111',
        text: 'hello there',
        from: '15550001111',
      }),
    );
  });

  it('keeps the message persisted even if an automation listener throws during the emit', async () => {
    events.on('whatsapp.inbound_message', () => {
      throw new Error('automation engine exploded');
    });

    await expect(service.handle(textPayload())).resolves.toBeUndefined();
    expect(prismaMock.message.create).toHaveBeenCalled();
  });
});
