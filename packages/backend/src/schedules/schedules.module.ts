import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { ScheduleTickProcessor } from './schedule-tick.processor';
import { MessageDispatchProcessor } from './message-dispatch.processor';
import { QueueModule, MESSAGE_DISPATCH_QUEUE, SCHEDULE_TICK_QUEUE } from '../queue/queue.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({ name: MESSAGE_DISPATCH_QUEUE }, { name: SCHEDULE_TICK_QUEUE }),
    WhatsappModule,
    ContactsModule,
    CampaignsModule,
  ],
  controllers: [SchedulesController],
  providers: [SchedulesService, ScheduleTickProcessor, MessageDispatchProcessor],
  exports: [SchedulesService],
})
export class SchedulesModule implements OnModuleInit {
  constructor(@InjectQueue(SCHEDULE_TICK_QUEUE) private readonly tickQueue: Queue) {}

  /** Registers the once-a-minute repeatable tick job. Idempotent — BullMQ dedupes by repeat key. */
  async onModuleInit() {
    await this.tickQueue.add(
      'tick',
      {},
      {
        repeat: { every: 60_000 },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }
}
