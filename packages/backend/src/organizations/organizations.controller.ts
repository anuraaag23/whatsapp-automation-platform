import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsEmail, IsIn, IsString } from 'class-validator';
import type { Role } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ROLE, ALL_ROLES } from '../common/constants/role.constants';

class CreateOrganizationDto {
  @IsString()
  name!: string;
}

class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(ALL_ROLES)
  role!: Role;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.createAdditionalOrganization(user.userId, dto.name);
  }

  @Get('members')
  listMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listMembers(user.organizationId);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Post('invite')
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteMemberDto) {
    return this.organizationsService.inviteMember(user.organizationId, dto.email, dto.role, user.userId);
  }

  @Get('invites')
  listPendingInvites(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listPendingInvites(user.organizationId);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Delete('invites/:id')
  revokeInvite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizationsService.revokeInvite(user.organizationId, id);
  }

  /** Public — called by the registration page before the user has an account. */
  @Public()
  @Get('invites/preview/:token')
  previewInvite(@Param('token') token: string) {
    return this.organizationsService.previewInvite(token);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Delete('members/:userId')
  removeMember(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.organizationsService.removeMember(user.organizationId, userId, user.userId);
  }
}
