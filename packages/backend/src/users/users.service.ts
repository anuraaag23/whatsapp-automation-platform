import { Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SAFE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  emailVerified: true,
  organizationId: true,
  createdAt: true,
  organization: {
    select: { id: true, name: true, slug: true, logoUrl: true, timezone: true, theme: true },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Lists everyone with active access to `organizationId` — including users
   * whose *home* organization is somewhere else entirely, but who were
   * invited in as a member here. Previously this filtered on User.organizationId
   * (a user's permanent home org), so invited members from another org
   * silently never appeared in Settings > Members at all — this now queries
   * OrganizationMember, the actual source of truth for "who has access to
   * this org," the same way JwtStrategy/switchOrganization already do.
   */
  async listForOrganization(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId, isActive: true },
      orderBy: { joinedAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            isActive: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
    });

    return members.map((m) => ({
      ...m.user,
      role: m.role,
      organizationId,
    }));
  }

  /**
   * Updates a member's role within `organizationId` specifically. This only
   * touches OrganizationMember.role, never User.role (the user's home-org
   * default) — JwtStrategy always derives the live role from
   * OrganizationMember, so writing to User.role here was both unnecessary
   * and actively wrong whenever the target user's home org differed from
   * `organizationId`: an admin in org B would have silently overwritten a
   * guest member's default role in their own home org A.
   */
  async updateRole(organizationId: string, userId: string, role: Role) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership || !membership.isActive) {
      throw new NotFoundException('User not found in this organization');
    }

    await this.prisma.organizationMember.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { role },
    });

    return this.listForOrganization(organizationId).then((members) =>
      members.find((m) => m.id === userId),
    );
  }

  /**
   * Deactivates a member's access to `organizationId` specifically — not
   * their account globally. The previous version set User.isActive = false,
   * which locks a user out of every organization they belong to, including
   * ones where they're the OWNER. An org B admin removing a guest member
   * should never be able to lock that person out of their own home
   * organization A.
   */
  async deactivate(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership || !membership.isActive) {
      throw new NotFoundException('User not found in this organization');
    }

    await this.prisma.organizationMember.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { isActive: false },
    });

    return { userId, organizationId, isActive: false };
  }
}
