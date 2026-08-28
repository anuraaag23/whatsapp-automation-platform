import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WEBHOOK_EVENT_STATUS } from '../common/constants/prisma-enums.constants';
import { WhatsappService } from './whatsapp.service';
import { InboundMessageService } from './inbound-message.service';
import { WEBHOOK_EVENT_PROCESS_QUEUE } from './whatsapp.constants';

/** After this many failed attempts, a webhook event is left FAILED permanently rather than retried again. */
const MAX_RETRY_ATTEMPTS = 5;
/** How many failed events a single retry tick will attempt, so one very bad batch can't monopolize a tick. */
const RETRY_BATCH_SIZE = 25;

@Injectable()
export class WebhookEventProcessorService {
  private readonly logger = new Logger(WebhookEventProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly inboundMessageService: InboundMessageService,
    private readonly events: EventEmitter2,
    @InjectQueue(WEBHOOK_EVENT_PROCESS_QUEUE) private readonly processQueue: Queue,
  ) {
    // BullMQ's Queue extends Node's EventEmitter and re-emits its
    // underlying ioredis connection's 'error' events on itself. An
    // EventEmitter that emits 'error' with zero listeners attached throws
    // that error as an UNCAUGHT EXCEPTION (standard Node.js EventEmitter
    // behavior, not a BullMQ quirk) — this queue backs acceptOnce() below,
    // which is on the hot path for every webhook request, so this was the
    // actual root cause of the burst test's intermittent
    // "Connection is closed." / ECONNRESET failures: under light load a
    // transient Redis blip is rare enough this never surfaced, but under
    // 150 concurrent requests it's far more likely, and the resulting
    // uncaught exception destabilizes the shared connection for other
    // in-flight .add() calls, not just the one that hit the blip.
    this.processQueue.on('error', (error) =>
      this.logger.error(`WEBHOOK_EVENT_PROCESS_QUEUE connection error: ${error.message}`, error.stack),
    );
  }

