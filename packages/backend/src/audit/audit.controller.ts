import { Controller, Get, Query } from '@nestjs/common';
import { ROLE } from '../common/constants/role.constants';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@Roles(ROLE.OWNER, ROLE.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditService.list(user.organizationId, {
      action,
      entityType,
      userId,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('filter-options')
  filterOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.auditService.listFilterOptions(user.organizationId);
  }
}
