import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { QueueModule, MESSAGE_DISPATCH_QUEUE } from '../queue/queue.module';
import { ContactsModule } from '../contacts/contacts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue({ name: MESSAGE_DISPATCH_QUEUE }),
    ContactsModule,
    NotificationsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
