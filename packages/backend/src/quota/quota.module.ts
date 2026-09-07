import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
