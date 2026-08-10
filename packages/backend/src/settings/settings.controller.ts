import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ROLE } from '../common/constants/role.constants';
import { SettingsService } from './settings.service';
import { ConnectWhatsappAccountDto } from './dto/connect-whatsapp-account.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('organization')
  getOrganization(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getOrganization(user.organizationId);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Patch('organization')
  updateOrganization(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationDto) {
    return this.settingsService.updateOrganization(user.organizationId, dto);
  }

  @Get('whatsapp-account')
  getWhatsappAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getWhatsappAccount(user.organizationId);
  }

  @Get('whatsapp-account/status')
  getWhatsappAccountStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getWhatsappAccountStatus(user.organizationId);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Post('whatsapp-account')
  connectWhatsappAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectWhatsappAccountDto,
  ) {
    return this.settingsService.connectWhatsappAccount(user.organizationId, dto);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Delete('whatsapp-account')
  disconnectWhatsappAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.disconnectWhatsappAccount(user.organizationId);
  }

  @Get('api-keys')
  listApiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.listApiKeys(user.organizationId);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Post('api-keys')
  createApiKey(@CurrentUser() user: AuthenticatedUser, @Body() body: { name: string }) {
    return this.settingsService.createApiKey(user.organizationId, body.name);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Delete('api-keys/:id')
  revokeApiKey(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.settingsService.revokeApiKey(user.organizationId, id);
  }

  @Get('notifications')
  getNotificationSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getNotificationSettings(user.organizationId);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Patch('notifications')
  updateNotificationSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.settingsService.updateNotificationSettings(user.organizationId, dto);
  }
}
