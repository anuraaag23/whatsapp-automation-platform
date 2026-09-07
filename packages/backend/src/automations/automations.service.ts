import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AutomationStatus, Prisma } from '@prisma/client';
import { parseExpression } from 'cron-parser';
import { AUTOMATION_STATUS } from '../common/constants/prisma-enums.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceResolverService } from '../contacts/audience-resolver.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';
import { validateGraph, AutomationGraph } from './automation-graph';
import { AutomationEngineService } from './automation-engine.service';
import { AuditService } from '../audit/audit.service';
import { QuotaService } from '../quota/quota.service';

export interface ContactCreatedEvent {
  organizationId: string;
  contactId: string;
  variables: Record<string, string>;
}

export interface WhatsappInboundEvent {
  organizationId: string;
  contactId: string;
  conversationId: string;
  messageId: string;
  phoneNumberId: string;
  from: string;
  text: string;
}

export interface TagAddedEvent {
  organizationId: string;
  contactId: string;
  tagId: string;
  tagName: string;
  variables: Record<string, string>;
}

export interface CampaignCompletedEvent {
  organizationId: string;
  campaignId: string;
}

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutomationEngineService,
    private readonly audienceResolver: AudienceResolverService,
    private readonly audit: AuditService,
    private readonly quota: QuotaService,
  ) {}

  list(organizationId: string) {
    return this.prisma.automation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const automation = await this.prisma.automation.findFirst({ where: { id, organizationId } });
    if (!automation) throw new NotFoundException('Automation not found');
    return automation;
  }

  async create(organizationId: string, userId: string, dto: CreateAutomationDto) {
    const errors = validateGraph(dto.graph as AutomationGraph);
    if (errors.length) throw new BadRequestException(errors.join('; '));

    // Explicit, user-initiated creation of a new automation DEFINITION —
    // not to be confused with an automation RUN (a single execution),
    // which is triggered by system events (inbound messages, schedules,
    // webhooks) and deliberately NOT quota-enforced here; see
    // quota.service.ts's doc comments and this phase's final report for
    // why blocking those would risk silently breaking live customer
    // automations rather than just capping how many an org can define.
    await this.quota.assertWithinLimit(organizationId, 'automations');

    const automation = await this.prisma.automation.create({
      data: {
        organizationId,
        createdById: userId,
        name: dto.name,
        description: dto.description,
        triggerType: dto.triggerType,
        graph: dto.graph as unknown as Prisma.InputJsonValue,
        status: AUTOMATION_STATUS.DRAFT,
      },
    });

    this.audit.record({
      organizationId,
      userId,
      action: 'automation.created',
      entityType: 'Automation',
      entityId: automation.id,
      metadata: { name: automation.name, triggerType: automation.triggerType },
    });

    return automation;
  }

  async update(organizationId: string, id: string, dto: UpdateAutomationDto, actorUserId?: string) {
    await this.findOne(organizationId, id);

    if (dto.graph) {
      const errors = validateGraph(dto.graph as AutomationGraph);
      if (errors.length) throw new BadRequestException(errors.join('; '));
    }

    const updated = await this.prisma.automation.update({
      where: { id },
      data: {
        ...dto,
        graph: dto.graph ? (dto.graph as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'automation.updated',
      entityType: 'Automation',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return updated;
  }

  async setStatus(organizationId: string, id: string, status: AutomationStatus, actorUserId?: string) {
    await this.findOne(organizationId, id);
    const updated = await this.prisma.automation.update({ where: { id }, data: { status } });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'automation.status_changed',
      entityType: 'Automation',
      entityId: id,
      metadata: { status },
    });

    return updated;
  }

  /**
   * Builds the standard variable set every trigger seeds a run's context
   * with — centralized so `opt_in_status` and a joined `tags` list (what
   * the brief's condition-node requirement needs, but nothing previously
   * seeded) land in every trigger path at once, rather than needing the
   * same two fields added correctly at each of the six call sites
   * individually. `tags` is a comma-joined name list, not a relation —
   * evaluateCondition() only ever compares against flat string variables,
   * so this is the same flattening `last_message` already uses for
   * message content.
   */
  private buildContactVariables(
    contact: {
      firstName: string | null;
      lastName: string | null;
      company: string | null;
      city: string | null;
      optInStatus: string;
      tags?: { tag: { name: string } }[];
    },
    extra?: Record<string, string>,
  ): Record<string, string> {
    return {
      first_name: contact.firstName ?? '',
      last_name: contact.lastName ?? '',
      company: contact.company ?? '',
      city: contact.city ?? '',
      opt_in_status: contact.optInStatus,
      tags: (contact.tags ?? []).map((t) => t.tag.name).join(', '),
      ...extra,
    };
  }

  async remove(organizationId: string, id: string, actorUserId?: string) {
    const automation = await this.findOne(organizationId, id);
    await this.prisma.automation.delete({ where: { id } });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'automation.deleted',
      entityType: 'Automation',
      entityId: id,
      metadata: { name: automation.name },
    });

    return { success: true };
  }

  async listRuns(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.automationRun.findMany({
      where: { automationId: id, organizationId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Wired trigger #5: an external service (Zapier, a custom script, etc.)
   * POSTs here with an API key to fire a WEBHOOK-triggered automation.
   * Unlike the other triggers this isn't driven by an internal event — it's
   * the entry point itself, called directly from the webhook controller.
   */
  async triggerFromWebhook(
    automationId: string,
    organizationId: string,
    payload: { phoneNumber?: string; contactId?: string; variables?: Record<string, string> },
  ) {
    const automation = await this.prisma.automation.findFirst({
      where: { id: automationId, organizationId, status: AUTOMATION_STATUS.ACTIVE, triggerType: 'WEBHOOK' },
    });
    if (!automation) {
      throw new NotFoundException('No active WEBHOOK automation found with that ID for this organization');
    }

    let contact = payload.contactId
      ? await this.prisma.contact.findFirst({
          where: { id: payload.contactId, organizationId },
          include: { tags: { include: { tag: true } } },
        })
      : null;

    if (!contact && payload.phoneNumber) {
      contact = await this.prisma.contact.findUnique({
        where: { organizationId_phoneNumber: { organizationId, phoneNumber: payload.phoneNumber } },
        include: { tags: { include: { tag: true } } },
      });
    }

    if (!contact) {
      throw new NotFoundException('No matching contact found — provide a known contactId or phoneNumber');
    }

    await this.engine.start(automationId, {
      organizationId,
      contactId: contact.id,
      variables: this.buildContactVariables(contact, payload.variables),
    });

    return { triggered: true };
  }

  /** Manual trigger for testing a MANUAL automation against a specific contact. */
  async runManually(organizationId: string, id: string, contactId: string) {
    const automation = await this.findOne(organizationId, id);
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      include: { tags: { include: { tag: true } } },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    await this.engine.start(automation.id, {
      organizationId,
      contactId,
      variables: this.buildContactVariables(contact),
    });

    return { started: true };
  }

  /**
   * Wired trigger #1: fires every ACTIVE automation whose keyword matches
   * an inbound message. organizationId/contactId come directly from the
   * event — InboundMessageService has already resolved (and, if this was
   * a brand-new sender, created) both as part of persisting the message,
   * so there's no need to re-derive them here, and no scenario where the
   * contact "doesn't exist yet" by the time this listener runs.
   *
   * Also the single hook point for wait-for-reply: every inbound message
   * goes through this same listener (not a second, parallel one), and any
   * run currently WAITING_FOR_REPLY on this conversation gets resumed
   * here — independent of, and in addition to, whatever KEYWORD_RECEIVED
   * automations this same message may separately trigger below.
   */
  @OnEvent('whatsapp.inbound_message')
  async handleInboundMessage(event: WhatsappInboundEvent) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: event.contactId, organizationId: event.organizationId },
      include: { tags: { include: { tag: true } } },
    });
    if (!contact) return;

    await this.engine
      .resumeWaitingRepliesForConversation(event.organizationId, event.conversationId, event.messageId, event.text)
      .catch((error) =>
        this.logger.error(`Resuming wait-for-reply runs for conversation ${event.conversationId} failed`, error as Error),
      );

    const automations = await this.prisma.automation.findMany({
      where: {
        organizationId: event.organizationId,
        status: AUTOMATION_STATUS.ACTIVE,
        triggerType: 'KEYWORD_RECEIVED',
      },
    });

    const variables = this.buildContactVariables(contact, { last_message: event.text });

    for (const automation of automations) {
      const graph = automation.graph as unknown as AutomationGraph;
      const trigger = graph.nodes.find((n) => n.type === 'trigger');
      const keyword = (trigger?.data as { keyword?: string } | undefined)?.keyword;

      if (keyword && event.text.toLowerCase().includes(keyword.toLowerCase())) {
        await this.engine.start(automation.id, {
          organizationId: event.organizationId,
          contactId: contact.id,
          variables,
        });
        this.logger.log(`Automation "${automation.name}" triggered by keyword "${keyword}"`);
      }
    }
  }

  /** Wired trigger #2: fires every ACTIVE CONTACT_CREATED automation when a contact is created. */
  @OnEvent('contact.created')
  async handleContactCreated(event: ContactCreatedEvent) {
    const automations = await this.prisma.automation.findMany({
      where: { organizationId: event.organizationId, status: AUTOMATION_STATUS.ACTIVE, triggerType: 'CONTACT_CREATED' },
    });

    for (const automation of automations) {
      await this.engine.start(automation.id, {
        organizationId: event.organizationId,
        contactId: event.contactId,
        variables: event.variables,
      });
      this.logger.log(`Automation "${automation.name}" triggered by contact.created`);
    }
  }

  /** Wired trigger #3: fires every ACTIVE TAG_ADDED automation whose trigger tag matches. */
  @OnEvent('contact.tag_added')
  async handleTagAdded(event: TagAddedEvent) {
    const automations = await this.prisma.automation.findMany({
      where: { organizationId: event.organizationId, status: AUTOMATION_STATUS.ACTIVE, triggerType: 'TAG_ADDED' },
    });

    for (const automation of automations) {
      const graph = automation.graph as unknown as AutomationGraph;
      const trigger = graph.nodes.find((n) => n.type === 'trigger');
      const targetTag = (trigger?.data as { tagName?: string } | undefined)?.tagName;

      if (!targetTag || targetTag.toLowerCase() === event.tagName.toLowerCase()) {
        await this.engine.start(automation.id, {
          organizationId: event.organizationId,
          contactId: event.contactId,
          variables: event.variables,
        });
        this.logger.log(`Automation "${automation.name}" triggered by tag.added (${event.tagName})`);
      }
    }
  }

  /**
   * Wired trigger #4: fires every ACTIVE CAMPAIGN_COMPLETED automation for
   * every recipient of the campaign that just finished, letting a follow-up
   * flow (e.g. "wait 2 days, then ask for feedback") pick up from there.
   */
  @OnEvent('campaign.completed')
  async handleCampaignCompleted(event: CampaignCompletedEvent) {
    const automations = await this.prisma.automation.findMany({
      where: { organizationId: event.organizationId, status: AUTOMATION_STATUS.ACTIVE, triggerType: 'CAMPAIGN_COMPLETED' },
    });
    if (automations.length === 0) return;

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: event.campaignId },
      include: { contact: { include: { tags: { include: { tag: true } } } } },
    });

    for (const automation of automations) {
      for (const recipient of recipients) {
        await this.engine.start(automation.id, {
          organizationId: event.organizationId,
          contactId: recipient.contactId,
          variables: this.buildContactVariables(recipient.contact),
        });
      }
      this.logger.log(`Automation "${automation.name}" triggered by campaign.completed for ${recipients.length} contact(s)`);
    }
  }

  /**
   * Wired trigger #6: called every minute by AutomationScheduleTickProcessor.
   * Finds every ACTIVE SCHEDULE-triggered automation whose cron expression
   * (stored in the trigger node's data) is due, resolves its audience the
   * same way the message scheduler does, and starts a run per contact.
   * Uses Automation.lastRunAt to avoid double-firing within the same
   * cron tick, the same guard pattern as the message scheduler.
   */
  async runDueScheduledAutomations(now: Date = new Date()) {
    const automations = await this.prisma.automation.findMany({
      where: { status: AUTOMATION_STATUS.ACTIVE, triggerType: 'SCHEDULE' },
    });

    let started = 0;

    for (const automation of automations) {
      const graph = automation.graph as unknown as AutomationGraph;
      const trigger = graph.nodes.find((n) => n.type === 'trigger');
      const data = trigger?.data as
        | { cronExpression?: string; audienceType?: string; audienceRef?: Record<string, unknown> }
        | undefined;

      if (!data?.cronExpression) continue;

      let due: Date;
      try {
        due = parseExpression(data.cronExpression, { currentDate: now }).prev().toDate();
      } catch {
        this.logger.warn(`Automation "${automation.name}" has an invalid cron expression, skipping`);
        continue;
      }

      const alreadyRanThisTick = automation.lastRunAt && automation.lastRunAt >= due;
      if (alreadyRanThisTick || due > now) continue;

      const contactIds = await this.audienceResolver.resolve(
        automation.organizationId,
        (data.audienceType ?? 'ALL_CONTACTS') as any,
        (data.audienceRef ?? {}) as Prisma.JsonValue,
      );

      for (const contactId of contactIds) {
        const contact = await this.prisma.contact.findUnique({
          where: { id: contactId },
          include: { tags: { include: { tag: true } } },
        });
        if (!contact) continue;
        await this.engine.start(automation.id, {
          organizationId: automation.organizationId,
          contactId,
          variables: this.buildContactVariables(contact),
        });
        started++;
      }

      this.logger.log(`Automation "${automation.name}" fired on schedule for ${contactIds.length} contact(s)`);
    }

    return { automationsFired: automations.length, runsStarted: started };
  }
}
