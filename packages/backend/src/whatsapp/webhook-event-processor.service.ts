import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WEBHOOK_EVENT_STATUS } from '../common/constants/prisma-enums.constants';
import { WhatsappService } from './whatsapp.service';

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
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Persists a WebhookEvent row keyed on (provider, externalEventId) before
   * running `handler`, so a duplicate delivery of the same sub-event is
   * detected and skipped instead of reprocessed. The insert (not a
   * check-then-insert) is what makes this race-safe under concurrent
   * duplicate deliveries — the database's unique constraint is the actual
   * source of truth, this code just reacts to whether it succeeded.
   *
   * Moved here unchanged from the Phase B webhook controller so the retry
   * mechanism (below) can share it rather than duplicating this logic.
   */
  async processOnce(
    eventType: string,
    externalEventId: string,
    payload: unknown,
    handler: () => Promise<void>,
  ): Promise<void> {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Duplicate webhook event skipped: ${eventType}/${externalEventId}`);
        return;
      }
      // A transient failure right here (e.g. a brief DB blip) is the worst
      // case: the event was never persisted at all, so there's nothing for
      // the retry tick below to find later. A few quick, immediate retries
      // with short backoff catch most of these without needing the full
      // async retry mechanism for what's usually a sub-second hiccup.
      event = await this.retryCreateOnTransientFailure(eventType, externalEventId, payload, error as Error);
      if (!event) return;
    }

    // Guaranteed non-undefined past this point: the only path that leaves
    // `event` unset also returns early, above. Re-asserted explicitly here
    // (rather than relying on control-flow narrowing across the try/catch)
    // so the rest of this method reads simply.
    if (!event) return;

    try {
      await handler();
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: WEBHOOK_EVENT_STATUS.PROCESSED, processedAt: new Date() },
      });
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: WEBHOOK_EVENT_STATUS.FAILED, error: (error as Error).message },
      });
      this.logger.error(`Webhook event handler failed: ${eventType}/${externalEventId}`, error as Error);
    }
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
   * Re-runs the same business logic a live webhook delivery would have
   * run, from the persisted payload alone. This is what actually makes an
   * event recoverable rather than just recorded-as-failed: the full
   * sub-event payload was captured at receipt time specifically so a
   * later retry never needs the original HTTP request.
   */
  async dispatchByEventType(eventType: string, payload: any): Promise<void> {
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
        this.logger.log(`Inbound WhatsApp message from ${payload.from}: ${payload.type}`);
        this.events.emit('whatsapp.inbound_message', {
          // Stored alongside the raw Meta message object at receipt time
          // specifically so retries have it — it's not part of Meta's own
          // per-message payload, only the surrounding webhook envelope.
          phoneNumberId: payload._phoneNumberId,
          from: payload.from,
          text: payload.text?.body ?? '',
        });
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
