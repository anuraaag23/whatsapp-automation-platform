import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SegmentRule {
  field: 'city' | 'company' | 'optInStatus' | 'tag';
  operator: 'equals' | 'contains';
  value: string;
}

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.segment.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const segment = await this.prisma.segment.findFirst({ where: { id, organizationId } });
    if (!segment) throw new NotFoundException('Segment not found');
    return segment;
  }

  create(organizationId: string, name: string, description: string | undefined, rules: SegmentRule[]) {
    return this.prisma.segment.create({
      data: { organizationId, name, description, rules: rules as unknown as Prisma.InputJsonValue },
    });
  }

  async update(
    organizationId: string,
    id: string,
    name: string,
    description: string | undefined,
    rules: SegmentRule[],
  ) {
    await this.findOne(organizationId, id);
    return this.prisma.segment.update({
      where: { id },
      data: { name, description, rules: rules as unknown as Prisma.InputJsonValue },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.segment.delete({ where: { id } });
    return { success: true };
  }

  /** Evaluates the segment's rules live against the contacts table (AND-combined). */
  async previewMatchCount(organizationId: string, rules: SegmentRule[]): Promise<number> {
    const where = this.buildWhere(organizationId, rules);
    return this.prisma.contact.count({ where });
  }

  async matchingContactIds(organizationId: string, id: string): Promise<string[]> {
    const segment = await this.findOne(organizationId, id);
    const where = this.buildWhere(organizationId, segment.rules as unknown as SegmentRule[]);
    const contacts = await this.prisma.contact.findMany({ where, select: { id: true } });
    return contacts.map((c: { id: string }) => c.id);
  }

  private buildWhere(organizationId: string, rules: SegmentRule[]): Prisma.ContactWhereInput {
    const conditions: Prisma.ContactWhereInput[] = rules.map((rule) => {
      if (rule.field === 'tag') {
        return { tags: { some: { tag: { name: rule.value } } } };
      }
      if (rule.field === 'optInStatus') {
        return { optInStatus: rule.value } as unknown as Prisma.ContactWhereInput;
      }
      return {
        [rule.field]:
          rule.operator === 'equals' ? rule.value : { contains: rule.value, mode: 'insensitive' },
      } as Prisma.ContactWhereInput;
    });

    return { organizationId, isArchived: false, AND: conditions };
  }
}
