import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Contact, Message, MessageStatus, MessageType, Prisma, WhatsappAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MESSAGE_STATUS, MESSAGE_TYPE } from '../common/constants/prisma-enums.constants';
import { WhatsappClient, WhatsappSendResult } from './whatsapp.client';
import { QuotaService, QuotaExceededException } from '../quota/quota.service';

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
    private readonly conversations: ConversationsService,
    private readonly quota: QuotaService,
  ) {}

  /**
   * Sends a message to a contact through the org's connected WhatsApp
   * account and writes the resulting Message row (QUEUED -> SENT/FAILED).
   * Delivery/read status is updated later by the webhook handler.
   *
   * Every outbound message — ad hoc reply, campaign send, scheduled send,
   * or automation action — goes through this one method, so every one of
   * them is linked to the contact's conversation here rather than each
   * call site re-deriving (or forgetting to derive) that link. Without
   * this, an agent's reply from the inbox wouldn't show up in that same
   * inbox thread, and the conversation list's "last message" would never
   * reflect anything the business sent, only what came in.
   *
   * This is also the single enforcement point for opt-out: every send
   * path (campaign dispatch, schedule dispatch, ad hoc compose, automation
   * `send_message` nodes) funnels through here, so a contact who has
   * opted out cannot be messaged via any path that forgets to check first
   * — see the optInStatus check below. Callers may still check it earlier
   * themselves for a friendlier error message (MessagesService.sendAdHoc
   * does, for the compose UI), but this check is the one that actually
   * has to hold for every caller, present and future.
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

    const conversation = await this.conversations.findOrCreateForContact(params.organizationId, params.contactId);

    const message = await this.prisma.message.create({
      data: {
        organizationId: params.organizationId,
        contactId: params.contactId,
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        type: params.type,
        content: params.content as Prisma.InputJsonValue,
        status: MESSAGE_STATUS.QUEUED,
        campaignId: params.campaignId,
        scheduleId: params.scheduleId,
      },
    });

    if (contact.optInStatus !== 'OPTED_IN') {
      this.logger.warn(
        `Skipping send to contact ${contact.id}: optInStatus is ${contact.optInStatus}, not OPTED_IN`,
      );
      const failed = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MESSAGE_STATUS.FAILED,
          errorCode: 'NOT_OPTED_IN',
          errorMessage: `Contact opt-in status is ${contact.optInStatus}, not OPTED_IN`,
          failedAt: new Date(),
        },
      });
      await this.touchConversationForOutbound(conversation.id);
      return failed;
    }

    try {
      await this.quota.assertWithinLimit(params.organizationId, 'messagesPerMonth');
    } catch (error) {
      if (error instanceof QuotaExceededException) {
        const failed = await this.prisma.message.update({
          where: { id: message.id },
          data: {
            status: MESSAGE_STATUS.FAILED,
            errorCode: 'QUOTA_EXCEEDED',
            errorMessage: error.message,
            failedAt: new Date(),
          },
        });
        await this.touchConversationForOutbound(conversation.id);
        return failed;
      }
      throw error;
    }

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

      const failed = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MESSAGE_STATUS.FAILED,
          errorCode: 'NO_ACCOUNT_CONNECTED',
          errorMessage: 'No WhatsApp Business account is connected for this organization',
          failedAt: new Date(),
        },
      });
      await this.touchConversationForOutbound(conversation.id);
      return failed;
    }

    const result = await this.dispatchToProvider(account, contact, params.type, params.content);

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
    }).then(async (updated) => {
      await this.touchConversationForOutbound(conversation.id);
      return updated;
    });
  }

  /**
   * Re-attempts a previously FAILED outbound message, reusing its stored
   * type/content rather than sending anything new — this is what
   * MessageRetryService calls for messages classified as retryable (see
   * whatsapp.constants.ts). Updates the SAME Message row rather than
   * creating a new one, so a retried send never shows up as a second,
   * separate message in the inbox/analytics — it's still one logical send
   * attempt with a growing retryCount, exactly like the WebhookEvent retry
   * pattern this mirrors.
   *
   * Re-verifies org scoping, contact existence, and opt-in status all over
   * again rather than trusting the state at original send time — a
   * contact can opt out (or a whole contact/account can be removed)
   * between the original attempt and a retry running minutes later, and
   * this must not send to someone who is no longer eligible.
   */
  async retrySend(organizationId: string, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, organizationId, direction: 'OUTBOUND', status: MESSAGE_STATUS.FAILED },
    });
    if (!message) throw new NotFoundException('Failed outbound message not found');

    const contact = await this.prisma.contact.findFirst({
      where: { id: message.contactId, organizationId },
    });

    if (!contact) {
      return this.finalizeRetry(message, {
        success: false,
        errorCode: 'CONTACT_NOT_FOUND',
        errorMessage: 'Contact no longer exists',
      });
    }

    if (contact.optInStatus !== 'OPTED_IN') {
      return this.finalizeRetry(message, {
        success: false,
        errorCode: 'NOT_OPTED_IN',
        errorMessage: `Contact opt-in status is ${contact.optInStatus}, not OPTED_IN`,
      });
    }

    const account = await this.prisma.whatsappAccount.findUnique({ where: { organizationId } });
    if (!account) {
      return this.finalizeRetry(message, {
        success: false,
        errorCode: 'NO_ACCOUNT_CONNECTED',
        errorMessage: 'No WhatsApp Business account is connected for this organization',
      });
    }

    try {
      await this.quota.assertWithinLimit(organizationId, 'messagesPerMonth');
    } catch (error) {
      if (error instanceof QuotaExceededException) {
        return this.finalizeRetry(message, {
          success: false,
          errorCode: 'QUOTA_EXCEEDED',
          errorMessage: error.message,
        });
      }
      throw error;
    }

    const result = await this.dispatchToProvider(
      account,
      contact,
      message.type,
      message.content as Record<string, unknown>,
    );
    return this.finalizeRetry(message, result);
  }

  private async finalizeRetry(message: Message, result: WhatsappSendResult) {
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: result.success
        ? { status: MESSAGE_STATUS.SENT, waMessageId: result.waMessageId, sentAt: new Date(), errorCode: null, errorMessage: null }
        : {
            status: MESSAGE_STATUS.FAILED,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            failedAt: new Date(),
            retryCount: { increment: 1 },
          },
    });
    if (message.conversationId) {
      await this.touchConversationForOutbound(message.conversationId);
    }
    return updated;
  }

  /** The actual outbound Graph API call, shared by sendToContact and retrySend so both go through identical request-shaping logic. */
  private async dispatchToProvider(
    account: WhatsappAccount,
    contact: Contact,
    type: MessageType,
    content: Record<string, unknown>,
  ): Promise<WhatsappSendResult> {
    // Access tokens are encrypted at rest (AES-256-GCM, see CryptoService)
    // and only ever decrypted in-process, right before the outbound call.
    const accessToken = this.crypto.decrypt(account.accessTokenCiphertext);

    if (type === MESSAGE_TYPE.TEMPLATE) {
      const tpl = content as { name: string; language: string; components?: any[] };
      return this.client.sendTemplate({
        phoneNumberId: account.phoneNumberId,
        accessToken,
        to: contact.phoneNumber,
        templateName: tpl.name,
        languageCode: tpl.language,
        components: tpl.components,
      });
    }
    if (MEDIA_TYPES.includes(type)) {
      const media = content as { link: string; caption?: string };
      return this.client.sendMedia({
        phoneNumberId: account.phoneNumberId,
        accessToken,
        to: contact.phoneNumber,
        type: type.toLowerCase() as 'image' | 'video' | 'audio' | 'document',
        link: media.link,
        caption: media.caption,
      });
    }
    const text = content as { body: string };
    return this.client.sendText({
      phoneNumberId: account.phoneNumberId,
      accessToken,
      to: contact.phoneNumber,
      body: text.body,
    });
  }

  /** Marks the conversation as having just had an outbound message sent on it — drives the inbox list's ordering and "last message" preview. */
  private async touchConversationForOutbound(conversationId: string) {
    const now = new Date();
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, lastOutboundAt: now },
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
