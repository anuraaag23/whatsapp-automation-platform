import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Role } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { EmailSenderService } from '../notifications/senders/email-sender.service';
import { ROLE } from '../common/constants/role.constants';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const INVITE_EXPIRY_DAYS = 7;

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
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly emailSender: EmailSenderService,
  ) {}

  /**
   * Creates a brand-new organization owned by an existing user — this is
   * what makes "multi-org" real: the same person can now be OWNER of one
   * workspace and a MANAGER of another, switching between them via
   * POST /auth/switch-organization.
   */
  async createAdditionalOrganization(userId: string, name: string) {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let suffix = 1;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++suffix}`;
    }

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      const organization = await tx.organization.create({ data: { name, slug } });
      await tx.organizationMember.create({
        data: { userId, organizationId: organization.id, role: ROLE.OWNER, isActive: true },
      });
      return organization;
    });
  }

  async listMembers(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /**
   * Invites someone into this organization by email. If they already have a
   * platform account, they're added immediately. If not, a real invite
   * (with a token and an expiry) is created and, if the org has SMTP
   * configured in Settings > Notification Channels, an actual email is
   * sent with a signup link. Without SMTP configured, the invite still
   * exists — it's just visible via listPendingInvites instead of emailed.
   */
  async inviteMember(organizationId: string, email: string, role: Role, invitedByUserId: string) {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const existingMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: existingUser.id, organizationId } },
      });
      if (existingMembership) {
        if (existingMembership.isActive) {
          throw new ConflictException(`${email} is already a member of this organization`);
        }
        return this.prisma.organizationMember.update({
          where: { id: existingMembership.id },
          data: { isActive: true, role },
        });
      }

      return this.prisma.organizationMember.create({
        data: { userId: existingUser.id, organizationId, role },
      });
    }

    // No account yet — create a real pending invite instead of failing.
    const pendingInvite = await this.prisma.organizationInvite.findFirst({
      where: { organizationId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pendingInvite) {
      throw new ConflictException(`${email} already has a pending invite to this organization`);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const [organization, inviter] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: invitedByUserId } }),
    ]);

    const invite = await this.prisma.organizationInvite.create({
      data: {
        organizationId,
        email,
        role,
        token,
        invitedByUserId,
        expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await this.sendInviteEmail(organizationId, email, organization.name, inviter, token);

    return { invited: true, email, expiresAt: invite.expiresAt };
  }

  async listPendingInvites(organizationId: string) {
    return this.prisma.organizationInvite.findMany({
      where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(organizationId: string, inviteId: string) {
    const invite = await this.prisma.organizationInvite.findFirst({ where: { id: inviteId, organizationId } });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.prisma.organizationInvite.delete({ where: { id: inviteId } });
    return { success: true };
  }

  /** Used by the register page to show "You've been invited to join X" before signup. */
  async previewInvite(token: string) {
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { token },
      include: { organization: { select: { name: true } } },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new NotFoundException('This invite is invalid or has expired');
    }
    return { email: invite.email, organizationName: invite.organization.name, role: invite.role };
  }

  async removeMember(organizationId: string, targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new BadRequestException('You cannot remove yourself from an organization this way');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
    if (!membership) throw new NotFoundException('That user is not a member of this organization');

    await this.prisma.organizationMember.update({
      where: { id: membership.id },
      data: { isActive: false },
    });

    return { success: true };
  }

  private async sendInviteEmail(
    organizationId: string,
    email: string,
    organizationName: string,
    inviter: { firstName: string; lastName: string },
    token: string,
  ) {
    const settings = await this.prisma.notificationSettings.findUnique({ where: { organizationId } });
    if (!settings?.emailEnabled || !settings.smtpHost || !settings.smtpPort) {
      // No SMTP configured — the invite still exists in the DB (visible via
      // listPendingInvites), it just isn't emailed. Not a failure.
      return;
    }

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    await this.emailSender.send({
      host: settings.smtpHost,
      port: settings.smtpPort,
      user: settings.smtpUser ?? '',
      password: settings.smtpPasswordCiphertext ? this.crypto.decrypt(settings.smtpPasswordCiphertext) : '',
      from: settings.smtpFromAddress ?? settings.smtpUser ?? 'no-reply@example.com',
      to: email,
      subject: `${inviter.firstName} invited you to join ${organizationName}`,
      text:
        `${inviter.firstName} ${inviter.lastName} invited you to join "${organizationName}" ` +
        `on the WhatsApp Automation Platform.\n\n` +
        `Accept your invite: ${appUrl}/register?invite=${token}\n\n` +
        `This link expires in ${INVITE_EXPIRY_DAYS} days.`,
    });
  }
}
