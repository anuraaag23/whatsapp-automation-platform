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
import { MessageRetryService } from './message-retry.service';
import { MessageRetryProcessor } from './message-retry.processor';
import { WEBHOOK_EVENT_PROCESS_QUEUE, WEBHOOK_EVENT_RETRY_QUEUE, MESSAGE_RETRY_QUEUE } from './whatsapp.constants';
import { QueueModule } from '../queue/queue.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [
    NotificationsModule,
    QueueModule,
    BullModule.registerQueue(
      { name: WEBHOOK_EVENT_PROCESS_QUEUE },
      { name: WEBHOOK_EVENT_RETRY_QUEUE },
      { name: MESSAGE_RETRY_QUEUE },
    ),
    // Neither module imports WhatsappModule back, so this doesn't create a
    // cycle — unlike AutomationsModule, which DOES import WhatsappModule
    // (see webhook-event-processor.service.ts's dispatchByEventType for
    // why automation triggering goes through EventEmitter2 instead of a
    // direct dependency). CampaignsModule is the same: it imports
    // ContactsModule/NotificationsModule/AuditModule/QueueModule, none of
    // which loop back to WhatsappModule either, so MessageRetryService can
    // safely depend on CampaignsService to mirror a recovered/exhausted
    // retry onto the CampaignRecipient row it belongs to.
    ContactsModule,
    ConversationsModule,
    CampaignsModule,
    QuotaModule,
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
    MessageRetryService,
    MessageRetryProcessor,
  ],
  exports: [WhatsappService, WhatsappClient, InboundMessageService, WebhookEventProcessorService],
})
export class WhatsappModule implements OnModuleInit {
  private readonly logger = new Logger(WhatsappModule.name);

  constructor(
    @InjectQueue(WEBHOOK_EVENT_RETRY_QUEUE) private readonly retryQueue: Queue,
    @InjectQueue(MESSAGE_RETRY_QUEUE) private readonly messageRetryQueue: Queue,
  ) {
    // See SchedulesService's constructor for why this listener is required
    // — an unhandled 'error' event on a BullMQ Queue is a Node.js
    // uncaught exception, not a caught/logged error.
    this.retryQueue.on('error', (error) => this.logger.error(`WEBHOOK_EVENT_RETRY_QUEUE connection error: ${error.message}`, error.stack));
    this.messageRetryQueue.on('error', (error) => this.logger.error(`MESSAGE_RETRY_QUEUE connection error: ${error.message}`, error.stack));
  }

  /**
   * Registers the repeatable webhook-event-retry and message-retry ticks,
   * same pattern as the schedule and automation ticks elsewhere in this
   * codebase. 5 minutes — consistent with those other ticks (see
   * schedules.module.ts for why that interval specifically, re: managed
   * Redis command volume).
   *
   * Only the RETRY queues need a repeatable job registered here — the
   * webhook PROCESS queue has no tick; it's driven entirely by
   * WebhookEventProcessorService.acceptOnce() enqueueing a job per
   * webhook sub-event as it arrives, and message dispatch has no separate
   * process queue at all (MESSAGE_DISPATCH_QUEUE in schedules/campaigns
   * covers first-attempt sends; this tick only covers retries of those).
   */
  async onModuleInit() {
    await this.retryQueue.add(
      'tick',
      {},
      { repeat: { every: 300_000 }, removeOnComplete: true, removeOnFail: 50 },
    );
    await this.messageRetryQueue.add(
      'tick',
      {},
      { repeat: { every: 300_000 }, removeOnComplete: true, removeOnFail: 50 },
    );
  }
}
