import { Body, Controller, Get, Logger, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { WebhookEventProcessorService } from './webhook-event-processor.service';
import { WhatsappSignatureGuard } from './guards/whatsapp-signature.guard';

/**
 * Meta's Cloud API webhook contract:
 * - GET: one-time verification handshake when you configure the webhook URL
 *   in the Meta App dashboard (hub.mode / hub.verify_token / hub.challenge).
 * - POST: ongoing delivery of message status updates and inbound messages,
 *   authenticated via the X-Hub-Signature-256 header (see
 *   WhatsappSignatureGuard) rather than the app's normal JWT auth — Meta is
 *   not a logged-in user.
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 *
 * This controller's job is deliberately small: parse Meta's payload shape
 * into per-sub-event (eventType, externalEventId, payload) tuples and hand
 * each off to WebhookEventProcessorService.acceptOnce(), which does one
 * fast, idempotent INSERT and returns — it does NOT run the actual
 * business logic inline. That runs asynchronously on a BullMQ worker
 * (WebhookEventDispatchProcessor), which is what lets this endpoint
 * acknowledge a burst of legitimate Meta deliveries quickly instead of
 * serializing on database connection-pool pressure for the full
 * dispatch chain (WhatsApp status updates, and via EventEmitter2's
 * synchronous dispatch, whatever the automation engine does in response
 * to an inbound message).
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly webhookEventProcessor: WebhookEventProcessorService,
  ) {}

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  // Authenticity here comes from the signature guard, not the global JWT
  // guard (this route is @Public() with respect to JWT — Meta never has an
  // access token). The generic 120 req/min API throttle is still a global
  // guard and would still apply on top of this; the override below gives
  // this specific, now-authenticated route more headroom for legitimate
  // Meta delivery bursts without loosening the limit anywhere else. This
  // is now realistic to rely on, rather than a target the endpoint
  // couldn't actually sustain, because the request path is a single fast
  // INSERT per sub-event instead of the full dispatch chain.
  @Public()
  @UseGuards(WhatsappSignatureGuard)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post()
  async receive(@Body() payload: any) {
    try {
      const entries = payload?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          const value = change.value;

          for (const status of value?.statuses ?? []) {
            // Same WAMID legitimately recurs across sent -> delivered ->
            // read, so the status itself has to be part of the dedupe key,
            // not just the message id.
            await this.webhookEventProcessor.acceptOnce('message_status', `${status.id}:${status.status}`, status);
          }

          // Meta sends template approval/rejection updates on this same
          // webhook via a distinct field, separate from message statuses.
          if (change.field === 'message_template_status_update' && value?.message_template_id) {
            await this.webhookEventProcessor.acceptOnce(
              'template_status_update',
              `${value.message_template_id}:${value.event}`,
              value,
            );
          }

          // Inbound messages feed the automation engine's KEYWORD_RECEIVED
          // trigger via an event (kept decoupled from AutomationsModule to
          // avoid a circular module dependency).
          for (const inbound of value?.messages ?? []) {
            // phone_number_id lives on the surrounding `value.metadata`,
            // not on the individual message object — folded into the
            // stored payload here (not just captured by closure) so a
            // later retry/async-process step has everything
            // dispatchByEventType needs, without needing the original
            // HTTP request.
            const inboundWithContext = { ...inbound, _phoneNumberId: value?.metadata?.phone_number_id };
            await this.webhookEventProcessor.acceptOnce('inbound_message', inbound.id, inboundWithContext);
          }
        }
      }
    } catch (error) {
      // Passing (error as Error).stack, not the raw Error object — Logger's
      // second argument is a stack-trace string; passing the Error itself
      // was only surfacing error.message in the logs, hiding exactly where
      // the throw originated (acceptOnce's Prisma insert vs. its queue.add()
      // call vs. something else entirely).
      this.logger.error('Failed to process WhatsApp webhook payload', (error as Error).stack);
    }

    return { received: true };
  }
}
