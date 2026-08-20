import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { WebhookEventProcessorService } from './webhook-event-processor.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';

function createPrismaMock() {
  const events = new Map<string, any>();
  let seq = 0;

  return {
    webhookEvent: {
      create: jest.fn(async ({ data }: any) => {
        const existing = [...events.values()].find(
          (e) => e.provider === data.provider && e.externalEventId === data.externalEventId,
        );
        if (existing) {
          // processOnce's dedup fast-path checks `instanceof
          // Prisma.PrismaClientKnownRequestError`, so the mock has to
          // throw the real class (not a plain Error with a bolted-on
          // .code) for that branch to actually be exercised.
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '5.22.0',
          });
        }
        const id = `evt_${++seq}`;
        const created = { id, retryCount: 0, error: null, processedAt: null, receivedAt: new Date(), ...data };
        events.set(id, created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = events.get(where.id);
        const updated = { ...existing, ...data };
        events.set(where.id, updated);
        return updated;
      }),
      findMany: jest.fn(async ({ where, take }: any) => {
        return [...events.values()]
          .filter((e) => e.status === where.status && e.retryCount < where.retryCount.lt)
          .slice(0, take ?? Infinity);
      }),
    },
    __events: events,
  };
}

describe('WebhookEventProcessorService', () => {
  let service: WebhookEventProcessorService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let whatsappServiceMock: { applyStatusUpdate: jest.Mock };
  let events: EventEmitter2;

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    whatsappServiceMock = { applyStatusUpdate: jest.fn(async () => undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookEventProcessorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappService, useValue: whatsappServiceMock },
        EventEmitter2,
      ],
    }).compile();

    service = moduleRef.get(WebhookEventProcessorService);
    events = moduleRef.get(EventEmitter2);
  });

  describe('processOnce', () => {
    it('persists the event and marks it PROCESSED when the handler succeeds', async () => {
      await service.processOnce('message_status', 'wamid.1:sent', { id: 'wamid.1', status: 'sent' }, async () => {});

      const stored = [...prismaMock.__events.values()][0];
      expect(stored.status).toBe('PROCESSED');
      expect(stored.processedAt).not.toBeNull();
    });

    it('marks the event FAILED (not silently dropped) when the handler throws', async () => {
      await service.processOnce('message_status', 'wamid.2:sent', { id: 'wamid.2' }, async () => {
        throw new Error('boom');
      });

      const stored = [...prismaMock.__events.values()][0];
      expect(stored.status).toBe('FAILED');
      expect(stored.error).toBe('boom');
    });

    it('skips a duplicate (provider, externalEventId) without running the handler again', async () => {
      const handler = jest.fn(async () => {});
      await service.processOnce('message_status', 'wamid.3:sent', { id: 'wamid.3' }, handler);
      await service.processOnce('message_status', 'wamid.3:sent', { id: 'wamid.3' }, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(prismaMock.__events.size).toBe(1);
    });
  });

  describe('dispatchByEventType', () => {
    it('routes message_status to WhatsappService.applyStatusUpdate', async () => {
      await service.dispatchByEventType('message_status', { id: 'wamid.9', status: 'delivered' });
      expect(whatsappServiceMock.applyStatusUpdate).toHaveBeenCalledWith('wamid.9', 'delivered');
    });

    it('routes inbound_message to an emitted event, using the persisted _phoneNumberId', async () => {
      const listener = jest.fn();
      events.on('whatsapp.inbound_message', listener);

      // _phoneNumberId is folded into the stored payload by the controller
      // specifically so a retry (which only has the stored payload, not
      // the original HTTP request) can still reconstruct this.
      await service.dispatchByEventType('inbound_message', {
        id: 'wamid.10',
        from: '15550001111',
        type: 'text',
        text: { body: 'hello' },
        _phoneNumberId: 'phone_abc',
      });

      expect(listener).toHaveBeenCalledWith({ phoneNumberId: 'phone_abc', from: '15550001111', text: 'hello' });
    });

    it('routes template_status_update to an emitted event', async () => {
      const listener = jest.fn();
      events.on('whatsapp.template_status_update', listener);

      await service.dispatchByEventType('template_status_update', {
        message_template_id: 123,
        event: 'APPROVED',
        reason: null,
      });

      expect(listener).toHaveBeenCalledWith({ waTemplateId: '123', status: 'APPROVED', reason: null });
    });

    it('throws on an unknown eventType rather than silently succeeding', async () => {
      await expect(service.dispatchByEventType('mystery_event', {})).rejects.toThrow();
    });
  });

  describe('retryFailedEvents', () => {
    it('recovers a FAILED event that now succeeds, marking it PROCESSED', async () => {
      await service.processOnce('message_status', 'wamid.20:sent', { id: 'wamid.20', status: 'sent' }, async () => {
        throw new Error('transient');
      });
      expect([...prismaMock.__events.values()][0].status).toBe('FAILED');

      whatsappServiceMock.applyStatusUpdate.mockResolvedValueOnce(undefined);
      const result = await service.retryFailedEvents();

      expect(result).toEqual({ attempted: 1, recovered: 1 });
      const stored = [...prismaMock.__events.values()][0];
      expect(stored.status).toBe('PROCESSED');
      expect(stored.error).toBeNull();
    });

    it('increments retryCount and stays FAILED when the retry itself fails again', async () => {
      await service.processOnce('message_status', 'wamid.21:sent', { id: 'wamid.21', status: 'sent' }, async () => {
        throw new Error('still broken');
      });

      whatsappServiceMock.applyStatusUpdate.mockRejectedValueOnce(new Error('still broken'));
      const result = await service.retryFailedEvents();

      expect(result).toEqual({ attempted: 1, recovered: 0 });
      const stored = [...prismaMock.__events.values()][0];
      expect(stored.status).toBe('FAILED');
      expect(stored.retryCount).toBe(1);
    });

    it('stops retrying an event once it has been attempted MAX_RETRY_ATTEMPTS (5) times', async () => {
      await service.processOnce('message_status', 'wamid.22:sent', { id: 'wamid.22', status: 'sent' }, async () => {
        throw new Error('permanently broken');
      });

      whatsappServiceMock.applyStatusUpdate.mockRejectedValue(new Error('permanently broken'));

      // 5 retry ticks exhaust the attempt budget (retryCount 0->1->2->3->4->5).
      for (let i = 0; i < 5; i++) {
        await service.retryFailedEvents();
      }
      expect([...prismaMock.__events.values()][0].retryCount).toBe(5);

      // A 6th tick must not even attempt it anymore (retryCount is no longer < 5).
      const finalResult = await service.retryFailedEvents();
      expect(finalResult).toEqual({ attempted: 0, recovered: 0 });
      expect(whatsappServiceMock.applyStatusUpdate).toHaveBeenCalledTimes(5);
    });

    it('does not touch events that are not FAILED', async () => {
      await service.processOnce('message_status', 'wamid.23:sent', { id: 'wamid.23', status: 'sent' }, async () => {});
      expect([...prismaMock.__events.values()][0].status).toBe('PROCESSED');

      const result = await service.retryFailedEvents();
      expect(result).toEqual({ attempted: 0, recovered: 0 });
    });
  });
});
