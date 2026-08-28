import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const MESSAGE_DISPATCH_QUEUE = 'message-dispatch';
export const SCHEDULE_TICK_QUEUE = 'schedule-tick';

/**
 * BullMQ always talks to a real Redis server, in every environment
 * including e2e tests. BullMQ workers execute Lua scripts against Redis
 * (for atomic job-state transitions); a fake in-memory client like
 * ioredis-mock does not implement enough of Redis's actual Lua/scripting
 * surface to be a faithful stand-in, so it produced a test environment
 * that didn't exercise the real queue/worker code path at all — it could
 * pass while the real Redis-backed behavior was broken.
 *
 * The e2e suite instead points REDIS_HOST/REDIS_PORT (see
 * test/env-setup.ts) at the project's own docker-compose Redis service
 * (127.0.0.1:6379, unauthenticated, matching docker-compose.yml), the same
 * way it points DATABASE_URL at a real dedicated Postgres test database
 * rather than mocking Prisma.
 *
 * MESSAGE_DISPATCH_QUEUE is registered here, once, and exported, rather
 * than in each of the three feature modules that use it (schedules,
 * campaigns, health) — a queue name registered independently via
 * `BullModule.registerQueue` in multiple modules gets a separate,
 * module-scoped Queue client (and separate Redis connection) per
 * registration, since Nest module boundaries don't automatically dedupe
 * dynamic-module providers by queue name. That was true here: three
 * separate connections for what's conceptually one queue, none of which
 * a test's afterAll could reliably discover and close via a single DI
 * lookup. Registering it centrally means there's exactly one Queue client,
 * one token, and one thing to close.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: config.get<number>('REDIS_PORT') ?? 6379,
          username: config.get<string>('REDIS_USERNAME') || undefined,
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          tls: config.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
          maxRetriesPerRequest: null,
        },
        forceDisconnectOnShutdown: true,
      }),
    }),
    BullModule.registerQueue({ name: MESSAGE_DISPATCH_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