  /**
   * Persists a WebhookEvent row keyed on (provider, externalEventId) — the
   * insert (not a check-then-insert) is what makes this race-safe under
   * concurrent duplicate deliveries, since the database's unique
   * constraint is the actual source of truth — then enqueues the actual
   * business-logic dispatch onto a BullMQ worker rather than running it
   * inline.
   *
   * This split is the fix for a real production risk under Meta delivery
   * bursts: the previous version ran the full handler (which can cascade
   * into further DB work — status updates, and via EventEmitter2's
   * synchronous dispatch, whatever the automation engine's
   * @OnEvent('whatsapp.inbound_message') listener does) synchronously
   * inside the HTTP request, holding a database connection-pool slot for
   * the whole chain. Under concurrent load with a small pool (Prisma's
   * default is `num_cpus * 2 + 1` — as low as 3 on a single-core host),
   * that serializes bursts badly enough to time out or reset connections.
   * Now the request path only ever does one fast INSERT before responding.
   */
  async acceptOnce(
    eventType: string,
    externalEventId: string,
    payload: unknown,
  ): Promise<{ id: string } | undefined> {
    let event: { id: string } | undefined;
    try {
      event = await this.prisma.webhookEvent.create({
        data: {
          provider: 'whatsapp',
          externalEventId,
          eventType,
          payload: payload as Prisma.InputJsonValue,
          status: WEBHOOK_EVENT_STATUS.RECEIVED,
        },
      });
      this.logger.log(`acceptOnce created webhookEvent id=${event.id} for ${eventType}/${externalEventId}`);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Duplicate webhook event skipped: ${eventType}/${externalEventId}`);
        return undefined;
      }
      // A transient failure right here (e.g. a brief DB blip) is the worst
      // case: the event was never persisted at all, so there's nothing for
      // the retry tick to find later. A few quick, immediate retries with
      // short backoff catch most of these without needing the full async
      // retry mechanism for what's usually a sub-second hiccup.
      event = await this.retryCreateOnTransientFailure(eventType, externalEventId, payload, error as Error);
      if (!event) return undefined;
    }

    // Guaranteed non-undefined past this point: the only path that leaves
    // `event` unset also returns early, above. Re-asserted explicitly here
    // (rather than relying on control-flow narrowing across the try/catch)
    // so the rest of this method reads simply.
    if (!event) return undefined;

    await this.processQueue.add(
      'process',
      { eventId: event.id },
      { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
    );

    return event;
  }

  private async retryCreateOnTransientFailure(
    eventType: string,
    externalEventId: string,
    payload: unknown,
    firstError: Error,
  ): Promise<{ id: string } | undefined> {
    this.logger.warn(
      `Transient failure persisting webhook event ${eventType}/${externalEventId}, retrying insert: ${firstError.message}`,
    );
    for (const delayMs of [100, 500]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        return await this.prisma.webhookEvent.create({
          data: {
            provider: 'whatsapp',
            externalEventId,
            eventType,
            payload: payload as Prisma.InputJsonValue,
            status: WEBHOOK_EVENT_STATUS.RECEIVED,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          this.logger.log(`Duplicate webhook event skipped on retry: ${eventType}/${externalEventId}`);
          return undefined;
        }
        // keep trying the remaining delays
      }
    }
    this.logger.error(
      `Failed to persist webhook event ${eventType}/${externalEventId} after retrying — event is lost, not just failed. This should be rare; if it recurs, the database connection itself needs attention.`,
    );
    return undefined;
  }

  /**
   * Runs the actual business logic for one already-persisted event and
   * updates its status accordingly. Called by WebhookEventDispatchProcessor
   * immediately after a live webhook accepts an event (the normal path),
   * and reused by retryFailedEvents below for events that failed and are
   * being tried again later.
   */
  async processEvent(eventId: string): Promise<void> {
    const event = await this.prisma.webhookEvent.findUnique({ where: { id: eventId } });
    if (!event) {
      this.logger.warn(`processEvent called for unknown webhook event id ${eventId}`);
      return;
    }

    this.logger.log(`processEvent starting for ${event.eventType}/${event.externalEventId}, payload keys: ${Object.keys(event.payload || {})}`);
    try {
      await this.dispatchByEventType(event.eventType, event.payload);
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: WEBHOOK_EVENT_STATUS.PROCESSED, processedAt: new Date() },
      });
      this.logger.log(`processEvent completed for ${event.eventType}/${event.externalEventId}`);
    } catch (error) {
      this.logger.error(`processEvent caught error for ${event.eventType}/${event.externalEventId}: ${(error as Error).message}`);
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: WEBHOOK_EVENT_STATUS.FAILED, error: (error as Error).message },
      });
      this.logger.error(`Webhook event handler failed: ${event.eventType}/${event.externalEventId}`, error as Error);
    }
  }

  /**
   * Re-runs the same business logic a live webhook delivery would have
   * run, from the persisted payload alone. This is what actually makes an
   * event recoverable rather than just recorded-as-failed: the full
   * sub-event payload was captured at receipt time specifically so a
   * later retry never needs the original HTTP request.
   */
  async dispatchByEventType(eventType: string, payload: any): Promise<void> {
    this.logger.log(`dispatchByEventType called: eventType=${eventType}, payload keys: ${Object.keys(payload || {})}`);
    switch (eventType) {
      case 'message_status':
        await this.whatsappService.applyStatusUpdate(payload.id, payload.status);
        return;

      case 'template_status_update':
        this.events.emit('whatsapp.template_status_update', {
          waTemplateId: String(payload.message_template_id),
          status: payload.event,
          reason: payload.reason,
        });
        return;

      case 'inbound_message':
        this.logger.log(`dispatchByEventType: calling inboundMessageService.handle for waMessageId=${payload.id}`);
        await this.inboundMessageService.handle(payload);
        this.logger.log(`dispatchByEventType: inboundMessageService.handle returned`);
        return;

      default:
        this.logger.warn(`Unknown webhook eventType "${eventType}" — cannot dispatch, leaving as failed`);
        throw new Error(`Unknown webhook eventType: ${eventType}`);
    }
  }

  /**
   * Finds webhook events stuck in FAILED and re-attempts them from their
   * stored payload, up to MAX_RETRY_ATTEMPTS each. Called by the
   * WebhookEventRetryProcessor on a repeating tick (see whatsapp.module.ts),
   * the same pattern already used for schedule and automation ticks
   * elsewhere in this codebase.
   */
  async retryFailedEvents(): Promise<{ attempted: number; recovered: number }> {
    const candidates = await this.prisma.webhookEvent.findMany({
      where: { status: WEBHOOK_EVENT_STATUS.FAILED, retryCount: { lt: MAX_RETRY_ATTEMPTS } },
      orderBy: { receivedAt: 'asc' },
      take: RETRY_BATCH_SIZE,
    });

    let recovered = 0;
    for (const event of candidates) {
      try {
        await this.dispatchByEventType(event.eventType, event.payload);
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: WEBHOOK_EVENT_STATUS.PROCESSED, processedAt: new Date(), error: null },
        });
        recovered++;
        this.logger.log(
          `Recovered webhook event ${event.eventType}/${event.externalEventId} on retry ${event.retryCount + 1}`,
        );
      } catch (error) {
        const nextRetryCount = event.retryCount + 1;
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: { retryCount: nextRetryCount, error: (error as Error).message },
        });
        if (nextRetryCount >= MAX_RETRY_ATTEMPTS) {
          this.logger.error(
            `Webhook event ${event.eventType}/${event.externalEventId} exhausted ${MAX_RETRY_ATTEMPTS} retries, giving up: ${(error as Error).message}`,
          );
        }
      }
    }

    return { attempted: candidates.length, recovered };
  }
}
