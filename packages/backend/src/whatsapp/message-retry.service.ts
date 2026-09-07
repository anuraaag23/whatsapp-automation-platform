import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { MESSAGE_STATUS } from '../common/constants/prisma-enums.constants';
import { MAX_MESSAGE_RETRY_ATTEMPTS, RETRYABLE_WHATSAPP_ERROR_CODES } from './whatsapp.constants';

/** How many eligible messages one tick will attempt, so a large backlog of transient failures doesn't spike load in a single tick. */
const RETRY_BATCH_SIZE = 25;

/**
 * Periodic sweep that re-attempts outbound messages which failed for a
 * transient reason (rate limiting, temporary unavailability, a network-
 * level failure that never reached Meta's API at all — see
 * isRetryableWhatsappError in whatsapp.constants.ts). Mirrors
 * WebhookEventProcessorService/WebhookEventRetryProcessor's retry pattern
 * exactly: persist the failure immediately, then let a repeatable tick
 * (MessageRetryProcessor) sweep for eligible rows and retry them, bounded
 * by MAX_MESSAGE_RETRY_ATTEMPTS. Once that bound is hit — or the failure
 * was never retryable to begin with — the message stays FAILED
 * permanently: that's the "dead letter" record, queryable via the
 * existing /messages?status=FAILED endpoints rather than a second queue
 * system, exactly as the gap-audit brief asked for.
 */
@Injectable()
export class MessageRetryService {
  private readonly logger = new Logger(MessageRetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly campaignsService: CampaignsService,
  ) {}

  async retryEligibleMessages(): Promise<{ attempted: number; recovered: number }> {
    const candidates = await this.prisma.message.findMany({
      where: {
        direction: 'OUTBOUND',
        status: MESSAGE_STATUS.FAILED,
        retryCount: { lt: MAX_MESSAGE_RETRY_ATTEMPTS },
        OR: [
          { errorCode: null },
          { errorCode: { in: [...RETRYABLE_WHATSAPP_ERROR_CODES] } },
        ],
      },
      orderBy: { failedAt: 'asc' },
      take: RETRY_BATCH_SIZE,
      select: { id: true, organizationId: true, campaignId: true },
    });

    let attempted = 0;
    let recovered = 0;

    for (const candidate of candidates) {
      // Atomic claim: flips FAILED -> QUEUED before doing any network work,
      // so a second, overlapping tick run (or a manual "retry failed" call
      // landing on the same message) can't both pick it up and send twice.
      // If another process already claimed it since the findMany above,
      // count is 0 and this tick just moves on.
      const claim = await this.prisma.message.updateMany({
        where: { id: candidate.id, status: MESSAGE_STATUS.FAILED },
        data: { status: MESSAGE_STATUS.QUEUED },
      });
      if (claim.count === 0) continue;

      attempted++;
      try {
        const result = await this.whatsappService.retrySend(candidate.organizationId, candidate.id);
        if (result.status === MESSAGE_STATUS.SENT) recovered++;
        if (candidate.campaignId) {
          await this.prisma.campaignRecipient.updateMany({
            where: { campaignId: candidate.campaignId, contactId: result.contactId },
            data: { status: result.status },
          });
          await this.campaignsService.checkAndMarkCompletion(candidate.campaignId);
        }
      } catch (error) {
        // retrySend only throws for genuinely unexpected conditions (the
        // message itself vanished between the claim and the retry, etc.),
        // not for the WhatsApp send failing again — that path resolves
        // normally with status FAILED. Put the row back to FAILED rather
        // than leaving it stuck at QUEUED forever.
        this.logger.error(`Unexpected error retrying message ${candidate.id}: ${(error as Error).message}`, (error as Error).stack);
        await this.prisma.message.updateMany({
          where: { id: candidate.id, status: MESSAGE_STATUS.QUEUED },
          data: { status: MESSAGE_STATUS.FAILED, retryCount: { increment: 1 } },
        });
      }
    }

    if (attempted > 0) {
      this.logger.log(`Message retry tick: attempted ${attempted}, recovered ${recovered}`);
    }
    return { attempted, recovered };
  }
}
