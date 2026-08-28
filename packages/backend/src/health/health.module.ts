import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  // MESSAGE_DISPATCH_QUEUE comes from QueueModule's own export now — see
  // its docstring. Do not re-register it here with BullModule.registerQueue.
  imports: [QueueModule],
  controllers: [HealthController],
})
export class HealthModule {}
