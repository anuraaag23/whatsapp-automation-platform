import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { IsIn } from 'class-validator';
import { UsersService } from './users.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ROLE, ALL_ROLES } from '../common/constants/role.constants';

class UpdateRoleDto {
  @IsIn(ALL_ROLES)
  role!: Role;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listForOrganization(user.organizationId);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Patch(':id/role')
  async updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.usersService.updateRole(user.organizationId, id, dto.role);
  }

  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @Patch(':id/deactivate')
  async deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.deactivate(user.organizationId, id);
  }
}
