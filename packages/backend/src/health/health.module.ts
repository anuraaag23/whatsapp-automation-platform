import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { QueueModule, MESSAGE_DISPATCH_QUEUE } from '../queue/queue.module';

@Module({
  imports: [QueueModule, BullModule.registerQueue({ name: MESSAGE_DISPATCH_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}
