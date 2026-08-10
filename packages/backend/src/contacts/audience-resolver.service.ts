import { Injectable } from '@nestjs/common';
import type { AudienceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AudienceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    organizationId: string,
    audienceType: AudienceType,
    audienceRef: Prisma.JsonValue,
  ): Promise<string[]> {
    const ref = (audienceRef ?? {}) as Record<string, unknown>;

    switch (audienceType) {
      case 'ALL_CONTACTS': {
        const contacts = await this.prisma.contact.findMany({
          where: { organizationId, isArchived: false, optInStatus: 'OPTED_IN' },
          select: { id: true },
        });
        return contacts.map((c: { id: string }) => c.id);
      }
      case 'SEGMENT': {
        const contacts = await this.prisma.contact.findMany({
          where: { organizationId, segments: { some: { segmentId: ref.segmentId as string } } },
          select: { id: true },
        });
        return contacts.map((c: { id: string }) => c.id);
      }
      case 'GROUP': {
        const contacts = await this.prisma.contact.findMany({
          where: { organizationId, groups: { some: { groupId: ref.groupId as string } } },
          select: { id: true },
        });
        return contacts.map((c: { id: string }) => c.id);
      }
      case 'TAG': {
        const contacts = await this.prisma.contact.findMany({
          where: { organizationId, tags: { some: { tagId: ref.tagId as string } } },
          select: { id: true },
        });
        return contacts.map((c: { id: string }) => c.id);
      }
      case 'CUSTOM_LIST':
        return Array.isArray(ref.contactIds) ? (ref.contactIds as string[]) : [];
      default:
        return [];
    }
  }
}
