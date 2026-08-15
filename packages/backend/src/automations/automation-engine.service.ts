import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MESSAGE_TYPE } from '../common/constants/prisma-enums.constants';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AiService } from '../ai/ai.service';
import {
  AutomationGraph,
  AutomationNode,
  AutomationRunContext,
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
    @InjectQueue(AUTOMATION_RUN_QUEUE) private readonly runQueue: Queue,
  ) {}

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

        await this.whatsappService.sendToContact({
          organizationId: context.organizationId,
          contactId: context.contactId,
          type: data.templateId ? MESSAGE_TYPE.TEMPLATE : MESSAGE_TYPE.TEXT,
          content: data.templateId ? { templateId: data.templateId } : { body: rendered ?? '' },
        });
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
            .catch((error) => this.logger.warn(`Automation add-tag step failed: ${(error as Error).message}`));
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
            .catch((error) => this.logger.warn(`Automation add-to-group step failed: ${(error as Error).message}`));
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
            .catch((error) => this.logger.warn(`Automation update-contact step failed: ${(error as Error).message}`));
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
