import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL } from '../common/constants/prisma-enums.constants';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { EmailSenderService } from './senders/email-sender.service';
import { SlackSenderService } from './senders/slack-sender.service';
import { TelegramSenderService } from './senders/telegram-sender.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly emailSender: EmailSenderService,
    private readonly slackSender: SlackSenderService,
    private readonly telegramSender: TelegramSenderService,
  ) {}

  /**
   * Creates the in-app notification row (what the bell dropdown reads) and,
   * if the org has channels configured in Settings, also delivers to
   * email/Slack/Telegram for real — actual SMTP send, actual webhook POST,
   * actual Bot API call. Channel delivery is fire-and-forget: a failed
   * external send never blocks the in-app notification from being created.
   */
  async notify(
    organizationId: string,
    userId: string | null,
    title: string,
    body: string,
    metadata: Record<string, unknown> = {},
  ) {
    const created = await this.prisma.notification.create({
      data: {
        organizationId,
        userId,
        channel: NOTIFICATION_CHANNEL.IN_APP,
        title,
        body,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    this.dispatchToChannels(organizationId, title, body).catch((error) =>
      this.logger.warn(`Channel dispatch failed: ${(error as Error).message}`),
    );

    return created;
  }

  private async dispatchToChannels(organizationId: string, title: string, body: string) {
    const settings = await this.prisma.notificationSettings.findUnique({ where: { organizationId } });
    if (!settings) return;

    if (settings.emailEnabled && settings.smtpHost && settings.smtpPort && settings.notifyEmailTo) {
      const sent = await this.emailSender.send({
        host: settings.smtpHost,
        port: settings.smtpPort,
        user: settings.smtpUser ?? '',
        password: settings.smtpPasswordCiphertext ? this.crypto.decrypt(settings.smtpPasswordCiphertext) : '',
        from: settings.smtpFromAddress ?? settings.smtpUser ?? 'no-reply@example.com',
        to: settings.notifyEmailTo,
        subject: title,
        text: body,
      });
      await this.logChannelAttempt(organizationId, 'EMAIL', sent);
    }

    if (settings.slackEnabled && settings.slackWebhookUrl) {
      const sent = await this.slackSender.send(settings.slackWebhookUrl, title, body);
      await this.logChannelAttempt(organizationId, 'SLACK', sent);
    }

    if (settings.telegramEnabled && settings.telegramBotTokenCiphertext && settings.telegramChatId) {
      const sent = await this.telegramSender.send(
        this.crypto.decrypt(settings.telegramBotTokenCiphertext),
        settings.telegramChatId,
        title,
        body,
      );
      await this.logChannelAttempt(organizationId, 'TELEGRAM', sent);
    }
  }

  private async logChannelAttempt(organizationId: string, channel: string, success: boolean) {
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: 'notification.channel_dispatch',
        entityType: 'Notification',
        status: success ? 'success' : 'failed',
        metadata: { channel } as Prisma.InputJsonValue,
      },
    });
  }

  async list(organizationId: string, userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        organizationId,
        OR: [{ userId }, { userId: null }],
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(organizationId: string, userId: string) {
    return this.prisma.notification.count({
      where: { organizationId, OR: [{ userId }, { userId: null }], isRead: false },
    });
  }

  async markRead(organizationId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, organizationId },
      data: { isRead: true },
    });
  }

  async markAllRead(organizationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { organizationId, OR: [{ userId }, { userId: null }], isRead: false },
      data: { isRead: true },
    });
  }
}
