import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const MESSAGE_DISPATCH_QUEUE = 'message-dispatch';
export const SCHEDULE_TICK_QUEUE = 'schedule-tick';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: config.get<number>('REDIS_PORT') ?? 6379,
          // Local Docker Redis needs none of these (all unset by default,
          // so this stays a no-op there). Managed free Redis providers
          // require a password on every connection and TLS since they
          // don't expose a plain, unencrypted port at all. Username is
          // provider-specific: Upstash didn't require one, but Aiven's
          // Valkey does (its default user is literally named "default",
          // not left blank) — passing undefined when unset keeps this
          // harmless for providers that don't need it. BullMQ also
          // specifically needs maxRetriesPerRequest: null on managed
          // Redis — without it, BullMQ's blocking commands get cut off by
          // the default retry limit and jobs silently stop being picked up.
          username: config.get<string>('REDIS_USERNAME') || undefined,
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          tls: config.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
          maxRetriesPerRequest: null,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
