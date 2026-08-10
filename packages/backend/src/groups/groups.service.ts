import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.contactGroup.findMany({
      where: { organizationId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const group = await this.prisma.contactGroup.findFirst({
      where: { id, organizationId },
      include: { members: { include: { contact: true } } },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  create(organizationId: string, name: string) {
    return this.prisma.contactGroup.create({ data: { organizationId, name } });
  }

  async rename(organizationId: string, id: string, name: string) {
    await this.findOne(organizationId, id);
    return this.prisma.contactGroup.update({ where: { id }, data: { name } });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.contactGroup.delete({ where: { id } });
    return { success: true };
  }

  async addMembers(organizationId: string, id: string, contactIds: string[]) {
    await this.findOne(organizationId, id);
    await this.prisma.contactGroupMember.createMany({
      data: contactIds.map((contactId) => ({ groupId: id, contactId })),
      skipDuplicates: true,
    });
    return this.findOne(organizationId, id);
  }

  async removeMember(organizationId: string, id: string, contactId: string) {
    await this.findOne(organizationId, id);
    await this.prisma.contactGroupMember.delete({
      where: { contactId_groupId: { contactId, groupId: id } },
    });
    return { success: true };
  }
}
