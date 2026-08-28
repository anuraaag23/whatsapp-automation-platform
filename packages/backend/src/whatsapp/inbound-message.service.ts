import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MESSAGE_STATUS, MESSAGE_TYPE, MESSAGE_DIRECTION, CONVERSATION_STATUS } from '../common/constants/prisma-enums.constants';

interface MappedContent {
  type: (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];
  content: Record<string, unknown>;
  /** Plain-text summary used for automation keyword matching; empty for non-text types. */
  text: string;
}

@Injectable()
export class InboundMessageService {
  private readonly logger = new Logger(InboundMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly conversationsService: ConversationsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Persists one inbound WhatsApp message end to end: resolve the
   * receiving account -> find-or-create the contact -> find-or-create the
   * conversation -> persist the Message -> update the conversation ->
   * trigger automation as a best-effort last step.
   *
   * Called from WebhookEventProcessorService.dispatchByEventType for both
   * the live async-processing path and the retry path — same method
   * either way, so a retried inbound message goes through exactly the same
   * persistence logic as a fresh one, from the same stored payload.
   *
   * Idempotency: The unique index on Message.waMessageId ensures that a
   * retried webhook event (or a Meta redelivery that slipped past the
   * webhook-event-level dedup) will not create a duplicate Message row.
   * If the message already exists, we skip the conversation update and
   * automation event emission entirely — the first processing already did it.
   */
  async handle(payload: any): Promise<void> {
    const phoneNumberId: string | undefined = payload._phoneNumberId;
    if (!phoneNumberId) {
      this.logger.warn('Inbound message payload missing _phoneNumberId — cannot resolve organization, dropping');
      return;
    }

    // The organization boundary for an inbound message is derived ONLY
    // from which of OUR phone numbers received it — never from anything
    // in the payload the sender controls.
    const account = await this.prisma.whatsappAccount.findFirst({ where: { phoneNumberId } });
    if (!account) {
      this.logger.warn(`Inbound message for unknown phoneNumberId ${phoneNumberId} — no connected account, dropping`);
      return;
    }
    const organizationId = account.organizationId;

    const contact = await this.findOrCreateContact(organizationId, payload.from);
    const conversation = await this.conversationsService.findOrCreateForContact(organizationId, contact.id);
    const mapped = this.mapInboundContent(payload);

    // Idempotency check: if a message with this waMessageId already exists
    // in this organization, the inbound was already processed (either by a
    // previous attempt of this same webhook event, or by a Meta redelivery).
    // Skip all downstream effects — message, conversation update, automation.
    const existingMessage = await this.prisma.message.findFirst({
      where: { organizationId, waMessageId: payload.id },
    });
    if (existingMessage) {
      this.logger.log(`Inbound message ${payload.id} already exists (id=${existingMessage.id}), skipping duplicate processing`);
      return;
    }

    // The findFirst check above is a fast path, not the source of truth —
    // it narrows the window but two concurrent deliveries of the same
    // waMessageId can both pass it before either commits. The unique index
    // on (organizationId, waMessageId) is what actually guarantees exactly
    // one Message row; a P2002 here means the other delivery won the race,
    // so we re-read its row and treat this attempt as the idempotent skip
    // above, rather than surfacing a spurious failure.
    let message;
    try {
      message = await this.prisma.message.create({
        data: {
          organizationId,
          contactId: contact.id,
          conversationId: conversation.id,
          direction: MESSAGE_DIRECTION.INBOUND,
          type: mapped.type as MessageType,
          content: mapped.content as Prisma.InputJsonValue,
          status: MESSAGE_STATUS.DELIVERED,
          waMessageId: payload.id,
          providerTimestamp: parseProviderTimestamp(payload.timestamp),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.message.findFirst({
          where: { organizationId, waMessageId: payload.id },
        });
        if (winner) {
          this.logger.log(
            `Inbound message ${payload.id} was created concurrently (id=${winner.id}), skipping duplicate processing`,
          );
          return;
        }
      }
      throw error;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastInboundAt: new Date(),
        unreadCount: { increment: 1 },
        // A new message reopens a conversation the team had marked
        // resolved — an ARCHIVED conversation is left alone (that's a
        // deliberate "stop showing me this" state, not just "done for
        // now"), matching normal inbox-product expectations without this
        // phase needing to build the UI that would make that choice
        // configurable.
        ...(conversation.status === CONVERSATION_STATUS.RESOLVED ? { status: CONVERSATION_STATUS.OPEN } : {}),
      },
    });

    // Automation triggering is best-effort from here on: nothing below
    // this point may cause the message/conversation that's already
    // committed above to look lost or failed. If a downstream automation
    // listener throws, this is caught and logged, not propagated — a
    // caller further up (WebhookEventProcessorService.processEvent) must
    // never see this as a reason to mark the whole inbound event FAILED
    // when the actual data is safely persisted.
    try {
      const eventData = {
        organizationId,
        contactId: contact.id,
        conversationId: conversation.id,
        messageId: message.id,
        phoneNumberId,
        from: payload.from,
        text: mapped.text,
      };
      const emitResult = this.events.emit('whatsapp.inbound_message', eventData);
    } catch (error) {
      this.logger.error(
        `Automation trigger for inbound message ${message.id} failed; message and conversation remain persisted`,
        error as Error,
      );
    }
  }

  /**
   * Reuses ContactsService.create() (the same path the Contacts API uses)
   * rather than inserting a Contact directly — this keeps opt-in defaults,
   * the `contact.created` event (which the CONTACT_CREATED automation
   * trigger listens for), and any future validation in exactly one place.
   * A P2002 here means a concurrent inbound message from the same brand
   * -new contact won the race; re-reading is correct, not a real error.
   */
  private async findOrCreateContact(organizationId: string, phoneNumber: string) {
    const existing = await this.prisma.contact.findFirst({ where: { organizationId, phoneNumber } });
    if (existing) return existing;

    try {
      const created = await this.contactsService.create(organizationId, { phoneNumber });
      return created;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      ) {
        const created = await this.prisma.contact.findFirst({ where: { organizationId, phoneNumber } });
        if (created) return created;
      }
      throw error;
    }
  }

