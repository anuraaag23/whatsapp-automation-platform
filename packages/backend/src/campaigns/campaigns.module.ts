import { Module } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { QueueModule } from '../queue/queue.module';
import { ContactsModule } from '../contacts/contacts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    // MESSAGE_DISPATCH_QUEUE comes from QueueModule's own export now — see
    // its docstring. Do not re-register it here with BullModule.registerQueue;
    // that would recreate the redundant-connection problem this was fixed for.
    QueueModule,
    ContactsModule,
    NotificationsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
