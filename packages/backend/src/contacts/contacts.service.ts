import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QuotaService, QuotaExceededException } from '../quota/quota.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

interface ListParams {
  search?: string;
  tagId?: string;
  tagIds?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  optInStatus?: 'PENDING' | 'OPTED_IN' | 'OPTED_OUT';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly quota: QuotaService,
  ) {}

  async list(organizationId: string, params: ListParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 25;

    // Support both a single tagId and a comma-separated list of tagIds (AND semantics:
    // a contact must have ALL of the requested tags — the common CRM expectation for
    // multi-tag filters). Falls back to a single-tag OR-style match for tagId alone.
    const allTagIds = params.tagIds?.length ? params.tagIds : params.tagId ? [params.tagId] : [];

    const where = {
      organizationId,
      isArchived: params.isArchived ?? false,
      ...(params.isFavorite !== undefined ? { isFavorite: params.isFavorite } : {}),
      ...(params.optInStatus ? { optInStatus: params.optInStatus } : {}),
      ...(allTagIds.length
        ? { AND: allTagIds.map((tagId) => ({ tags: { some: { tagId } } })) }
        : {}),
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

  /**
   * `enforceQuota` defaults to true (the normal, explicit "add a contact"
   * path — UI, API, CSV import) but MUST be passed false from
   * InboundMessageService's auto-create-on-first-message path: an inbound
   * WhatsApp message has to be able to create its sender's contact record
   * regardless of the organization's contact quota, or the message itself
   * can never be persisted/associated — silently breaking inbound
   * processing is far worse than one org's contact count running over its
   * limit by however many people message them this month. See the brief's
   * own "do not blindly block system/internal operations" requirement.
   */
  async create(organizationId: string, dto: CreateContactDto, actorUserId?: string, enforceQuota = true) {
    const { tagIds, customFields, ...rest } = dto;

    if (enforceQuota) {
      await this.quota.assertWithinLimit(organizationId, 'contacts');
    }

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
          opt_in_status: contact.optInStatus,
          tags: contact.tags.map((t) => t.tag.name).join(', '),
        },
      });

      this.audit.record({
        organizationId,
        userId: actorUserId,
        action: 'contact.created',
        entityType: 'Contact',
        entityId: contact.id,
        metadata: { phoneNumber: contact.phoneNumber },
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

  async update(organizationId: string, id: string, dto: UpdateContactDto, actorUserId?: string) {
    await this.findOne(organizationId, id);
    const { tagIds, customFields, ...rest } = dto;

    const updated = await this.prisma.contact.update({
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

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'contact.updated',
      entityType: 'Contact',
      entityId: id,
      metadata: { fields: Object.keys(rest) },
    });

    return updated;
  }

  async remove(organizationId: string, id: string, actorUserId?: string) {
    await this.findOne(organizationId, id);
    await this.prisma.contact.delete({ where: { id } });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'contact.deleted',
      entityType: 'Contact',
      entityId: id,
    });

    return { success: true };
  }

  /** Bulk actions for multi-select in the Contacts table. All scoped to the org, silently skipping IDs outside it. */
  async bulkAddTag(organizationId: string, contactIds: string[], tagId: string, actorUserId?: string) {
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

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'contact.bulk_tag_added',
      entityType: 'Tag',
      entityId: tagId,
      metadata: { tagName: tag.name, contactCount: contacts.length },
    });

    return { updated: contacts.length };
  }

  /** Bulk-removes a tag from multiple contacts at once (server-side, not N client requests). */
  async bulkRemoveTag(organizationId: string, contactIds: string[], tagId: string, actorUserId?: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } });
    if (!tag) throw new NotFoundException('Tag not found');

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds }, organizationId },
      select: { id: true },
    });

    const result = await this.prisma.contactTag.deleteMany({
      where: { tagId, contactId: { in: contacts.map((c: { id: string }) => c.id) } },
    });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'contact.bulk_tag_removed',
      entityType: 'Tag',
      entityId: tagId,
      metadata: { tagName: tag.name, contactCount: result.count },
    });

    return { updated: result.count };
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

  /**
   * Manual opt-in/opt-out toggle (the Contacts UI "Opt-in" switch). Only
   * writes a consent-history row and audit entry when the transition
   * actually changes optInStatus — calling this again with the same value
   * is a no-op beyond touching optInAt/optOutAt, which also makes the
   * inbound-keyword path idempotent against a contact texting STOP twice.
   */
  async setOptIn(organizationId: string, id: string, optedIn: boolean, actorUserId?: string, reason?: string) {
    const contact = await this.findOne(organizationId, id);
    const nextStatus = optedIn ? 'OPTED_IN' : 'OPTED_OUT';
    const changed = contact.optInStatus !== nextStatus;

    const updated = await this.prisma.contact.update({
      where: { id },
      data: optedIn
        ? { optInStatus: 'OPTED_IN', optInAt: new Date() }
        : { optInStatus: 'OPTED_OUT', optOutAt: new Date() },
    });

    if (changed) {
      await this.recordConsentEvent({
        organizationId,
        contactId: id,
        action: optedIn ? 'OPT_IN' : 'OPT_OUT',
        source: 'MANUAL',
        reason,
        actorUserId,
      });

      this.audit.record({
        organizationId,
        userId: actorUserId,
        action: optedIn ? 'contact.opted_in' : 'contact.opted_out',
        entityType: 'Contact',
        entityId: id,
        metadata: { source: 'MANUAL', reason },
      });
    }

    return updated;
  }

  /**
   * Called from InboundMessageService when an inbound message's body is an
   * exact-match opt-out/opt-in keyword (see whatsapp/opt-out-keywords.ts).
   * Idempotent for the same reason setOptIn is: a contact texting STOP
   * repeatedly only produces one consent-history row, the first time it
   * actually changes their status.
   */
  async applyInboundConsentKeyword(
    organizationId: string,
    contactId: string,
    direction: 'OPT_IN' | 'OPT_OUT',
    keyword: string,
    sourceMessageId: string,
  ) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, organizationId } });
    if (!contact) return;

    const nextStatus = direction === 'OPT_IN' ? 'OPTED_IN' : 'OPTED_OUT';
    if (contact.optInStatus === nextStatus) return;

    await this.prisma.contact.update({
      where: { id: contactId },
      data:
        direction === 'OPT_IN'
          ? { optInStatus: 'OPTED_IN', optInAt: new Date() }
          : { optInStatus: 'OPTED_OUT', optOutAt: new Date() },
    });

    await this.recordConsentEvent({
      organizationId,
      contactId,
      action: direction,
      source: 'INBOUND_KEYWORD',
      reason: keyword,
      metadata: { messageId: sourceMessageId },
    });

    this.audit.record({
      organizationId,
      action: direction === 'OPT_IN' ? 'contact.opted_in' : 'contact.opted_out',
      entityType: 'Contact',
      entityId: contactId,
      metadata: { source: 'INBOUND_KEYWORD', keyword },
    });
  }

  /** Append-only consent-change log for a contact — the audit trail a compliance review or support ticket actually needs, independent of the current-state snapshot on optInStatus/optInAt/optOutAt. */
  async getConsentHistory(organizationId: string, contactId: string) {
    await this.findOne(organizationId, contactId);
    return this.prisma.contactConsentEvent.findMany({
      where: { organizationId, contactId },
      // id as a secondary sort key: two consent changes landing in the
      // same millisecond (createdAt has only millisecond precision) would
      // otherwise sort in an unspecified relative order.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  private async recordConsentEvent(params: {
    organizationId: string;
    contactId: string;
    action: 'OPT_IN' | 'OPT_OUT';
    source: 'MANUAL' | 'INBOUND_KEYWORD' | 'IMPORT' | 'API';
    reason?: string;
    actorUserId?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.contactConsentEvent.create({
      data: {
        organizationId: params.organizationId,
        contactId: params.contactId,
        action: params.action,
        source: params.source,
        reason: params.reason,
        actorUserId: params.actorUserId,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /** Adds a single tag and emits contact.tag_added for the TAG_ADDED automation trigger. */
  async addTag(organizationId: string, contactId: string, tagId: string, actorUserId?: string) {
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
        opt_in_status: contact.optInStatus,
        // contact.tags reflects the set fetched *before* this upsert — the
        // tag just added isn't in it yet, so it's appended explicitly
        // rather than re-querying just to get one more name into the join.
        tags: [...contact.tags.map((t) => t.tag.name), tag.name].join(', '),
        tag: tag.name,
      },
    });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'contact.tag_added',
      entityType: 'Contact',
      entityId: contactId,
      metadata: { tagId, tagName: tag.name },
    });

    return this.findOne(organizationId, contactId);
  }

  /** Removes a single tag from a contact. */
  async removeTag(organizationId: string, contactId: string, tagId: string, actorUserId?: string) {
    await this.findOne(organizationId, contactId);
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } });
    if (!tag) throw new NotFoundException('Tag not found');

    await this.prisma.contactTag.deleteMany({ where: { contactId, tagId } });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'contact.tag_removed',
      entityType: 'Contact',
      entityId: contactId,
      metadata: { tagId, tagName: tag.name },
    });

    return this.findOne(organizationId, contactId);
  }

  /** Parses CSV text and bulk-upserts contacts by (organizationId, phoneNumber). */
  async importCsv(organizationId: string, csv: string) {
    const rows = this.parseCsv(csv);

    // One upfront check rather than a per-row quota query in a loop that
    // could be thousands of rows long — a CSV import is exactly the kind
    // of single action that could blow past a contact limit in one shot,
    // so it needs its own check (ContactsService.create()'s check doesn't
    // cover this path, since bulk import writes directly via Prisma for
    // performance rather than going through create() per row).
    const limits = await this.quota.getEffectiveLimits(organizationId);
    const contactLimit = limits.contacts.limit;
    if (contactLimit !== null) {
      const currentUsage = (await this.quota.getUsage(organizationId, 'contacts')) ?? 0;
      // Only rows that would actually create a NEW contact count against
      // the limit — rows that just update an existing contact don't. We
      // can't know the create/update split without the per-row lookups
      // below, so this is a conservative upper-bound check (worst case:
      // every row is a create) rather than an exact one, which means an
      // import that's mostly updates could be rejected even though it
      // wouldn't actually exceed the limit. Accepted tradeoff for staying
      // O(1) instead of pre-scanning every row's phone number first.
      if (currentUsage + rows.length > contactLimit) {
        throw new QuotaExceededException('contacts', contactLimit, currentUsage);
      }
    }

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

  /** Lists tags for the org, optionally filtered by name, with a live contact-usage count for each. */
  async listTags(organizationId: string, search?: string) {
    const tags = await this.prisma.tag.findMany({
      where: {
        organizationId,
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: 'asc' },
    });

    return tags.map((t: (typeof tags)[number]) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      createdAt: t.createdAt,
      contactCount: t._count.contacts,
    }));
  }

  async createTag(organizationId: string, name: string, color?: string, actorUserId?: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Tag name is required');

    const existing = await this.prisma.tag.findFirst({
      where: { organizationId, name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('A tag with this name already exists');

    const tag = await this.prisma.tag.create({
      data: { organizationId, name: trimmed, color: color ?? '#0A84FF' },
    });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'tag.created',
      entityType: 'Tag',
      entityId: tag.id,
      metadata: { name: tag.name },
    });

    return { ...tag, contactCount: 0 };
  }

  async updateTag(organizationId: string, tagId: string, name?: string, color?: string, actorUserId?: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } });
    if (!tag) throw new NotFoundException('Tag not found');

    const trimmedName = name?.trim();
    if (trimmedName) {
      const existing = await this.prisma.tag.findFirst({
        where: { organizationId, name: { equals: trimmedName, mode: 'insensitive' }, id: { not: tagId } },
      });
      if (existing) throw new ConflictException('A tag with this name already exists');
    }

    const updated = await this.prisma.tag.update({
      where: { id: tagId },
      data: {
        ...(trimmedName ? { name: trimmedName } : {}),
        ...(color ? { color } : {}),
      },
      include: { _count: { select: { contacts: true } } },
    });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'tag.updated',
      entityType: 'Tag',
      entityId: tagId,
      metadata: { name: updated.name, color: updated.color },
    });

    return { id: updated.id, name: updated.name, color: updated.color, createdAt: updated.createdAt, contactCount: updated._count.contacts };
  }

  async deleteTag(organizationId: string, tagId: string, actorUserId?: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } });
    if (!tag) throw new NotFoundException('Tag not found');

    await this.prisma.tag.delete({ where: { id: tagId } });

    this.audit.record({
      organizationId,
      userId: actorUserId,
      action: 'tag.deleted',
      entityType: 'Tag',
      entityId: tagId,
      metadata: { name: tag.name },
    });

    return { success: true };
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
