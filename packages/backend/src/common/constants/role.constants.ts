/**
 * Runtime values for the Role enum, defined locally instead of importing
 * Role as a value from '@prisma/client'.
 *
 * Why: decorators like @Roles(Role.OWNER, Role.ADMIN) and @IsEnum(Role)
 * dereference the enum as a plain JS object at MODULE LOAD time (not per
 * request). In some container/environment configurations, @prisma/client's
 * generated enum export isn't reliably populated at that exact timing —
 * this has been observed causing `Cannot convert undefined or null to
 * object` crashes from class-validator's IsEnum. Since Prisma's Role enum
 * is just a fixed set of strings that mirrors schema.prisma exactly, this
 * local constant removes that fragile runtime dependency entirely while
 * keeping full type-safety: import { Role } from '@prisma/client' is still
 * used everywhere for TYPES (erased at compile time, so it's never fragile).
 *
 * If you add/remove a role in schema.prisma, update this list to match.
 */
export const ROLE = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SUPPORT: 'SUPPORT',
  VIEWER: 'VIEWER',
} as const;

export const ALL_ROLES = Object.values(ROLE);
