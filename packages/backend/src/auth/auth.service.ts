import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TransactionalEmailService } from './transactional-email.service';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'organization'
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly transactionalEmail: TransactionalEmailService,
  ) {}

  /**
   * The single, correct place email-verification/password-reset links get
   * their base URL from. Previously these links reused CORS_ORIGIN
   * directly — which is meant to be a comma-separated *list* of allowed
   * origins (see main.ts), not a single clean URL. That meant a link could
   * come out malformed if CORS_ORIGIN ever held more than one value, and
   * more importantly meant links silently kept pointing at whatever
   * CORS_ORIGIN happened to be set to — including a now-dead URL after a
   * Vercel project rename, with nothing forcing you to remember to update
   * this specific usage too. FRONTEND_URL is the explicit, single source
   * of truth going forward; CORS_ORIGIN's first entry is only a fallback
   * for setups that haven't set the new var yet.
   */
  private getFrontendUrl(): string {
    const explicit = this.config.get<string>('FRONTEND_URL');
    if (explicit) return explicit.replace(/\/$/, '');

    const corsOrigin = this.config.get<string>('CORS_ORIGIN');
    const firstOrigin = corsOrigin?.split(',')[0]?.trim();
    return firstOrigin || 'http://localhost:3000';
  }

  /**
   * Creates a new account. Two paths:
   * - Normal signup: creates a brand new organization, user becomes OWNER.
   * - Invite signup (dto.inviteToken set): joins the inviting organization
   *   at the invited role instead of creating a new org, and marks the
   *   invite accepted.
   */
  async register(dto: RegisterDto, ip?: string): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);

    if (dto.inviteToken) {
      return this.registerViaInvite(dto, passwordHash, ip);
    }

    if (!dto.organizationName) {
      throw new ConflictException('organizationName is required when not registering via an invite');
    }

    const baseSlug = slugify(dto.organizationName);
    let slug = baseSlug;
    let suffix = 1;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++suffix}`;
    }

    const user = await this.prisma.$transaction(async (tx: TransactionClient) => {
      const organization = await tx.organization.create({
        data: { name: dto.organizationName as string, slug },
      });

      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'OWNER',
          organizationId: organization.id,
        },
      });

      await tx.organizationMember.create({
        data: {
          userId: createdUser.id,
          organizationId: organization.id,
          role: 'OWNER',
        },
      });

      return createdUser;
    });

    await this.audit(user.organizationId, user.id, 'auth.register', 'User', user.id, ip);

    // Fire-and-forget: verification email shouldn't block or fail signup —
    // if SMTP is down, the user can still use the app and hit "resend"
    // later from the verification banner.
    this.sendVerificationEmail(user.id, user.email).catch(() => undefined);

    return this.issueTokenPair(user.id, user.email, user.role, user.organizationId, ip);
  }

  private async registerViaInvite(dto: RegisterDto, passwordHash: string, ip?: string): Promise<TokenPair> {
    const invite = await this.prisma.organizationInvite.findUnique({ where: { token: dto.inviteToken } });

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new UnauthorizedException('This invite is invalid or has expired');
    }
    if (invite.email !== dto.email) {
      throw new ConflictException('This invite was issued for a different email address');
    }

    const user = await this.prisma.$transaction(async (tx: TransactionClient) => {
      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: invite.role,
          organizationId: invite.organizationId,
        },
      });

      await tx.organizationMember.create({
        data: { userId: createdUser.id, organizationId: invite.organizationId, role: invite.role },
      });

      await tx.organizationInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return createdUser;
    });

    await this.audit(user.organizationId, user.id, 'auth.register_via_invite', 'User', user.id, ip);

    this.sendVerificationEmail(user.id, user.email).catch(() => undefined);

    return this.issueTokenPair(user.id, user.email, user.role, user.organizationId, ip);
  }

  async login(dto: LoginDto, ip?: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.audit(user.organizationId, user.id, 'auth.login', 'User', user.id, ip);

    return this.issueTokenPair(user.id, user.email, user.role, user.organizationId, ip);
  }

  /** Validates the presented refresh token, rotates it, and issues a new pair. */
  async refresh(rawRefreshToken: string, ip?: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    if (!stored.user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    return this.issueTokenPair(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      stored.user.organizationId,
      ip,
    );
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Lists every organization the user is an active member of, for the org switcher. */
  async listMyOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, isActive: true },
      include: { organization: { select: { id: true, name: true, slug: true, logoUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m: { organization: unknown; role: string }) => ({
      organization: m.organization,
      role: m.role,
    }));
  }

  /**
   * Issues a fresh token pair scoped to a different organization the user
   * is a member of. Membership + active status are re-checked here, not
   * assumed — this is the one place a user's org context actually changes.
   */
  async switchOrganization(userId: string, targetOrganizationId: string, ip?: string): Promise<TokenPair> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: targetOrganizationId } },
    });

    if (!membership || !membership.isActive) {
      throw new UnauthorizedException('You are not an active member of that organization');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    await this.audit(targetOrganizationId, userId, 'auth.switch_organization', 'Organization', targetOrganizationId, ip);

    return this.issueTokenPair(userId, user.email, membership.role, targetOrganizationId, ip);
  }

  // ---------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------

  /**
   * Always returns successfully whether or not the email exists — this is
   * deliberate. Returning a different response for "no such account" lets
   * an attacker enumerate which emails are registered; the UI shows the
   * same "check your email" message either way.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const resetUrl = `${this.getFrontendUrl()}/reset-password?token=${rawToken}`;

    await this.transactionalEmail.sendPasswordReset(user.email, resetUrl);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('This reset link is invalid or has expired');
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });
      // Revoke every existing refresh token — a leaked/forgotten password
      // being reset should also kick out any session that had it.
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (user) {
      await this.audit(user.organizationId, user.id, 'auth.password_reset', 'User', user.id);
    }
  }

  // ---------------------------------------------------------------------
  // Email verification
  // ---------------------------------------------------------------------

  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.emailVerificationToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    const verifyUrl = `${this.getFrontendUrl()}/verify-email?token=${rawToken}`;

    await this.transactionalEmail.sendEmailVerification(email, verifyUrl);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('This verification link is invalid or has expired');
    }

    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.user.update({
        where: { id: stored.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      });
      await tx.emailVerificationToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });
    });

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (user) {
      await this.audit(user.organizationId, user.id, 'auth.email_verified', 'User', user.id);
    }
  }

  /** Re-sends a verification email for the currently authenticated user. */
  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) return;

    await this.sendVerificationEmail(user.id, user.email);
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    role: string,
    organizationId: string,
    ip?: string,
  ): Promise<TokenPair> {
    const payload = { sub: userId, email, role, organizationId };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresInDays = this.parseDaysFromExpiry(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        createdByIp: ip,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private parseDaysFromExpiry(expiry: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) return 7;
    const value = Number(match[1]);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value / 86400;
      case 'm':
        return value / 1440;
      case 'h':
        return value / 24;
      default:
        return value;
    }
  }

  private async audit(
    organizationId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    ip?: string,
  ) {
    await this.prisma.auditLog.create({
      data: { organizationId, userId, action, entityType, entityId, ipAddress: ip },
    });
  }
}