  /**
   * Maps Meta's per-type inbound message shape onto this app's MessageType
   * enum and a lossless JSON content blob. Unrecognized types are never
   * coerced into TEXT — they're stored as UNKNOWN with the raw sub-object
   * preserved, so nothing is silently dropped or misrepresented even for
   * a type this mapping doesn't explicitly know about yet.
   */
  private mapInboundContent(payload: any): MappedContent {
    switch (payload.type) {
      case 'text':
        return { type: MESSAGE_TYPE.TEXT, content: { body: payload.text?.body ?? '' }, text: payload.text?.body ?? '' };

      case 'image':
        return {
          type: MESSAGE_TYPE.IMAGE,
          content: { mediaId: payload.image?.id, mimeType: payload.image?.mime_type, caption: payload.image?.caption },
          text: payload.image?.caption ?? '',
        };

      case 'video':
        return {
          type: MESSAGE_TYPE.VIDEO,
          content: { mediaId: payload.video?.id, mimeType: payload.video?.mime_type, caption: payload.video?.caption },
          text: payload.video?.caption ?? '',
        };

      case 'audio':
        return {
          type: MESSAGE_TYPE.AUDIO,
          content: { mediaId: payload.audio?.id, mimeType: payload.audio?.mime_type },
          text: '',
        };

      case 'document':
        return {
          type: MESSAGE_TYPE.DOCUMENT,
          content: {
            mediaId: payload.document?.id,
            mimeType: payload.document?.mime_type,
            filename: payload.document?.filename,
            caption: payload.document?.caption,
          },
          text: payload.document?.caption ?? '',
        };

      case 'location':
        return {
          type: MESSAGE_TYPE.LOCATION,
          content: {
            latitude: payload.location?.latitude,
            longitude: payload.location?.longitude,
            name: payload.location?.name,
            address: payload.location?.address,
          },
          text: '',
        };

      case 'contacts':
        return { type: MESSAGE_TYPE.CONTACT_CARD, content: { contacts: payload.contacts ?? [] }, text: '' };

      case 'interactive':
        if (payload.interactive?.button_reply) {
          return {
            type: MESSAGE_TYPE.INTERACTIVE_BUTTONS,
            content: { id: payload.interactive.button_reply.id, title: payload.interactive.button_reply.title },
            text: payload.interactive.button_reply.title ?? '',
          };
        }
        if (payload.interactive?.list_reply) {
          return {
            type: MESSAGE_TYPE.INTERACTIVE_LIST,
            content: { id: payload.interactive.list_reply.id, title: payload.interactive.list_reply.title },
            text: payload.interactive.list_reply.title ?? '',
          };
        }
        return { type: MESSAGE_TYPE.UNKNOWN, content: { rawType: 'interactive', raw: payload.interactive }, text: '' };

      // A tapped "quick reply" button on a template message — distinct
      // from the free-form `interactive` type above.
      case 'button':
        return {
          type: MESSAGE_TYPE.INTERACTIVE_BUTTONS,
          content: { payload: payload.button?.payload, text: payload.button?.text },
          text: payload.button?.text ?? '',
        };

      default:
        return { type: MESSAGE_TYPE.UNKNOWN, content: { rawType: payload.type, raw: payload }, text: '' };
    }
  }
}

function parseProviderTimestamp(raw: unknown): Date | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000);
}
