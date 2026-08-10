import { Body, Controller, Get, Logger, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Public } from '../common/decorators/public.decorator';
import { WhatsappService } from './whatsapp.service';

/**
 * Meta's Cloud API webhook contract:
 * - GET: one-time verification handshake when you configure the webhook URL
 *   in the Meta App dashboard (hub.mode / hub.verify_token / hub.challenge).
 * - POST: ongoing delivery of message status updates and inbound messages.
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly whatsappService: WhatsappService,
    private readonly events: EventEmitter2,
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

  @Public()
  @Post()
  async receive(@Body() payload: any) {
    try {
      const entries = payload?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          const value = change.value;

          for (const status of value?.statuses ?? []) {
            await this.whatsappService.applyStatusUpdate(status.id, status.status);
          }

          // Meta sends template approval/rejection updates on this same
          // webhook via a distinct field, separate from message statuses.
          if (change.field === 'message_template_status_update' && value?.message_template_id) {
            this.events.emit('whatsapp.template_status_update', {
              waTemplateId: String(value.message_template_id),
              status: value?.event,
              reason: value?.reason,
            });
          }

          // Inbound messages feed the automation engine's KEYWORD_RECEIVED
          // trigger via an event (kept decoupled from AutomationsModule to
          // avoid a circular module dependency).
          for (const inbound of value?.messages ?? []) {
            this.logger.log(`Inbound WhatsApp message from ${inbound.from}: ${inbound.type}`);
            this.events.emit('whatsapp.inbound_message', {
              phoneNumberId: value?.metadata?.phone_number_id,
              from: inbound.from,
              text: inbound.text?.body ?? '',
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to process WhatsApp webhook payload', error as Error);
    }

    return { received: true };
  }
}
