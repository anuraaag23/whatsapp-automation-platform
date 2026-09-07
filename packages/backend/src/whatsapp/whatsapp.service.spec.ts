import { Test } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { WhatsappClient } from './whatsapp.client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import { QuotaService, QuotaExceededException } from '../quota/quota.service';

/**
 * Standing in for the real Message table: applyStatusUpdate's only query is
 * `findFirst({ where: { waMessageId } })`, which is exactly the query the
 * new `@@index([waMessageId])` (see Phase B migration) speeds up. This mock
 * checks correctness of that lookup, not the index itself — an index change
 * doesn't alter query results, only how fast the database finds them, so
 * there's nothing about "using the index" to assert from application code.
 * What matters here is that the still-unchanged query keeps resolving to
 * the right row once multiple messages exist with distinct waMessageIds.
 */
function createPrismaMock() {
  const messages = new Map<string, any>();
  const contacts = new Map<string, any>();
  const accounts = new Map<string, any>();

  return {
    message: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          [...messages.values()].find((m) =>
            Object.entries(where).every(([key, value]) => m[key] === value),
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        const id = `msg_${messages.size + 1}`;
        const created = { id, ...data };
        messages.set(id, created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = messages.get(where.id);
        // Minimal support for Prisma's `{ increment: n }` update operator —
        // enough for retryCount without pulling in a full Prisma mock lib.
        const resolved: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
          resolved[key] =
            value && typeof value === 'object' && 'increment' in (value as any)
              ? (existing?.[key] ?? 0) + (value as any).increment
              : value;
        }
        const updated = { ...existing, ...resolved };
        messages.set(where.id, updated);
        return updated;
      }),
    },
    contact: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          [...contacts.values()].find(
            (c) => c.id === where.id && c.organizationId === where.organizationId,
          ) ?? null
        );
      }),
    },
    whatsappAccount: {
      findUnique: jest.fn(async ({ where }: any) => accounts.get(where.organizationId) ?? null),
    },
    conversation: {
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    __messages: messages,
    __contacts: contacts,
    __accounts: accounts,
  };
}

/** ConversationsService is mocked directly (rather than exercised for real) here — sendToContact's own tests care about the send path, not conversation upsert semantics, which are covered separately in conversations.service.spec.ts. */
function createConversationsServiceMock() {
  return { findOrCreateForContact: jest.fn(async (_organizationId: string, contactId: string) => ({ id: `conv_${contactId}` })) };
}

describe('WhatsappService.applyStatusUpdate', () => {
  let service: WhatsappService;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    prismaMock.__messages.set('msg_1', { id: 'msg_1', waMessageId: 'wamid.AAA', status: 'SENT' });
    prismaMock.__messages.set('msg_2', { id: 'msg_2', waMessageId: 'wamid.BBB', status: 'SENT' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappClient, useValue: {} },
        { provide: CryptoService, useValue: {} },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ConversationsService, useValue: createConversationsServiceMock() },
        { provide: QuotaService, useValue: { assertWithinLimit: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(WhatsappService);
  });

  it('looks up by waMessageId and updates only the matching message', async () => {
    await service.applyStatusUpdate('wamid.BBB', 'delivered');

    expect(prismaMock.message.findFirst).toHaveBeenCalledWith({ where: { waMessageId: 'wamid.BBB' } });
    expect(prismaMock.__messages.get('msg_2').status).toBe('DELIVERED');
    expect(prismaMock.__messages.get('msg_2').deliveredAt).toBeInstanceOf(Date);
    // The other message, sharing no waMessageId with this update, is untouched.
    expect(prismaMock.__messages.get('msg_1').status).toBe('SENT');
  });

  it('is a no-op when no message matches the given waMessageId', async () => {
    await service.applyStatusUpdate('wamid.UNKNOWN', 'read');

    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });
});

