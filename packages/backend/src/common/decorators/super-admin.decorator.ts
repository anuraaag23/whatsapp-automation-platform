import { SetMetadata } from '@nestjs/common';

export const SUPER_ADMIN_KEY = 'superAdminOnly';

/**
 * Marks a route as accessible only to platform Super Admins — see
 * SuperAdminGuard. Deliberately separate from @Roles(): Role/RolesGuard is
 * about a user's role WITHIN their current organization (OWNER/ADMIN/...),
 * whereas Super Admin is a platform-level flag on the User row itself,
 * independent of organization membership or role entirely.
 */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_KEY, true);
