import { Module } from '@nestjs/common';
import { WhatsappClient } from './whatsapp.client';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [WhatsappWebhookController],
  providers: [WhatsappClient, WhatsappService],
  exports: [WhatsappService, WhatsappClient],
})
export class WhatsappModule {}
