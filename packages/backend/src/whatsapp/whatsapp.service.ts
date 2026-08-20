import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MessageStatus, MessageType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MESSAGE_STATUS, MESSAGE_TYPE } from '../common/constants/prisma-enums.constants';
import { WhatsappClient } from './whatsapp.client';

interface SendToContactParams {
  organizationId: string;
  contactId: string;
  type: MessageType;
  content: Record<string, unknown>;
  campaignId?: string;
  scheduleId?: string;
}

const MEDIA_TYPES: MessageType[] = [
  MESSAGE_TYPE.IMAGE,
  MESSAGE_TYPE.VIDEO,
  MESSAGE_TYPE.AUDIO,
  MESSAGE_TYPE.DOCUMENT,
];

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private lastNoAccountWarningAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WhatsappClient,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Sends a message to a contact through the org's connected WhatsApp
   * account and writes the resulting Message row (QUEUED -> SENT/FAILED).
   * Delivery/read status is updated later by the webhook handler.
   */
  async sendToContact(params: SendToContactParams) {
    const [account, contact] = await Promise.all([
      this.prisma.whatsappAccount.findUnique({ where: { organizationId: params.organizationId } }),
      // Scoped by (id, organizationId) together, not just id — without
      // this, a contactId belonging to a different organization would
      // resolve successfully here, and this org's WhatsApp account would
      // send a message to someone else's contact. Every caller of
      // sendToContact relies on this method being the actual tenant
      // boundary, so the check has to live here, not be re-implemented (or
      // forgotten) at each call site.
      this.prisma.contact.findFirst({ where: { id: params.contactId, organizationId: params.organizationId } }),
    ]);

    // Deliberately the same "not found" whether the contact genuinely
    // doesn't exist or exists but belongs to another org — a caller has no
    // legitimate reason to distinguish those two cases, and doing so would
    // let them enumerate other organizations' contact IDs.
    if (!contact) throw new NotFoundException('Contact not found');

    const message = await this.prisma.message.create({
      data: {
        organizationId: params.organizationId,
        contactId: params.contactId,
        direction: 'OUTBOUND',
        type: params.type,
        content: params.content as Prisma.InputJsonValue,
        status: MESSAGE_STATUS.QUEUED,
        campaignId: params.campaignId,
        scheduleId: params.scheduleId,
      },
    });

    if (!account) {
      this.logger.warn(
        `No WhatsApp account connected for org ${params.organizationId}; message ${message.id} left QUEUED`,
      );

      // Throttle to once every 10 minutes per org so a burst of scheduled
      // sends with no account connected doesn't flood the notification feed.
      const lastWarned = this.lastNoAccountWarningAt.get(params.organizationId) ?? 0;
      if (Date.now() - lastWarned > 10 * 60 * 1000) {
        this.lastNoAccountWarningAt.set(params.organizationId, Date.now());
        await this.notifications.notify(
          params.organizationId,
          null,
          'No WhatsApp account connected',
          'Messages are queuing up but cannot send until a WhatsApp Business account is connected in Settings.',
        );
      }

      return this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MESSAGE_STATUS.FAILED,
          errorCode: 'NO_ACCOUNT_CONNECTED',
          errorMessage: 'No WhatsApp Business account is connected for this organization',
          failedAt: new Date(),
        },
      });
    }

    // Access tokens are encrypted at rest (AES-256-GCM, see CryptoService)
    // and only ever decrypted in-process, right before the outbound call.
    const accessToken = this.crypto.decrypt(account.accessTokenCiphertext);

    let result;
    if (params.type === MESSAGE_TYPE.TEMPLATE) {
      const tpl = params.content as { name: string; language: string; components?: any[] };
      result = await this.client.sendTemplate({
        phoneNumberId: account.phoneNumberId,
        accessToken,
        to: contact.phoneNumber,
        templateName: tpl.name,
        languageCode: tpl.language,
        components: tpl.components,
      });
    } else if (MEDIA_TYPES.includes(params.type)) {
      const media = params.content as { link: string; caption?: string };
      result = await this.client.sendMedia({
        phoneNumberId: account.phoneNumberId,
        accessToken,
        to: contact.phoneNumber,
        type: params.type.toLowerCase() as 'image' | 'video' | 'audio' | 'document',
        link: media.link,
        caption: media.caption,
      });
    } else {
      const text = params.content as { body: string };
      result = await this.client.sendText({
        phoneNumberId: account.phoneNumberId,
        accessToken,
        to: contact.phoneNumber,
        body: text.body,
      });
    }

    return this.prisma.message.update({
      where: { id: message.id },
      data: result.success
        ? { status: MESSAGE_STATUS.SENT, waMessageId: result.waMessageId, sentAt: new Date() }
        : {
            status: MESSAGE_STATUS.FAILED,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            failedAt: new Date(),
          },
    });
  }

  /** Applies a Meta status webhook payload (sent/delivered/read/failed) to our Message row. */
  async applyStatusUpdate(waMessageId: string, status: 'sent' | 'delivered' | 'read' | 'failed') {
    const message = await this.prisma.message.findFirst({ where: { waMessageId } });
    if (!message) return;

    const statusMap: Record<typeof status, MessageStatus> = {
      sent: MESSAGE_STATUS.SENT,
      delivered: MESSAGE_STATUS.DELIVERED,
      read: MESSAGE_STATUS.READ,
      failed: MESSAGE_STATUS.FAILED,
    };

    const timestampField =
      status === 'delivered'
        ? 'deliveredAt'
        : status === 'read'
          ? 'readAt'
          : status === 'failed'
            ? 'failedAt'
            : 'sentAt';

    await this.prisma.message.update({
      where: { id: message.id },
      data: { status: statusMap[status], [timestampField]: new Date() },
    });
  }
}
