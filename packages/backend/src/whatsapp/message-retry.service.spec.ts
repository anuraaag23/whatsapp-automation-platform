import { Test } from '@nestjs/testing';
import { MessageRetryService } from './message-retry.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { MESSAGE_STATUS } from '../common/constants/prisma-enums.constants';

describe('MessageRetryService', () => {
  let service: MessageRetryService;
  let prismaMock: any;
  let whatsappServiceMock: { retrySend: jest.Mock };
  let campaignsServiceMock: { checkAndMarkCompletion: jest.Mock };

  beforeEach(async () => {
    const messages = new Map<string, any>();
    prismaMock = {
      message: {
        findMany: jest.fn(async () => [...messages.values()]),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const [id, msg] of messages.entries()) {
            if (msg.id === where.id && (!where.status || msg.status === where.status)) {
              const updated = { ...msg };
              for (const [k, v] of Object.entries(data)) {
                if (v && typeof v === 'object' && 'increment' in (v as any)) {
                  updated[k] = (updated[k] ?? 0) + (v as any).increment;
                } else {
                  updated[k] = v;
                }
              }
              messages.set(id, updated);
              count++;
            }
          }
          return { count };
        }),
      },
      campaignRecipient: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      __messages: messages,
    };

    whatsappServiceMock = {
      retrySend: jest.fn(async (_orgId: string, messageId: string) => ({
        id: messageId,
        status: MESSAGE_STATUS.SENT,
        contactId: 'c1',
      })),
    };

    campaignsServiceMock = {
      checkAndMarkCompletion: jest.fn(async () => undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MessageRetryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappService, useValue: whatsappServiceMock },
        { provide: CampaignsService, useValue: campaignsServiceMock },
      ],
    }).compile();

    service = moduleRef.get(MessageRetryService);
  });

  it('claims eligible failed messages, invokes retrySend, and tracks recovered count', async () => {
    prismaMock.__messages.set('m1', {
      id: 'm1',
      organizationId: 'org1',
      direction: 'OUTBOUND',
      status: MESSAGE_STATUS.FAILED,
      retryCount: 0,
      errorCode: 'ECONNRESET',
      campaignId: 'camp1',
    });

    const result = await service.retryEligibleMessages();

    expect(result).toEqual({ attempted: 1, recovered: 1 });
    expect(whatsappServiceMock.retrySend).toHaveBeenCalledWith('org1', 'm1');
    expect(prismaMock.campaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { campaignId: 'camp1', contactId: 'c1' },
      data: { status: MESSAGE_STATUS.SENT },
    });
    expect(campaignsServiceMock.checkAndMarkCompletion).toHaveBeenCalledWith('camp1');
  });

  it('skips a message if the atomic claim finds count 0 (already claimed by concurrent tick)', async () => {
    prismaMock.__messages.set('m1', {
      id: 'm1',
      organizationId: 'org1',
      direction: 'OUTBOUND',
      status: MESSAGE_STATUS.FAILED,
      retryCount: 0,
    });
    prismaMock.message.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.retryEligibleMessages();

    expect(result).toEqual({ attempted: 0, recovered: 0 });
    expect(whatsappServiceMock.retrySend).not.toHaveBeenCalled();
  });

  it('re-marks message FAILED and increments retryCount if retrySend throws an unexpected error', async () => {
    prismaMock.__messages.set('m1', {
      id: 'm1',
      organizationId: 'org1',
      direction: 'OUTBOUND',
      status: MESSAGE_STATUS.FAILED,
      retryCount: 0,
    });
    whatsappServiceMock.retrySend.mockRejectedValueOnce(new Error('Unexpected disk/network drop'));

    const result = await service.retryEligibleMessages();

    expect(result).toEqual({ attempted: 1, recovered: 0 });
    const stored = prismaMock.__messages.get('m1');
    expect(stored.status).toBe(MESSAGE_STATUS.FAILED);
    expect(stored.retryCount).toBe(1);
  });
});
