import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { MessageType } from '@prisma/client';
import { MESSAGE_TYPE, MESSAGE_STATUS } from '../common/constants/prisma-enums.constants';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AiService } from '../ai/ai.service';
import { ConversationsService } from '../conversations/conversations.service';
import { AuditService } from '../audit/audit.service';
import {
  AutomationGraph,
  AutomationNode,
  AutomationRunContext,
  WaitForReplyHandle,
  WAIT_FOR_REPLY_HANDLE,
  getWaitForReplyTimeoutMinutes,
  evaluateCondition,
  findNode,
  findTriggerNode,
  outgoingEdges,
} from './automation-graph';
import { AUTOMATION_RUN_QUEUE } from './automations.constants';

const MAX_STEPS_PER_TICK = 25; // guards against accidental cycles in a saved graph

interface RunStep {
  nodeId: string;
  nodeType: string;
  at: string;
  outcome?: string;
}

@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly aiService: AiService,
    private readonly conversations: ConversationsService,
    private readonly audit: AuditService,
    @InjectQueue(AUTOMATION_RUN_QUEUE) private readonly runQueue: Queue,
  ) {
    // See WebhookEventProcessorService's constructor for why this listener
    // is required — an unhandled 'error' event on a BullMQ Queue is a
    // Node.js uncaught exception, not a caught/logged error.
    this.runQueue.on('error', (error) => this.logger.error(`AUTOMATION_RUN_QUEUE connection error: ${error.message}`, error.stack));
  }

  /** Entry point: starts a fresh run from the automation's trigger node, logging an AutomationRun row. */
  async start(automationId: string, context: AutomationRunContext) {
    const automation = await this.prisma.automation.findUnique({ where: { id: automationId } });
    if (!automation || automation.status !== 'ACTIVE') return;

    const graph = automation.graph as unknown as AutomationGraph;
    const trigger = findTriggerNode(graph);
    if (!trigger) return;

    await this.prisma.automation.update({
      where: { id: automationId },
      data: { runsCount: { increment: 1 }, lastRunAt: new Date() },
    });

    const run = await this.prisma.automationRun.create({
      data: {
        automationId,
        organizationId: context.organizationId,
        contactId: context.contactId,
        status: 'RUNNING',
        steps: [],
      },
    });

    await this.executeFrom(automationId, graph, trigger.id, context, run.id);
  }

  /** Continues execution from a given node — called both synchronously and from the delay worker. */
  async executeFrom(
    automationId: string,
    graph: AutomationGraph,
    nodeId: string,
    context: AutomationRunContext,
    runId: string,
  ) {
    let currentId: string | undefined = nodeId;
    let steps = 0;
    const stepLog: RunStep[] = await this.loadSteps(runId);

    try {
      while (currentId && steps < MAX_STEPS_PER_TICK) {
        steps++;
        const node = findNode(graph, currentId);
        if (!node) {
          await this.finishRun(runId, stepLog, 'COMPLETED');
          return;
        }

        if (node.type === 'wait_for_reply') {
          await this.pauseForReply(automationId, node, context, runId, stepLog);
          return; // execution resumes via resumeWaitingRepliesForConversation() or resumeTimedOutRun()
        }

        if (node.type === 'delay' || node.type === 'wait') {
          const nextEdges = outgoingEdges(graph, node.id);
          stepLog.push({ nodeId: node.id, nodeType: node.type, at: new Date().toISOString(), outcome: 'paused' });
          await this.persistSteps(runId, stepLog);

          if (nextEdges.length === 0) {
            await this.finishRun(runId, stepLog, 'COMPLETED');
            return;
          }

          const data = node.data as { minutes?: number };
          const delayMs = Math.max((data.minutes ?? 0) * 60_000, 1000);
          await this.runQueue.add(
            'continue',
            { automationId, nodeId: nextEdges[0].target, context, runId },
            { delay: delayMs },
          );
          return; // execution resumes at nextEdges[0].target once the worker picks the job up
        }

        const outcome = await this.executeNode(automationId, node, context);
        stepLog.push({ nodeId: node.id, nodeType: node.type, at: new Date().toISOString(), outcome: outcome.handle });

        if (outcome.pause) {
          await this.finishRun(runId, stepLog, 'COMPLETED');
          return;
        }

        const edges = outgoingEdges(graph, node.id, outcome.handle);
        if (edges.length === 0) {
          await this.finishRun(runId, stepLog, 'COMPLETED');
          return;
        }
        currentId = edges[0].target;
      }

      await this.persistSteps(runId, stepLog);
    } catch (error) {
      stepLog.push({ nodeId: currentId ?? 'unknown', nodeType: 'error', at: new Date().toISOString(), outcome: (error as Error).message });
      await this.finishRun(runId, stepLog, 'FAILED', (error as Error).message);
      this.logger.error(`Automation run ${runId} failed: ${(error as Error).message}`);
    }
  }

  private async loadSteps(runId: string): Promise<RunStep[]> {
    const run = await this.prisma.automationRun.findUnique({ where: { id: runId } });
    return (run?.steps as unknown as RunStep[]) ?? [];
  }

  private async persistSteps(runId: string, steps: RunStep[]) {
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: { steps: steps as any },
    });
  }

  private async finishRun(runId: string, steps: RunStep[], status: 'COMPLETED' | 'FAILED', errorMessage?: string) {
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: { steps: steps as any, status, completedAt: new Date(), errorMessage },
    });
  }

  /**
   * Parks a run at a `wait_for_reply` node: persists everything needed to
   * resume it later — which conversation to watch, which node to resume
   * from, the run's variables at this point (not carried via a queued
   * job's payload the way `delay` resumption is, since a reply resumes
   * this from an inbound-message event, not from picking the job back up)
   * — and schedules a timeout continuation as a delayed job on the same
   * queue `delay` nodes already use, so it survives a process restart the
   * same way those do.
   */
  private async pauseForReply(
    automationId: string,
    node: AutomationNode,
    context: AutomationRunContext,
    runId: string,
    stepLog: RunStep[],
  ) {
    // The 1:1 (organizationId, contactId) Conversation is the match key an
    // inbound reply is looked up by — resolved (or, for a contact with no
    // prior thread, created) here rather than requiring every trigger call
    // site to have already threaded a conversationId through
    // AutomationRunContext just for this one node type.
    const conversation = await this.conversations.findOrCreateForContact(context.organizationId, context.contactId);
    const timeoutMinutes = getWaitForReplyTimeoutMinutes(node);
    const timeoutMs = timeoutMinutes * 60_000;

    stepLog.push({ nodeId: node.id, nodeType: node.type, at: new Date().toISOString(), outcome: 'waiting' });

    const job = await this.runQueue.add('wait-timeout', { runId }, { delay: timeoutMs });

    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: 'WAITING_FOR_REPLY',
        steps: stepLog as any,
        conversationId: conversation.id,
        waitingNodeId: node.id,
        waitingSince: new Date(),
        waitExpiresAt: new Date(Date.now() + timeoutMs),
        waitTimeoutJobId: job.id ?? null,
        contextVariables: context.variables as any,
      },
    });

    this.audit.record({
      organizationId: context.organizationId,
      action: 'automation.paused_for_reply',
      entityType: 'AutomationRun',
      entityId: runId,
      metadata: { automationId, nodeId: node.id, timeoutMinutes, conversationId: conversation.id },
    });
  }

  /**
   * Entry point for InboundMessageService's `whatsapp.inbound_message`
   * listener (see AutomationsService.handleInboundMessage) — the same
   * event every other trigger type reacts to, not a parallel notification
   * path. Every run currently waiting on this conversation is resumed
   * independently: two different automations both waiting on the same
   * contact both legitimately treat the next message as "the reply".
   */
  async resumeWaitingRepliesForConversation(
    organizationId: string,
    conversationId: string,
    messageId: string,
    replyText: string,
  ) {
    const waitingRuns = await this.prisma.automationRun.findMany({
      where: { organizationId, conversationId, status: 'WAITING_FOR_REPLY' },
      select: { id: true },
    });

    for (const run of waitingRuns) {
      await this.continueWaitingRun(run.id, WAIT_FOR_REPLY_HANDLE.REPLY, { messageId, replyText });
    }
  }

  /** Called by AutomationRunProcessor for a 'wait-timeout' job once its delay elapses. */
  async resumeTimedOutRun(runId: string) {
    await this.continueWaitingRun(runId, WAIT_FOR_REPLY_HANDLE.TIMEOUT, {});
  }

  /**
   * The one place a waiting run is actually resumed, whichever of the two
   * ways (reply arriving, or timing out) got there first. The conditional
   * `updateMany` is the concurrency guard the whole feature depends on: it
   * only succeeds if the run is still WAITING_FOR_REPLY, so if a reply and
   * the timeout job both fire around the same moment — or the same inbound
   * message somehow triggers this twice — only the first to land actually
   * continues the run. Everyone else sees `count === 0` and no-ops.
   */
  private async continueWaitingRun(
    runId: string,
    handle: WaitForReplyHandle,
    opts: { messageId?: string; replyText?: string },
  ) {
    const claimed = await this.prisma.automationRun.updateMany({
      where: { id: runId, status: 'WAITING_FOR_REPLY' },
      data: {
        status: 'RUNNING',
        ...(handle === WAIT_FOR_REPLY_HANDLE.REPLY && opts.messageId ? { resumedByMessageId: opts.messageId } : {}),
      },
    });
    if (claimed.count === 0) {
      this.logger.log(`AutomationRun ${runId} is no longer WAITING_FOR_REPLY — skipping duplicate continuation (handle=${handle})`);
      return;
    }

    const run = await this.prisma.automationRun.findUnique({ where: { id: runId } });
    const stepLog = await this.loadSteps(runId);

    if (!run || !run.waitingNodeId || !run.automationId) {
      this.logger.warn(`AutomationRun ${runId} was claimed for continuation but is missing its waiting-node state`);
      await this.finishRun(runId, stepLog, 'FAILED', 'Waiting run had no recorded waiting node to resume from');
      return;
    }

    const automation = await this.prisma.automation.findUnique({ where: { id: run.automationId } });
    if (!automation || automation.status !== 'ACTIVE') {
      await this.finishRun(runId, stepLog, 'COMPLETED');
      return;
    }

    // A reply beat the timeout to it — cancel the now-redundant timeout
    // job so it doesn't sit in the queue until it eventually fires (the
    // updateMany guard above means it would be harmless if it did, but
    // there's no reason to leave it there).
    if (handle === WAIT_FOR_REPLY_HANDLE.REPLY && run.waitTimeoutJobId) {
      try {
        const pendingJob = await this.runQueue.getJob(run.waitTimeoutJobId);
        await pendingJob?.remove();
      } catch (error) {
        this.logger.warn(`Could not remove timeout job ${run.waitTimeoutJobId} for run ${runId}: ${(error as Error).message}`);
      }
    }

    const graph = automation.graph as unknown as AutomationGraph;
    const node = findNode(graph, run.waitingNodeId);
    stepLog.push({ nodeId: run.waitingNodeId, nodeType: 'wait_for_reply', at: new Date().toISOString(), outcome: handle });

    this.audit.record({
      organizationId: run.organizationId,
      action: handle === WAIT_FOR_REPLY_HANDLE.REPLY ? 'automation.resumed_by_reply' : 'automation.wait_timed_out',
      entityType: 'AutomationRun',
      entityId: runId,
      metadata: { automationId: run.automationId, nodeId: run.waitingNodeId, messageId: opts.messageId },
    });

    if (!node) {
      await this.finishRun(runId, stepLog, 'COMPLETED');
      return;
    }

    const edges = outgoingEdges(graph, node.id, handle);
    if (edges.length === 0) {
      await this.persistSteps(runId, stepLog);
      await this.finishRun(runId, stepLog, 'COMPLETED');
      return;
    }

    const context: AutomationRunContext = {
      organizationId: run.organizationId,
      contactId: run.contactId,
      variables: {
        ...((run.contextVariables as unknown as Record<string, string> | null) ?? {}),
        ...(handle === WAIT_FOR_REPLY_HANDLE.REPLY && opts.replyText !== undefined ? { last_message: opts.replyText } : {}),
      },
    };

    await this.persistSteps(runId, stepLog);
    await this.executeFrom(run.automationId, graph, edges[0].target, context, runId);
  }

  private async executeNode(
    automationId: string,
    node: AutomationNode,
    context: AutomationRunContext,
  ): Promise<{ handle?: string; pause?: boolean }> {
    switch (node.type) {
      case 'trigger':
        return {};

      case 'condition':
      case 'branch': {
        const matched = evaluateCondition(node.data as any, context);
        return { handle: matched ? 'true' : 'false' };
      }

      case 'send_message': {
        const data = node.data as { body?: string; templateId?: string };
        const rendered = data.body ? this.renderVariables(data.body, context.variables) : undefined;

        // Same template-lookup pattern as MessageDispatchProcessor (see
        // its process() method) — WhatsappService.sendToContact expects
        // TEMPLATE content shaped as { name, language }, not a bare
        // templateId, so this has to resolve the actual MessageTemplate
        // row first rather than passing the id straight through.
        let type: MessageType = MESSAGE_TYPE.TEXT;
        let content: Record<string, unknown> = { body: rendered ?? '' };
        if (data.templateId) {
          const template = await this.prisma.messageTemplate.findFirst({
            where: { id: data.templateId, organizationId: context.organizationId },
          });
          if (template) {
            type = MESSAGE_TYPE.TEMPLATE;
            content = { name: template.name, language: template.language };
          } else {
            this.logger.warn(
              `Automation ${automationId}: templateId ${data.templateId} not found in org ${context.organizationId}; falling back to plain text body`,
            );
          }
        }

        // WhatsappService.sendToContact is the single centralized
        // enforcement point for opt-out (see its docstring) — an
        // automation with no send_message-specific opt-out check of its
        // own still can't message an opted-out contact. This just makes
        // that outcome visible in the audit log rather than silently
        // doing nothing, since an automation skipping a step has no other
        // trace in the UI the way a failed ad hoc send or campaign
        // recipient does.
        const message = await this.whatsappService.sendToContact({
          organizationId: context.organizationId,
          contactId: context.contactId,
          type,
          content,
        });
        if (message.status === MESSAGE_STATUS.FAILED && message.errorCode === 'NOT_OPTED_IN') {
          this.audit.record({
            organizationId: context.organizationId,
            action: 'automation.send_blocked_optout',
            entityType: 'Contact',
            entityId: context.contactId,
            metadata: { automationId },
          });
        }
        return {};
      }

      case 'ai': {
        const data = node.data as { prompt?: string; outputVar?: string };
        try {
          const result = await this.aiService.run('generate', data.prompt ?? '');
          if (data.outputVar) context.variables[data.outputVar] = result;
        } catch (error) {
          this.logger.warn(`AI node skipped (not configured or failed): ${(error as Error).message}`);
        }
        return {};
      }

      case 'webhook': {
        const data = node.data as { url?: string };
        if (data.url) {
          try {
            const axios = (await import('axios')).default;
            await axios.post(data.url, context.variables, { timeout: 5000 });
          } catch (error) {
            this.logger.warn(`Automation webhook call failed: ${(error as Error).message}`);
          }
        }
        return {};
      }

      case 'add_tag': {
        const data = node.data as { tagId?: string };
        if (data.tagId) {
          await this.prisma.contactTag
            .upsert({
              where: { contactId_tagId: { contactId: context.contactId, tagId: data.tagId } },
              create: { contactId: context.contactId, tagId: data.tagId },
              update: {},
            })
            .catch((error: unknown) => this.logger.warn(`Automation add-tag step failed: ${(error as Error).message}`));
        }
        return {};
      }

      case 'add_to_group': {
        const data = node.data as { groupId?: string };
        if (data.groupId) {
          await this.prisma.contactGroupMember
            .upsert({
              where: { contactId_groupId: { contactId: context.contactId, groupId: data.groupId } },
              create: { contactId: context.contactId, groupId: data.groupId },
              update: {},
            })
            .catch((error: unknown) => this.logger.warn(`Automation add-to-group step failed: ${(error as Error).message}`));
        }
        return {};
      }

      case 'update_contact': {
        const data = node.data as { field?: string; value?: string };
        // Whitelisted on purpose — this runs from a saved graph, so it
        // must not be possible to target something like organizationId,
        // optInStatus, or any other field an automation shouldn't be able
        // to silently rewrite.
        const UPDATABLE_FIELDS = new Set(['firstName', 'lastName', 'email', 'company', 'city', 'notes']);
        if (data.field && UPDATABLE_FIELDS.has(data.field)) {
          const rendered = data.value ? this.renderVariables(data.value, context.variables) : '';
          await this.prisma.contact
            .update({ where: { id: context.contactId }, data: { [data.field]: rendered } })
            .catch((error: unknown) => this.logger.warn(`Automation update-contact step failed: ${(error as Error).message}`));
        }
        return {};
      }

      case 'finish':
      default:
        return { pause: true };
    }
  }

  private renderVariables(text: string, variables: Record<string, string>): string {
    return text.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => variables[key] ?? '');
  }
}
