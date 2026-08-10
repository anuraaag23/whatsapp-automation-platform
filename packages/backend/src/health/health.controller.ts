import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_DISPATCH_QUEUE } from '../queue/queue.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(MESSAGE_DISPATCH_QUEUE) private readonly queue: Queue,
  ) {}

  /** Liveness — is the process up at all. Always returns 200 if the app can respond. */
  @Public()
  @Get()
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness — is the app actually able to serve traffic (DB + Redis
   * reachable). Use this one for load balancer health checks / Kubernetes
   * readiness probes, not the plain liveness check above.
   */
  @Public()
  @Get('ready')
  async ready() {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      await this.queue.client;
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    if (!healthy) {
      throw new ServiceUnavailableException({ status: 'error', checks });
    }

    return { status: 'ok', checks };
  }
}
