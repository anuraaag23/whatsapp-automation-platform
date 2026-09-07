import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: string;
  organizationId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Re-checks membership and role live on every request instead of trusting
   * the JWT's embedded role/org claims verbatim. This is what makes both
   * role changes (an admin demoting someone) and organization switching take
   * effect immediately rather than only after the token naturally expires.
   * organizationId itself is trusted from the signed payload — it can't be
   * tampered with without the signing secret — but access to that org is
   * re-verified against OrganizationMember every time.
   *
   * isSuperAdmin and the organization's SUSPENDED status are re-read here
   * for the exact same reason: a Super Admin revoking someone's access (or
   * suspending an organization) needs to take effect on that user's very
   * next request, not linger until their current token expires.
   */
  async validate(payload: JwtAccessPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is not active or no longer exists');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: payload.organizationId } },
      include: { organization: { select: { status: true } } },
    });

    if (!membership || !membership.isActive) {
      throw new UnauthorizedException('You no longer have access to this organization');
    }

    // Super Admins are exempt — the platform owner needs to be able to log
    // in and act on a suspended organization (to investigate or reverse
    // the suspension), not get locked out by their own suspension.
    if (membership.organization.status === 'SUSPENDED' && !user.isSuperAdmin) {
      throw new UnauthorizedException('This organization has been suspended');
    }

    return {
      userId: user.id,
      email: user.email,
      role: membership.role,
      organizationId: payload.organizationId,
      isSuperAdmin: user.isSuperAdmin,
    };
  }
}
