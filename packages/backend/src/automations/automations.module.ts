import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AutomationsService } from './automations.service';
import { AutomationsController } from './automations.controller';
import { AutomationWebhookController } from './automation-webhook.controller';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationRunProcessor } from './automation-run.processor';
import { AutomationScheduleTickProcessor } from './automation-schedule-tick.processor';
import { AUTOMATION_RUN_QUEUE, AUTOMATION_SCHEDULE_TICK_QUEUE } from './automations.constants';
import { QueueModule } from '../queue/queue.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AiModule } from '../ai/ai.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({ name: AUTOMATION_RUN_QUEUE }, { name: AUTOMATION_SCHEDULE_TICK_QUEUE }),
    WhatsappModule,
    AiModule,
    ContactsModule,
  ],
  controllers: [AutomationsController, AutomationWebhookController],
  providers: [
    AutomationsService,
    AutomationEngineService,
    AutomationRunProcessor,
    AutomationScheduleTickProcessor,
  ],
  exports: [AutomationsService],
})
export class AutomationsModule implements OnModuleInit {
  private readonly logger = new Logger(AutomationsModule.name);

  constructor(@InjectQueue(AUTOMATION_SCHEDULE_TICK_QUEUE) private readonly tickQueue: Queue) {
    // See SchedulesService's constructor for why this listener is required
    // — an unhandled 'error' event on a BullMQ Queue is a Node.js
    // uncaught exception, not a caught/logged error.
    this.tickQueue.on('error', (error) => this.logger.error(`AUTOMATION_SCHEDULE_TICK_QUEUE connection error: ${error.message}`, error.stack));
  }

  /** Registers the repeatable job that checks SCHEDULE-triggered automations. Widened from 60s to 5min — see schedules.module.ts for why. */
  async onModuleInit() {
    await this.tickQueue.add(
      'tick',
      {},
      { repeat: { every: 300_000 }, removeOnComplete: true, removeOnFail: 50 },
    );
  }
}
