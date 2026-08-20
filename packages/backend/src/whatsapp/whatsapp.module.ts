import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WhatsappClient } from './whatsapp.client';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappSignatureGuard } from './guards/whatsapp-signature.guard';
import { WebhookEventProcessorService } from './webhook-event-processor.service';
import { WebhookEventRetryProcessor } from './webhook-event-retry.processor';
import { WEBHOOK_EVENT_RETRY_QUEUE } from './whatsapp.constants';
import { QueueModule } from '../queue/queue.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule, QueueModule, BullModule.registerQueue({ name: WEBHOOK_EVENT_RETRY_QUEUE })],
  controllers: [WhatsappWebhookController],
  providers: [
    WhatsappClient,
    WhatsappService,
    WhatsappSignatureGuard,
    WebhookEventProcessorService,
    WebhookEventRetryProcessor,
  ],
  exports: [WhatsappService, WhatsappClient],
})
export class WhatsappModule implements OnModuleInit {
  constructor(@InjectQueue(WEBHOOK_EVENT_RETRY_QUEUE) private readonly retryQueue: Queue) {}

  /**
   * Registers the repeatable webhook-event-retry tick, same pattern as the
   * schedule and automation ticks elsewhere in this codebase. 5 minutes —
   * consistent with those other ticks (see schedules.module.ts for why
   * that interval specifically, re: managed Redis command volume).
   */
  async onModuleInit() {
    await this.retryQueue.add(
      'tick',
      {},
      { repeat: { every: 300_000 }, removeOnComplete: true, removeOnFail: 50 },
    );
  }
}
