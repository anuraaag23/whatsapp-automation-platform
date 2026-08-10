import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to one or more roles.
 * Usage: @Roles(ROLE.OWNER, ROLE.ADMIN) — import ROLE from
 * '../constants/role.constants', not Role as a value from '@prisma/client'.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
