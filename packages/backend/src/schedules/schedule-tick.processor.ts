import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SCHEDULE_TICK_QUEUE } from '../queue/queue.module';
import { SchedulesService } from './schedules.service';

@Processor(SCHEDULE_TICK_QUEUE)
export class ScheduleTickProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleTickProcessor.name);

  constructor(private readonly schedulesService: SchedulesService) {
    super();
  }

  // See MessageDispatchProcessor for why this is required.
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`ScheduleTickProcessor worker error: ${error.message}`, error.stack);
  }

  async process(_job: Job): Promise<void> {
    const result = await this.schedulesService.runDueSchedules();
    if (result.schedulesRun > 0) {
      this.logger.log(
        `Tick: ${result.schedulesRun} schedule(s) fired, ${result.messagesDispatched} message(s) queued`,
      );
    }
  }
}
