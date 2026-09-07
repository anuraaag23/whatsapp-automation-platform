import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminQuotaController } from './super-admin-quota.controller';
import { SuperAdminService } from './super-admin.service';
import { QueueModule } from '../queue/queue.module';
import { AuditModule } from '../audit/audit.module';
import { QuotaModule } from '../quota/quota.module';

@Module({
  // MESSAGE_DISPATCH_QUEUE comes from QueueModule's own export — see its
  // docstring. Do not re-register it here with BullModule.registerQueue.
  imports: [QueueModule, AuditModule, QuotaModule],
  controllers: [SuperAdminController, SuperAdminQuotaController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
