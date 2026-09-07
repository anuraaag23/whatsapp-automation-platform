import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SUPER_ADMIN_KEY } from '../decorators/super-admin.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Registered globally (see auth.module.ts, alongside JwtAuthGuard and
 * RolesGuard) so every route in the app is checked, not just ones someone
 * remembered to individually protect. A no-op unless @SuperAdminOnly() is
 * present, exactly like RolesGuard is a no-op unless @Roles() is present.
 *
 * Runs after JwtAuthGuard in the guard chain, so request.user is already
 * populated by then — and JwtStrategy.validate() re-reads isSuperAdmin from
 * the User row on every single request (never trusts a cached JWT claim
 * for it), so revoking Super Admin takes effect immediately, not just after
 * the token expires.
 *
 * Unauthenticated requests never reach here at all — JwtAuthGuard rejects
 * those with 401 first. A request that IS authenticated but not
 * isSuperAdmin gets 403, per the required Authentication → user validation
 * → SUPER_ADMIN authorization → permission check → admin API flow.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresSuperAdmin = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiresSuperAdmin) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Super Admin access required');
    }

    return true;
  }
}
