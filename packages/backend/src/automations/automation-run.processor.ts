import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationGraph, AutomationRunContext } from './automation-graph';
import { AUTOMATION_RUN_QUEUE } from './automations.constants';

interface ContinueJobData {
  automationId: string;
  nodeId: string;
  context: AutomationRunContext;
  runId: string;
}

@Processor(AUTOMATION_RUN_QUEUE)
export class AutomationRunProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutomationEngineService,
  ) {
    super();
  }

  // See MessageDispatchProcessor for why this is required.
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`AutomationRunProcessor worker error: ${error.message}`, error.stack);
  }

  async process(job: Job<ContinueJobData>): Promise<void> {
    const { automationId, nodeId, context, runId } = job.data;

    const automation = await this.prisma.automation.findUnique({ where: { id: automationId } });
    if (!automation || automation.status !== 'ACTIVE') {
      this.logger.warn(`Skipping continuation for automation ${automationId}: not found or inactive`);
      return;
    }

    const graph = automation.graph as unknown as AutomationGraph;
    await this.engine.executeFrom(automationId, graph, nodeId, context, runId);
  }
}
