import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WhatsappClient } from './whatsapp.client';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappSignatureGuard } from './guards/whatsapp-signature.guard';
import { WebhookEventProcessorService } from './webhook-event-processor.service';
import { WebhookEventDispatchProcessor } from './webhook-event-dispatch.processor';
import { WebhookEventRetryProcessor } from './webhook-event-retry.processor';
import { InboundMessageService } from './inbound-message.service';
import { WEBHOOK_EVENT_PROCESS_QUEUE, WEBHOOK_EVENT_RETRY_QUEUE } from './whatsapp.constants';
import { QueueModule } from '../queue/queue.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    NotificationsModule,
    QueueModule,
    BullModule.registerQueue({ name: WEBHOOK_EVENT_PROCESS_QUEUE }, { name: WEBHOOK_EVENT_RETRY_QUEUE }),
    // Neither module imports WhatsappModule back, so this doesn't create a
    // cycle — unlike AutomationsModule, which DOES import WhatsappModule
    // (see webhook-event-processor.service.ts's dispatchByEventType for
    // why automation triggering goes through EventEmitter2 instead of a
    // direct dependency).
    ContactsModule,
    ConversationsModule,
  ],
  controllers: [WhatsappWebhookController],
  providers: [
    WhatsappClient,
    WhatsappService,
    WhatsappSignatureGuard,
    WebhookEventProcessorService,
    WebhookEventDispatchProcessor,
    WebhookEventRetryProcessor,
    InboundMessageService,
  ],
  exports: [WhatsappService, WhatsappClient],
})
export class WhatsappModule implements OnModuleInit {
  private readonly logger = new Logger(WhatsappModule.name);

  constructor(@InjectQueue(WEBHOOK_EVENT_RETRY_QUEUE) private readonly retryQueue: Queue) {
    // See SchedulesService's constructor for why this listener is required
    // — an unhandled 'error' event on a BullMQ Queue is a Node.js
    // uncaught exception, not a caught/logged error.
    this.retryQueue.on('error', (error) => this.logger.error(`WEBHOOK_EVENT_RETRY_QUEUE connection error: ${error.message}`, error.stack));
  }

  /**
   * Registers the repeatable webhook-event-retry tick, same pattern as the
   * schedule and automation ticks elsewhere in this codebase. 5 minutes —
   * consistent with those other ticks (see schedules.module.ts for why
   * that interval specifically, re: managed Redis command volume).
   *
   * Only the RETRY queue needs a repeatable job registered here — the
   * PROCESS queue has no tick; it's driven entirely by
   * WebhookEventProcessorService.acceptOnce() enqueueing a job per
   * webhook sub-event as it arrives.
   */
  async onModuleInit() {
    await this.retryQueue.add(
      'tick',
      {},
      { repeat: { every: 300_000 }, removeOnComplete: true, removeOnFail: 50 },
    );
  }
}
