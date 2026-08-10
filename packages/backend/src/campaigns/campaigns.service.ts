import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import type { MessageStatus, Prisma } from '@prisma/client';
import { CAMPAIGN_STATUS, MESSAGE_STATUS } from '../common/constants/prisma-enums.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceResolverService } from '../contacts/audience-resolver.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { MESSAGE_DISPATCH_QUEUE } from '../queue/queue.module';

const TERMINAL_STATUSES: MessageStatus[] = [
  MESSAGE_STATUS.SENT,
  MESSAGE_STATUS.DELIVERED,
  MESSAGE_STATUS.READ,
  MESSAGE_STATUS.FAILED,
];

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceResolver: AudienceResolverService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
    @InjectQueue(MESSAGE_DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
  ) {}

  list(organizationId: string) {
    return this.prisma.campaign.findMany({
      where: { organizationId },
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: { template: true, recipients: { include: { contact: true } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  // Step 1-2 of the wizard: create the draft with recipients + template selected.
  async create(organizationId: string, userId: string, dto: CreateCampaignDto) {
    const campaign = await this.prisma.campaign.create({
      data: {
        organizationId,
        createdById: userId,
        name: dto.name,
        type: dto.type,
        templateId: dto.templateId,
        audienceType: dto.audienceType,
        audienceRef: dto.audienceRef as Prisma.InputJsonValue,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: CAMPAIGN_STATUS.DRAFT,
      },
    });

    const contactIds = await this.audienceResolver.resolve(
      organizationId,
      dto.audienceType,
      dto.audienceRef as Prisma.JsonValue,
    );

    if (contactIds.length) {
      await this.prisma.campaignRecipient.createMany({
        data: contactIds.map((contactId) => ({ campaignId: campaign.id, contactId })),
        skipDuplicates: true,
      });
    }

    return this.findOne(organizationId, campaign.id);
  }

  async update(organizationId: string, id: string, dto: UpdateCampaignDto) {
    await this.assertDraft(organizationId, id);
    await this.prisma.campaign.update({
      where: { id },
      data: {
        ...dto,
        audienceRef: dto.audienceRef as Prisma.InputJsonValue | undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
    return this.findOne(organizationId, id);
  }

  // Step 5 of the wizard: Launch. Either fires immediately or flips to
  // SCHEDULED for the tick worker to pick up via scheduledAt (future work:
  // a dedicated campaign-tick check; for now immediate launch is fully wired).
  async launch(organizationId: string, id: string) {
    const campaign = await this.findOne(organizationId, id);

    if (campaign.status !== CAMPAIGN_STATUS.DRAFT && campaign.status !== CAMPAIGN_STATUS.SCHEDULED) {
      throw new BadRequestException(`Campaign is already ${campaign.status.toLowerCase()}`);
    }

    if (campaign.recipients.length === 0) {
      throw new BadRequestException('Campaign has no recipients to send to');
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { status: CAMPAIGN_STATUS.RUNNING, launchedAt: new Date() },
    });

    for (const recipient of campaign.recipients) {
      await this.dispatchQueue.add('dispatch', {
        organizationId,
        contactId: recipient.contactId,
        campaignId: id,
        templateId: campaign.templateId,
      });
    }

    await this.notifications.notify(
      organizationId,
      null,
      'Campaign launched',
      `"${campaign.name}" is now sending to ${campaign.recipients.length} recipient(s).`,
      { campaignId: id },
    );

    return { launched: true, recipientCount: campaign.recipients.length };
  }

  async pause(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.campaign.update({ where: { id }, data: { status: CAMPAIGN_STATUS.PAUSED } });
  }

  async cancel(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.campaign.update({ where: { id }, data: { status: CAMPAIGN_STATUS.CANCELLED } });
  }

  /** Rolls up live message statuses into the campaign's stats JSON for the analytics widgets. */
  async refreshStats(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    const grouped = await this.prisma.message.groupBy({
      by: ['status'],
      where: { campaignId: id, organizationId },
      _count: { _all: true },
    });

    const stats = { sent: 0, delivered: 0, read: 0, failed: 0 };
    for (const row of grouped) {
      if (row.status === MESSAGE_STATUS.SENT) stats.sent = row._count._all;
      if (row.status === MESSAGE_STATUS.DELIVERED) stats.delivered = row._count._all;
      if (row.status === MESSAGE_STATUS.READ) stats.read = row._count._all;
      if (row.status === MESSAGE_STATUS.FAILED) stats.failed = row._count._all;
    }

    return this.prisma.campaign.update({
      where: { id },
      data: { stats: stats as Prisma.InputJsonValue },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.assertDraft(organizationId, id);
    await this.prisma.campaign.delete({ where: { id } });
    return { success: true };
  }

  private async assertDraft(organizationId: string, id: string) {
    const campaign = await this.findOne(organizationId, id);
    if (campaign.status !== CAMPAIGN_STATUS.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be edited or deleted');
    }
    return campaign;
  }

  /**
   * Called after each dispatch job for a campaign finishes. If every
   * recipient has reached a terminal message status, marks the campaign
   * COMPLETED, rolls up final stats, and fires campaign.completed for the
   * automation engine's CAMPAIGN_COMPLETED trigger.
   */
  async checkAndMarkCompletion(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { recipients: true },
    });
    if (!campaign || campaign.status !== CAMPAIGN_STATUS.RUNNING) return;
    if (campaign.recipients.length === 0) return;

    const messages = await this.prisma.message.findMany({
      where: { campaignId, organizationId: campaign.organizationId },
      select: { contactId: true, status: true },
    });

    const latestStatusByContact = new Map<string, MessageStatus>();
    for (const msg of messages) latestStatusByContact.set(msg.contactId, msg.status);

    const allTerminal = campaign.recipients.every((r: { contactId: string }) => {
      const status = latestStatusByContact.get(r.contactId);
      return status && TERMINAL_STATUSES.includes(status);
    });
    if (!allTerminal) return;

    await this.refreshStats(campaign.organizationId, campaignId);
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CAMPAIGN_STATUS.COMPLETED, completedAt: new Date() },
    });

    await this.notifications.notify(
      campaign.organizationId,
      null,
      'Campaign completed',
      `"${campaign.name}" finished sending to all ${campaign.recipients.length} recipient(s).`,
      { campaignId },
    );

    this.events.emit('campaign.completed', { organizationId: campaign.organizationId, campaignId });
  }
}
