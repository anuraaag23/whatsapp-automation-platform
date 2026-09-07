import { Controller, Get, Post, Patch, Param, Query, Body, ParseBoolPipe } from '@nestjs/common';
import { SuperAdminOnly } from '../common/decorators/super-admin.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SuperAdminService } from './super-admin.service';

/**
 * Every route in this controller requires SuperAdminGuard's check to pass
 * (@SuperAdminOnly() at class level applies to every handler — see
 * super-admin.guard.ts). JwtAuthGuard runs first (registered before it in
 * auth.module.ts), so:
 *   - No token at all            -> 401, never reaches here
 *   - Valid token, not super admin -> 403, thrown by SuperAdminGuard
 *   - Valid token, super admin     -> reaches the handler
 *
 * None of these handlers trust a client-supplied organizationId/userId for
 * anything beyond "which row to look up" — every lookup re-validates
 * existence server-side (see SuperAdminService), and every mutation is
 * audited.
 */
@Controller('super-admin')
@SuperAdminOnly()
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('overview')
  getOverview() {
    return this.superAdminService.getOverview();
  }

  @Get('health')
  getHealth() {
    return this.superAdminService.getHealth();
  }

  @Get('organizations')
  listOrganizations(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.superAdminService.listOrganizations({
      search,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('organizations/:id')
  getOrganization(@Param('id') id: string) {
    return this.superAdminService.getOrganization(id);
  }

  @Post('organizations/:id/suspend')
  suspendOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.superAdminService.suspendOrganization(id, user.userId, body?.reason);
  }

  @Post('organizations/:id/activate')
  activateOrganization(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.superAdminService.activateOrganization(id, user.userId);
  }

  @Get('users')
  listUsers(
    @Query('search') search?: string,
    @Query('organizationId') organizationId?: string,
    @Query('isActive') isActive?: string,
    @Query('emailVerified') emailVerified?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.superAdminService.listUsers({
      search,
      organizationId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      emailVerified: emailVerified === undefined ? undefined : emailVerified === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Patch('users/:id/active')
  setUserActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('isActive', new ParseBoolPipe()) isActive: boolean,
  ) {
    return this.superAdminService.setUserActive(id, user.userId, isActive);
  }

  @Get('audit')
  listAudit(
    @Query('organizationId') organizationId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.superAdminService.listAudit({
      organizationId,
      action,
      entityType,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
