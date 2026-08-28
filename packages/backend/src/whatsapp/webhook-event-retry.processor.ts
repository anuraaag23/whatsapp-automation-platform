import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WEBHOOK_EVENT_RETRY_QUEUE } from './whatsapp.constants';
import { WebhookEventProcessorService } from './webhook-event-processor.service';

@Processor(WEBHOOK_EVENT_RETRY_QUEUE)
export class WebhookEventRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookEventRetryProcessor.name);

  constructor(private readonly webhookEventProcessor: WebhookEventProcessorService) {
    super();
  }

  // See MessageDispatchProcessor for why this is required.
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`WebhookEventRetryProcessor worker error: ${error.message}`, error.stack);
  }

  async process(_job: Job): Promise<void> {
    const result = await this.webhookEventProcessor.retryFailedEvents();
    if (result.attempted > 0) {
      this.logger.log(`Webhook retry tick: ${result.recovered}/${result.attempted} recovered`);
    }
  }
}
