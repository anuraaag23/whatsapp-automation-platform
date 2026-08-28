import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

interface ListParams {
  search?: string;
  tagId?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(organizationId: string, params: ListParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 25;

    const where = {
      organizationId,
      isArchived: params.isArchived ?? false,
      ...(params.isFavorite !== undefined ? { isFavorite: params.isFavorite } : {}),
      ...(params.tagId ? { tags: { some: { tagId: params.tagId } } } : {}),
      ...(params.search
        ? {
            OR: [
              { firstName: { contains: params.search, mode: 'insensitive' as const } },
              { lastName: { contains: params.search, mode: 'insensitive' as const } },
              { phoneNumber: { contains: params.search } },
              { email: { contains: params.search, mode: 'insensitive' as const } },
              { company: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: { tags: { include: { tag: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId },
      include: { tags: { include: { tag: true } }, groups: { include: { group: true } } },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async create(organizationId: string, dto: CreateContactDto) {
    const { tagIds, customFields, ...rest } = dto;

    // Try to create directly — the unique constraint on (organizationId, phoneNumber)
    // is the source of truth for concurrency. If a concurrent request creates the
    // same contact first, we'll get P2002 and throw ConflictException to signal
    // a duplicate to the caller (API should return 409). The inbound message
    // path (InboundMessageService.findOrCreateContact) catches this and re-reads.
    try {
      const contact = await this.prisma.contact.create({
        data: {
          ...rest,
          organizationId,
          phoneNumber: dto.phoneNumber,
          optInStatus: 'PENDING',
          ...(customFields ? { customFields: customFields as Prisma.InputJsonValue } : {}),
          ...(tagIds?.length
            ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } }
            : {}),
        },
        include: { tags: { include: { tag: true } } },
      });

      this.events.emit('contact.created', {
        organizationId,
        contactId: contact.id,
        variables: {
          first_name: contact.firstName ?? '',
          last_name: contact.lastName ?? '',
          company: contact.company ?? '',
          city: contact.city ?? '',
        },
      });

      return contact;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Duplicate phone number — throw ConflictException for API callers
        // (InboundMessageService.findOrCreateContact catches this and re-reads)
        throw new ConflictException('Contact with this phone number already exists');
      }
      throw error;
    }
  }

  async update(organizationId: string, id: string, dto: UpdateContactDto) {
    await this.findOne(organizationId, id);
    const { tagIds, customFields, ...rest } = dto;

    return this.prisma.contact.update({
      where: { id },
      data: {
        ...rest,
        ...(customFields ? { customFields: customFields as Prisma.InputJsonValue } : {}),
        ...(tagIds
          ? { tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      include: { tags: { include: { tag: true } } },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.contact.delete({ where: { id } });
    return { success: true };
  }

  /** Bulk actions for multi-select in the Contacts table. All scoped to the org, silently skipping IDs outside it. */
  async bulkAddTag(organizationId: string, contactIds: string[], tagId: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } });
    if (!tag) throw new NotFoundException('Tag not found');

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds }, organizationId },
      select: { id: true },
    });

    await this.prisma.contactTag.createMany({
      data: contacts.map((c: { id: string }) => ({ contactId: c.id, tagId })),
      skipDuplicates: true,
    });

    return { updated: contacts.length };
  }

  async bulkSetArchived(organizationId: string, contactIds: string[], isArchived: boolean) {
    const result = await this.prisma.contact.updateMany({
      where: { id: { in: contactIds }, organizationId },
      data: { isArchived },
    });
    return { updated: result.count };
  }

  async bulkDelete(organizationId: string, contactIds: string[]) {
    const result = await this.prisma.contact.deleteMany({
      where: { id: { in: contactIds }, organizationId },
    });
    return { deleted: result.count };
  }

  async setArchived(organizationId: string, id: string, isArchived: boolean) {
    await this.findOne(organizationId, id);
    return this.prisma.contact.update({ where: { id }, data: { isArchived } });
  }

  async setFavorite(organizationId: string, id: string, isFavorite: boolean) {
    await this.findOne(organizationId, id);
    return this.prisma.contact.update({ where: { id }, data: { isFavorite } });
  }

  async setOptIn(organizationId: string, id: string, optedIn: boolean) {
    await this.findOne(organizationId, id);
    return this.prisma.contact.update({
      where: { id },
      data: optedIn
        ? { optInStatus: 'OPTED_IN', optInAt: new Date() }
        : { optInStatus: 'OPTED_OUT', optOutAt: new Date() },
    });
  }

  /** Adds a single tag and emits contact.tag_added for the TAG_ADDED automation trigger. */
  async addTag(organizationId: string, contactId: string, tagId: string) {
    const contact = await this.findOne(organizationId, contactId);
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } });
    if (!tag) throw new NotFoundException('Tag not found');

    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      create: { contactId, tagId },
      update: {},
    });

    this.events.emit('contact.tag_added', {
      organizationId,
      contactId,
      tagId,
      tagName: tag.name,
      variables: {
        first_name: contact.firstName ?? '',
        last_name: contact.lastName ?? '',
        company: contact.company ?? '',
        city: contact.city ?? '',
        tag: tag.name,
      },
    });

    return this.findOne(organizationId, contactId);
  }

  /** Parses CSV text and bulk-upserts contacts by (organizationId, phoneNumber). */
  async importCsv(organizationId: string, csv: string) {
    const rows = this.parseCsv(csv);
    let created = 0;
    let updated = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const phoneNumber = row.phonenumber ?? row.phone ?? row.mobile;

      if (!phoneNumber || !/^\+?[1-9]\d{6,14}$/.test(phoneNumber)) {
        errors.push({ row: i + 2, message: `Invalid or missing phone number: "${phoneNumber ?? ''}"` });
        continue;
      }

      const existing = await this.prisma.contact.findUnique({
        where: { organizationId_phoneNumber: { organizationId, phoneNumber } },
      });

      const data = {
        firstName: row.firstname ?? row.first_name ?? undefined,
        lastName: row.lastname ?? row.last_name ?? undefined,
        email: row.email ?? undefined,
        company: row.company ?? undefined,
        city: row.city ?? undefined,
      };

      if (existing) {
        await this.prisma.contact.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await this.prisma.contact.create({
          data: { ...data, phoneNumber, organizationId, optInStatus: 'PENDING' },
        });
        created++;
      }
    }

    return { created, updated, failed: errors.length, errors, totalRows: rows.length };
  }

  async listTags(organizationId: string) {
    return this.prisma.tag.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
  }

  async createTag(organizationId: string, name: string, color?: string) {
    return this.prisma.tag.create({
      data: { organizationId, name, color: color ?? '#0A84FF' },
    });
  }

  private parseCsv(csv: string): Record<string, string>[] {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return [];

    const headers = this.splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

    return lines.slice(1).map((line) => {
      const values = this.splitCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = (values[idx] ?? '').trim();
      });
      return row;
    });
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}
