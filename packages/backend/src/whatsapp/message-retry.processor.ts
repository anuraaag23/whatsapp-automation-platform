import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MESSAGE_RETRY_QUEUE } from './whatsapp.constants';
import { MessageRetryService } from './message-retry.service';

@Processor(MESSAGE_RETRY_QUEUE)
export class MessageRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageRetryProcessor.name);

  constructor(private readonly messageRetryService: MessageRetryService) {
    super();
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`MessageRetryProcessor worker error: ${error.message}`, error.stack);
  }

  async process(): Promise<void> {
    await this.messageRetryService.retryEligibleMessages();
  }
}