describe('WhatsappService.sendToContact — tenant isolation', () => {
  let service: WhatsappService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let clientMock: { sendText: jest.Mock };

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    prismaMock.__contacts.set('contact_org_a', { id: 'contact_org_a', organizationId: 'org_a', phoneNumber: '15550001111', optInStatus: 'OPTED_IN' });
    prismaMock.__contacts.set('contact_org_b', { id: 'contact_org_b', organizationId: 'org_b', phoneNumber: '15550002222', optInStatus: 'OPTED_IN' });
    prismaMock.__accounts.set('org_a', { organizationId: 'org_a', phoneNumberId: 'phone_a', accessTokenCiphertext: 'enc' });

    clientMock = { sendText: jest.fn(async () => ({ success: true, waMessageId: 'wamid.sent' })) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappClient, useValue: clientMock },
        { provide: CryptoService, useValue: { decrypt: () => 'plaintext-token' } },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ConversationsService, useValue: createConversationsServiceMock() },
        { provide: QuotaService, useValue: { assertWithinLimit: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(WhatsappService);
  });

  it('sends successfully when the contact belongs to the requesting organization', async () => {
    const result = await service.sendToContact({
      organizationId: 'org_a',
      contactId: 'contact_org_a',
      type: 'TEXT' as any,
      content: { body: 'hi' },
    });

    expect(clientMock.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ to: '15550001111', phoneNumberId: 'phone_a' }),
    );
    expect(result.status).toBe('SENT');
  });

  it('links the sent message to the contact\'s conversation and marks it as the latest outbound activity', async () => {
    const conversationsMock = createConversationsServiceMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappClient, useValue: clientMock },
        { provide: CryptoService, useValue: { decrypt: () => 'plaintext-token' } },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ConversationsService, useValue: conversationsMock },
        { provide: QuotaService, useValue: { assertWithinLimit: jest.fn() } },
      ],
    }).compile();
    const localService = moduleRef.get(WhatsappService);

    const result = await localService.sendToContact({
      organizationId: 'org_a',
      contactId: 'contact_org_a',
      type: 'TEXT' as any,
      content: { body: 'hi' },
    });

    expect(conversationsMock.findOrCreateForContact).toHaveBeenCalledWith('org_a', 'contact_org_a');
    expect((result as any).conversationId).toBe('conv_contact_org_a');
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv_contact_org_a' },
        data: expect.objectContaining({ lastMessageAt: expect.any(Date), lastOutboundAt: expect.any(Date) }),
      }),
    );
  });

  it('refuses to send when contactId belongs to a DIFFERENT organization than the requester', async () => {
    // org_a has a connected WhatsApp account; contact_org_b belongs to
    // org_b. Before the Objective 3 fix, sendToContact looked the contact
    // up by raw id only, so this would have succeeded and sent a message
    // to org_b's contact using org_a's WhatsApp account.
    await expect(
      service.sendToContact({
        organizationId: 'org_a',
        contactId: 'contact_org_b',
        type: 'TEXT' as any,
        content: { body: 'hi' },
      }),
    ).rejects.toThrow('Contact not found');

    expect(clientMock.sendText).not.toHaveBeenCalled();
  });

  it('scopes the contact lookup by (id, organizationId) together, not id alone', async () => {
    await service.sendToContact({
      organizationId: 'org_a',
      contactId: 'contact_org_a',
      type: 'TEXT' as any,
      content: { body: 'hi' },
    });

    expect(prismaMock.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'contact_org_a', organizationId: 'org_a' },
    });
  });
});

describe('WhatsappService.sendToContact — opt-out enforcement (single central check)', () => {
  let service: WhatsappService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let clientMock: { sendText: jest.Mock };

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    prismaMock.__accounts.set('org_a', { organizationId: 'org_a', phoneNumberId: 'phone_a', accessTokenCiphertext: 'enc' });
    clientMock = { sendText: jest.fn(async () => ({ success: true, waMessageId: 'wamid.sent' })) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappClient, useValue: clientMock },
        { provide: CryptoService, useValue: { decrypt: () => 'plaintext-token' } },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ConversationsService, useValue: createConversationsServiceMock() },
        { provide: QuotaService, useValue: { assertWithinLimit: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(WhatsappService);
  });

  it.each(['PENDING', 'OPTED_OUT'])('refuses to call the WhatsApp API for a contact with optInStatus %s, and records a FAILED message instead', async (optInStatus) => {
    prismaMock.__contacts.set('contact_1', { id: 'contact_1', organizationId: 'org_a', phoneNumber: '15550001111', optInStatus });

    const result = await service.sendToContact({
      organizationId: 'org_a',
      contactId: 'contact_1',
      type: 'TEXT' as any,
      content: { body: 'hi' },
    });

    expect(clientMock.sendText).not.toHaveBeenCalled();
    expect((result as any).status).toBe('FAILED');
    expect((result as any).errorCode).toBe('NOT_OPTED_IN');
  });

  it('sends normally for an OPTED_IN contact — this is the one enforcement point every send path relies on', async () => {
    prismaMock.__contacts.set('contact_1', { id: 'contact_1', organizationId: 'org_a', phoneNumber: '15550001111', optInStatus: 'OPTED_IN' });

    const result = await service.sendToContact({
      organizationId: 'org_a',
      contactId: 'contact_1',
      type: 'TEXT' as any,
      content: { body: 'hi' },
    });

    expect(clientMock.sendText).toHaveBeenCalled();
    expect((result as any).status).toBe('SENT');
  });
});

