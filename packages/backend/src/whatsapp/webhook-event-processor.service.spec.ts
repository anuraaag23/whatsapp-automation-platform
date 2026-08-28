import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { WebhookEventProcessorService } from './webhook-event-processor.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import { InboundMessageService } from './inbound-message.service';
import { WEBHOOK_EVENT_PROCESS_QUEUE } from './whatsapp.constants';

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
          // acceptOnce's dedup fast-path checks `instanceof
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
      findUnique: jest.fn(async ({ where }: any) => events.get(where.id) ?? null),
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

function createQueueMock() {
  return { add: jest.fn(async () => undefined), on: jest.fn() };
}

describe('WebhookEventProcessorService', () => {
  let service: WebhookEventProcessorService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let queueMock: ReturnType<typeof createQueueMock>;
  let whatsappServiceMock: { applyStatusUpdate: jest.Mock };
  let inboundMessageServiceMock: { handle: jest.Mock };
  let events: EventEmitter2;

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    queueMock = createQueueMock();
    whatsappServiceMock = { applyStatusUpdate: jest.fn(async () => undefined) };
    inboundMessageServiceMock = { handle: jest.fn(async () => undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookEventProcessorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappService, useValue: whatsappServiceMock },
        { provide: InboundMessageService, useValue: inboundMessageServiceMock },
        { provide: getQueueToken(WEBHOOK_EVENT_PROCESS_QUEUE), useValue: queueMock },
        EventEmitter2,
      ],
    }).compile();

    service = moduleRef.get(WebhookEventProcessorService);
    events = moduleRef.get(EventEmitter2);
  });

  describe('acceptOnce', () => {
    it('persists the event as RECEIVED and enqueues it for async processing, without running any dispatch logic itself', async () => {
      const result = await service.acceptOnce('message_status', 'wamid.1:sent', { id: 'wamid.1', status: 'sent' });

      const stored = [...prismaMock.__events.values()][0];
      expect(stored.status).toBe('RECEIVED');
      expect(result?.id).toBe(stored.id);
      expect(whatsappServiceMock.applyStatusUpdate).not.toHaveBeenCalled();
      expect(queueMock.add).toHaveBeenCalledWith(
        'process',
        { eventId: stored.id },
        expect.objectContaining({ attempts: 1 }),
      );
    });

    it('skips a duplicate (provider, externalEventId) without enqueueing it again', async () => {
      await service.acceptOnce('message_status', 'wamid.3:sent', { id: 'wamid.3' });
      const second = await service.acceptOnce('message_status', 'wamid.3:sent', { id: 'wamid.3' });

      expect(second).toBeUndefined();
      expect(prismaMock.__events.size).toBe(1);
      expect(queueMock.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('processEvent', () => {
    it('dispatches and marks the event PROCESSED when dispatch succeeds', async () => {
      const created = await service.acceptOnce('message_status', 'wamid.5:sent', { id: 'wamid.5', status: 'sent' });
      await service.processEvent(created!.id);

      expect(whatsappServiceMock.applyStatusUpdate).toHaveBeenCalledWith('wamid.5', 'sent');
      const stored = prismaMock.__events.get(created!.id);
      expect(stored.status).toBe('PROCESSED');
      expect(stored.processedAt).not.toBeNull();
    });

    it('marks the event FAILED (not silently dropped) when dispatch throws', async () => {
      whatsappServiceMock.applyStatusUpdate.mockRejectedValueOnce(new Error('boom'));
      const created = await service.acceptOnce('message_status', 'wamid.6:sent', { id: 'wamid.6', status: 'sent' });
      await service.processEvent(created!.id);

      const stored = prismaMock.__events.get(created!.id);
      expect(stored.status).toBe('FAILED');
      expect(stored.error).toBe('boom');
    });

    it('is a safe no-op for an unknown event id', async () => {
      await expect(service.processEvent('does-not-exist')).resolves.toBeUndefined();
    });
  });

  describe('dispatchByEventType', () => {
    it('routes message_status to WhatsappService.applyStatusUpdate', async () => {
      await service.dispatchByEventType('message_status', { id: 'wamid.9', status: 'delivered' });
      expect(whatsappServiceMock.applyStatusUpdate).toHaveBeenCalledWith('wamid.9', 'delivered');
    });

    it('routes inbound_message to InboundMessageService.handle, passing the full persisted payload through', async () => {
      // InboundMessageService itself is what resolves the account,
      // creates/reuses the contact and conversation, persists the
      // Message, and emits whatsapp.inbound_message afterward (see
      // inbound-message.service.spec.ts) — this dispatch layer's only job
      // is to route to it with the stored payload untouched, including
      // _phoneNumberId (folded in by the controller at receipt time so
      // async processing / a retry never needs the original HTTP request).
      const payload = {
        id: 'wamid.10',
        from: '15550001111',
        type: 'text',
        text: { body: 'hello' },
        _phoneNumberId: 'phone_abc',
      };

      await service.dispatchByEventType('inbound_message', payload);

      expect(inboundMessageServiceMock.handle).toHaveBeenCalledWith(payload);
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
    /** Seeds a FAILED event the same way the real system produces one: accept, then a failing processEvent. */
    async function seedFailedEvent(externalEventId: string) {
      whatsappServiceMock.applyStatusUpdate.mockRejectedValueOnce(new Error('initial failure'));
      const created = await service.acceptOnce('message_status', externalEventId, {
        id: externalEventId,
        status: 'sent',
      });
      await service.processEvent(created!.id);
      expect(prismaMock.__events.get(created!.id).status).toBe('FAILED');
      return created!.id;
    }

    it('recovers a FAILED event that now succeeds, marking it PROCESSED', async () => {
      const id = await seedFailedEvent('wamid.20:sent');

      whatsappServiceMock.applyStatusUpdate.mockResolvedValueOnce(undefined);
      const result = await service.retryFailedEvents();

      expect(result).toEqual({ attempted: 1, recovered: 1 });
      const stored = prismaMock.__events.get(id);
      expect(stored.status).toBe('PROCESSED');
      expect(stored.error).toBeNull();
    });

    it('increments retryCount and stays FAILED when the retry itself fails again', async () => {
      const id = await seedFailedEvent('wamid.21:sent');

      whatsappServiceMock.applyStatusUpdate.mockRejectedValueOnce(new Error('still broken'));
      const result = await service.retryFailedEvents();

      expect(result).toEqual({ attempted: 1, recovered: 0 });
      const stored = prismaMock.__events.get(id);
      expect(stored.status).toBe('FAILED');
      expect(stored.retryCount).toBe(1);
    });

    it('stops retrying an event once it has been attempted MAX_RETRY_ATTEMPTS (5) times', async () => {
      const id = await seedFailedEvent('wamid.22:sent');

      whatsappServiceMock.applyStatusUpdate.mockRejectedValue(new Error('permanently broken'));

      // 5 retry ticks exhaust the attempt budget (retryCount 0->1->2->3->4->5).
      for (let i = 0; i < 5; i++) {
        await service.retryFailedEvents();
      }
      expect(prismaMock.__events.get(id).retryCount).toBe(5);

      // A 6th tick must not even attempt it anymore (retryCount is no longer < 5).
      const finalResult = await service.retryFailedEvents();
      expect(finalResult).toEqual({ attempted: 0, recovered: 0 });
      // 1 initial failure (seedFailedEvent) + 5 retry attempts = 6 total calls.
      expect(whatsappServiceMock.applyStatusUpdate).toHaveBeenCalledTimes(6);
    });

    it('does not touch events that are not FAILED', async () => {
      const created = await service.acceptOnce('message_status', 'wamid.23:sent', { id: 'wamid.23', status: 'sent' });
      await service.processEvent(created!.id);
      expect(prismaMock.__events.get(created!.id).status).toBe('PROCESSED');

      const result = await service.retryFailedEvents();
      expect(result).toEqual({ attempted: 0, recovered: 0 });
    });
  });
});
