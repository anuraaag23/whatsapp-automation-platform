import { Test } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { WhatsappClient } from './whatsapp.client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';

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
        return [...messages.values()].find((m) => m.waMessageId === where.waMessageId) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const id = `msg_${messages.size + 1}`;
        const created = { id, ...data };
        messages.set(id, created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = messages.get(where.id);
        const updated = { ...existing, ...data };
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
    __messages: messages,
    __contacts: contacts,
    __accounts: accounts,
  };
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
    prismaMock.__contacts.set('contact_org_a', { id: 'contact_org_a', organizationId: 'org_a', phoneNumber: '15550001111' });
    prismaMock.__contacts.set('contact_org_b', { id: 'contact_org_b', organizationId: 'org_b', phoneNumber: '15550002222' });
    prismaMock.__accounts.set('org_a', { organizationId: 'org_a', phoneNumberId: 'phone_a', accessTokenCiphertext: 'enc' });

    clientMock = { sendText: jest.fn(async () => ({ success: true, waMessageId: 'wamid.sent' })) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappClient, useValue: clientMock },
        { provide: CryptoService, useValue: { decrypt: () => 'plaintext-token' } },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
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