describe('WhatsappService.retrySend', () => {
  let service: WhatsappService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let clientMock: { sendText: jest.Mock };
  let quotaMock: { assertWithinLimit: jest.Mock };

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    prismaMock.__accounts.set('org_a', { organizationId: 'org_a', phoneNumberId: 'phone_a', accessTokenCiphertext: 'enc' });
    prismaMock.__contacts.set('contact_1', { id: 'contact_1', organizationId: 'org_a', phoneNumber: '15550001111', optInStatus: 'OPTED_IN' });
    prismaMock.__messages.set('msg_failed', {
      id: 'msg_failed',
      organizationId: 'org_a',
      contactId: 'contact_1',
      conversationId: 'conv_contact_1',
      direction: 'OUTBOUND',
      type: 'TEXT',
      content: { body: 'hi again' },
      status: 'FAILED',
      retryCount: 0,
    });

    clientMock = { sendText: jest.fn(async () => ({ success: true, waMessageId: 'wamid.retry-sent' })) };
    quotaMock = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappClient, useValue: clientMock },
        { provide: CryptoService, useValue: { decrypt: () => 'plaintext-token' } },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: ConversationsService, useValue: createConversationsServiceMock() },
        { provide: QuotaService, useValue: quotaMock },
      ],
    }).compile();
    service = moduleRef.get(WhatsappService);
  });

  it('enforces monthly message quota before dispatch — finalizes retry as FAILED with QUOTA_EXCEEDED without calling provider', async () => {
    quotaMock.assertWithinLimit.mockRejectedValue(
      new QuotaExceededException('messagesPerMonth', 100, 100),
    );

    const result = await service.retrySend('org_a', 'msg_failed');

    expect(quotaMock.assertWithinLimit).toHaveBeenCalledWith('org_a', 'messagesPerMonth');
    expect(clientMock.sendText).not.toHaveBeenCalled();
    expect((result as any).status).toBe('FAILED');
    expect((result as any).retryCount).toBe(1);
    expect((result as any).errorCode).toBe('QUOTA_EXCEEDED');
    expect((result as any).errorMessage).toContain('messagesPerMonth');
  });

  it('re-sends using the SAME message row (updates it) rather than creating a new one', async () => {
    const before = prismaMock.__messages.size;
    const result = await service.retrySend('org_a', 'msg_failed');

    expect(clientMock.sendText).toHaveBeenCalledWith(expect.objectContaining({ to: '15550001111', body: 'hi again' }));
    expect(prismaMock.__messages.size).toBe(before);
    expect((result as any).id).toBe('msg_failed');
    expect((result as any).status).toBe('SENT');
    expect((result as any).waMessageId).toBe('wamid.retry-sent');
  });

  it('increments retryCount and stays FAILED when the resend also fails', async () => {
    clientMock.sendText.mockResolvedValueOnce({ success: false, errorCode: '131026', errorMessage: 'undeliverable' });

    const result = await service.retrySend('org_a', 'msg_failed');

    expect((result as any).status).toBe('FAILED');
    expect((result as any).retryCount).toBe(1);
    expect((result as any).errorCode).toBe('131026');
  });

  it('re-verifies opt-in status at retry time — a contact who opted out since the original attempt is not messaged', async () => {
    prismaMock.__contacts.set('contact_1', { id: 'contact_1', organizationId: 'org_a', phoneNumber: '15550001111', optInStatus: 'OPTED_OUT' });

    const result = await service.retrySend('org_a', 'msg_failed');

    expect(clientMock.sendText).not.toHaveBeenCalled();
    expect((result as any).status).toBe('FAILED');
    expect((result as any).errorCode).toBe('NOT_OPTED_IN');
  });

  it('throws NotFoundException for a message that is not FAILED (nothing to retry) or not in this organization', async () => {
    prismaMock.__messages.set('msg_sent', { id: 'msg_sent', organizationId: 'org_a', contactId: 'contact_1', direction: 'OUTBOUND', status: 'SENT' });

    await expect(service.retrySend('org_a', 'msg_sent')).rejects.toThrow('Failed outbound message not found');
    await expect(service.retrySend('org_b', 'msg_failed')).rejects.toThrow('Failed outbound message not found');
  });
});
