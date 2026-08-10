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
   */
  async validate(payload: JwtAccessPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is not active or no longer exists');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: payload.organizationId } },
    });

    if (!membership || !membership.isActive) {
      throw new UnauthorizedException('You no longer have access to this organization');
    }

    return {
      userId: user.id,
      email: user.email,
      role: membership.role,
      organizationId: payload.organizationId,
    };
  }
}
