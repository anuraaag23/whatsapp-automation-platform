import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WEBHOOK_EVENT_PROCESS_QUEUE } from './whatsapp.constants';
import { WebhookEventProcessorService } from './webhook-event-processor.service';

/**
 * Picks up webhook events immediately after they're persisted by
 * WebhookEventProcessorService.acceptOnce() and runs the actual dispatch
 * logic (WhatsApp status updates, inbound-message events, etc.) here
 * instead of inline in the HTTP request. Concurrency of 10 lets bursts
 * drain quickly without reintroducing the same connection-pool pressure a
 * synchronous burst caused — see the acceptOnce() docstring in
 * webhook-event-processor.service.ts for the full reasoning.
 */
@Processor(WEBHOOK_EVENT_PROCESS_QUEUE, { concurrency: 10 })
export class WebhookEventDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookEventDispatchProcessor.name);

  constructor(private readonly webhookEventProcessor: WebhookEventProcessorService) {
    super();
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} started (eventId=${job.data?.eventId})`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed (eventId=${job.data?.eventId})`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    // The event itself is already durably persisted (acceptOnce ran before
    // this job was ever enqueued) and WebhookEventProcessorService.
    // processEvent marks it FAILED for the retry tick to pick up — this
    // handler only surfaces the worker-level failure, it never needs to
    // recover anything itself.
    this.logger.error(`Job ${job.id} failed (eventId=${job.data?.eventId}): ${error.message}`, error.stack);
  }

  // A worker-level 'error' (e.g. a lost Redis connection) is distinct from
  // a job 'failed' event and must never be swallowed — it can indicate the
  // whole worker has stopped consuming jobs, which is exactly the kind of
  // failure a burst test or production incident needs to be loud about.
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`WebhookEventDispatchProcessor worker error: ${error.message}`, error.stack);
  }

  async process(job: Job<{ eventId: string }>): Promise<void> {
    await this.webhookEventProcessor.processEvent(job.data.eventId);
  }
}
