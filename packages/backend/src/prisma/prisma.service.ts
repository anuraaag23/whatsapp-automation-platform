import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    // Prisma's own default pool size (num_cpus * 2 + 1, as low as 3 on a
    // single-core host) is what actually needs configuring for webhook
    // burst traffic — but 100 was never a safe universal default: most
    // managed Postgres instances (including the project's Supabase
    // deployment, which layers pgbouncer in front) cap max_connections
    // well below that, and this service has no way to know the real
    // ceiling for wherever it's deployed. Pool size is now driven entirely
    // by config, defaulting to Prisma's own built-in behavior (i.e. no
    // override at all) unless PRISMA_CONNECTION_LIMIT is explicitly set,
    // or the DATABASE_URL itself already carries a connection_limit query
    // param, which always wins since it's the more specific setting.
    //
    // The webhook burst path no longer needs a large pool to survive
    // anyway: WebhookEventProcessorService.acceptOnce() does one fast
    // INSERT per request and returns, deferring the full dispatch chain to
    // a BullMQ worker (concurrency: 10) instead of holding a connection
    // for the whole chain inline — see that service's docstring.
    const configuredLimit = process.env.PRISMA_CONNECTION_LIMIT;
    const urlAlreadyHasLimit = databaseUrl?.includes('connection_limit');
    const urlWithPool =
      !urlAlreadyHasLimit && configuredLimit
        ? `${databaseUrl}${databaseUrl?.includes('?') ? '&' : '?'}connection_limit=${configuredLimit}`
        : databaseUrl;

    super({
      datasources: {
        db: {
          url: urlWithPool,
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
