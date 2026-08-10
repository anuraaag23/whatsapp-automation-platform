import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailSenderService } from './senders/email-sender.service';
import { SlackSenderService } from './senders/slack-sender.service';
import { TelegramSenderService } from './senders/telegram-sender.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailSenderService, SlackSenderService, TelegramSenderService],
  exports: [NotificationsService, EmailSenderService],
})
export class NotificationsModule {}
