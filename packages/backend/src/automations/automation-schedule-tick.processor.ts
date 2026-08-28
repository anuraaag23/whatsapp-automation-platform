import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AUTOMATION_SCHEDULE_TICK_QUEUE } from './automations.constants';
import { AutomationsService } from './automations.service';

@Processor(AUTOMATION_SCHEDULE_TICK_QUEUE)
export class AutomationScheduleTickProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationScheduleTickProcessor.name);

  constructor(private readonly automationsService: AutomationsService) {
    super();
  }

  // See MessageDispatchProcessor for why this is required.
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`AutomationScheduleTickProcessor worker error: ${error.message}`, error.stack);
  }

  async process(_job: Job): Promise<void> {
    const result = await this.automationsService.runDueScheduledAutomations();
    if (result.runsStarted > 0) {
      this.logger.log(`Schedule tick: ${result.runsStarted} automation run(s) started`);
    }
  }
}
