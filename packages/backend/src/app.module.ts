import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ContactsModule } from './contacts/contacts.module';
import { ConversationsModule } from './conversations/conversations.module';
import { TemplatesModule } from './templates/templates.module';
import { MessagesModule } from './messages/messages.module';
import { SchedulesModule } from './schedules/schedules.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { GroupsModule } from './groups/groups.module';
import { SegmentsModule } from './segments/segments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SearchModule } from './search/search.module';
import { AiModule } from './ai/ai.module';
import { AutomationsModule } from './automations/automations.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    CryptoModule,
    QueueModule,
    AuthModule,
    UsersModule,
    WhatsappModule,
    ContactsModule,
    ConversationsModule,
    TemplatesModule,
    MessagesModule,
    SchedulesModule,
    CampaignsModule,
    DashboardModule,
    SettingsModule,
    GroupsModule,
    SegmentsModule,
    NotificationsModule,
    AnalyticsModule,
    SearchModule,
    AiModule,
    AutomationsModule,
    OrganizationsModule,
    HealthModule,
    AuditModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
