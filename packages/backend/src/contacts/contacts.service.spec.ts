import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QuotaService } from '../quota/quota.service';

function createPrismaMock() {
  const contacts = new Map<string, any>();
  const tags = new Map<string, any>();
  const consentEvents: any[] = [];
  let idCounter = 1;
  let tagIdCounter = 1;

  return {
    contact: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.organizationId_phoneNumber) {
          const { organizationId, phoneNumber } = where.organizationId_phoneNumber;
          return (
            [...contacts.values()].find(
              (c) => c.organizationId === organizationId && c.phoneNumber === phoneNumber,
            ) ?? null
          );
        }
        return contacts.get(where.id) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const id = `contact_${idCounter++}`;
        const record = { id, ...data };
        contacts.set(id, record);
        return record;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = contacts.get(where.id);
        const updated = { ...existing, ...data };
        contacts.set(where.id, updated);
        return updated;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [id, c] of contacts) {
          if (where.id.in.includes(id) && c.organizationId === where.organizationId) {
            contacts.set(id, { ...c, ...data });
            count++;
          }
        }
        return { count };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        let count = 0;
        for (const id of [...contacts.keys()]) {
          const c = contacts.get(id);
          if (where.id.in.includes(id) && c.organizationId === where.organizationId) {
            contacts.delete(id);
            count++;
          }
        }
        return { count };
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const found = contacts.get(where.id);
        if (!found || found.organizationId !== where.organizationId) return null;
        return { tags: [], groups: [], ...found };
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return [...contacts.values()].filter((c) => where.id.in.includes(c.id));
      }),
    },
    contactConsentEvent: {
      create: jest.fn(async ({ data }: any) => {
        const record = { id: `consent_${consentEvents.length + 1}`, createdAt: new Date(), ...data };
        consentEvents.push(record);
        return record;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return consentEvents
          .filter((e) => e.organizationId === where.organizationId && e.contactId === where.contactId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (b.id > a.id ? 1 : -1));
      }),
    },
    tag: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id && !where.name) {
          const t = tags.get(where.id);
          return t && t.organizationId === where.organizationId ? t : null;
        }
        const nameFilter = where.name?.equals ?? where.name;
        const found = [...tags.values()].find(
          (t) =>
            t.organizationId === where.organizationId &&
            t.name.toLowerCase() === String(nameFilter).toLowerCase() &&
            (!where.id?.not || t.id !== where.id.not),
        );
        return found ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return [...tags.values()].filter((t) => t.organizationId === where.organizationId);
      }),
      create: jest.fn(async ({ data }: any) => {
        const id = `tag_${tagIdCounter++}`;
        const record = { id, createdAt: new Date(), ...data };
        tags.set(id, record);
        return record;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = tags.get(where.id);
        const updated = { ...existing, ...data };
        tags.set(where.id, updated);
        return { ...updated, _count: { contacts: 0 } };
      }),
      delete: jest.fn(async ({ where }: any) => {
        const existing = tags.get(where.id);
        tags.delete(where.id);
        return existing;
      }),
    },
    contactTag: {
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    __contacts: contacts,
    __tags: tags,
    __consentEvents: consentEvents,
  };
}

describe('ContactsService', () => {
  let service: ContactsService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let auditMock: { record: jest.Mock };

  beforeEach(async () => {
    prismaMock = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: QuotaService, useValue: { assertWithinLimit: jest.fn(), getEffectiveLimits: jest.fn().mockResolvedValue({ contacts: { limit: null, source: 'unlimited' } }), getUsage: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();

    service = moduleRef.get(ContactsService);
    auditMock = moduleRef.get(AuditService);
  });

  describe('importCsv', () => {
    it('creates new contacts from valid rows', async () => {
      const csv = 'phoneNumber,firstName,lastName\n+15551234567,Ada,Lovelace\n+15559876543,Alan,Turing';
      const result = await service.importCsv('org_1', csv);

      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('updates an existing contact instead of duplicating it', async () => {
      await service.importCsv('org_1', 'phoneNumber,firstName\n+15551234567,Ada');
      const result = await service.importCsv('org_1', 'phoneNumber,firstName\n+15551234567,Ada Updated');

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
    });

    it('flags rows with missing or invalid phone numbers instead of silently dropping them', async () => {
      const csv = 'phoneNumber,firstName\n,NoPhone\nnot-a-phone,BadPhone\n+15551234567,GoodPhone';
      const result = await service.importCsv('org_1', csv);

      expect(result.created).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].row).toBe(2); // header is row 1, so first data row is row 2
    });

    it('handles quoted fields containing commas', async () => {
      const csv = 'phoneNumber,firstName,company\n+15551234567,Ada,"Acme, Inc."';
      const result = await service.importCsv('org_1', csv);

      expect(result.created).toBe(1);
      const created = [...prismaMock.__contacts.values()][0];
      expect(created.company).toBe('Acme, Inc.');
    });

    it('is header-case-insensitive and tolerates column order', async () => {
      const csv = 'FirstName,PhoneNumber\nAda,+15551234567';
      const result = await service.importCsv('org_1', csv);

      expect(result.created).toBe(1);
      const created = [...prismaMock.__contacts.values()][0];
      expect(created.firstName).toBe('Ada');
    });

    it('returns zero rows for an empty CSV', async () => {
      const result = await service.importCsv('org_1', '');
      expect(result.totalRows).toBe(0);
      expect(result.created).toBe(0);
    });
  });

  describe('bulk actions', () => {
    it('bulkSetArchived only touches contacts belonging to the given org', async () => {
      await service.importCsv('org_1', 'phoneNumber\n+15551111111');
      const [id] = [...prismaMock.__contacts.keys()];

      const result = await service.bulkSetArchived('org_1', [id], true);
      expect(result.updated).toBe(1);

      const wrongOrgResult = await service.bulkSetArchived('org_2', [id], true);
      expect(wrongOrgResult.updated).toBe(0);
    });
  });

  describe('tag management', () => {
    it('creates a tag and records an audit entry', async () => {
      const tag = await service.createTag('org_1', 'VIP', '#ff0000', 'user_1');
      expect(tag.name).toBe('VIP');
      expect(tag.contactCount).toBe(0);
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tag.created', organizationId: 'org_1', userId: 'user_1' }),
      );
    });

    it('rejects a duplicate tag name within the same org (case-insensitive)', async () => {
      await service.createTag('org_1', 'VIP', '#ff0000');
      await expect(service.createTag('org_1', 'vip', '#00ff00')).rejects.toThrow(
        'A tag with this name already exists',
      );
    });

    it('allows the same tag name in a different org', async () => {
      await service.createTag('org_1', 'VIP');
      await expect(service.createTag('org_2', 'VIP')).resolves.toMatchObject({ name: 'VIP' });
    });

    it('rejects renaming a tag to a name already used by another tag in the org', async () => {
      await service.createTag('org_1', 'VIP');
      const second = await service.createTag('org_1', 'Champion');
      await expect(service.updateTag('org_1', second.id, 'VIP')).rejects.toThrow(
        'A tag with this name already exists',
      );
    });

    it('updates a tag name/color and records an audit entry', async () => {
      const tag = await service.createTag('org_1', 'Old Name');
      const updated = await service.updateTag('org_1', tag.id, 'New Name', '#123456', 'user_1');
      expect(updated.name).toBe('New Name');
      expect(updated.color).toBe('#123456');
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tag.updated', entityId: tag.id }),
      );
    });

    it('deletes a tag and records an audit entry', async () => {
      const tag = await service.createTag('org_1', 'Temp');
      await service.deleteTag('org_1', tag.id, 'user_1');
      expect(prismaMock.__tags.has(tag.id)).toBe(false);
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'tag.deleted', entityId: tag.id }),
      );
    });

    it('throws NotFoundException when updating/deleting a tag outside the org', async () => {
      const tag = await service.createTag('org_1', 'Scoped');
      await expect(service.updateTag('org_2', tag.id, 'Hacked')).rejects.toThrow('Tag not found');
      await expect(service.deleteTag('org_2', tag.id)).rejects.toThrow('Tag not found');
    });

    it('rejects an empty tag name', async () => {
      await expect(service.createTag('org_1', '   ')).rejects.toThrow('Tag name is required');
    });

    it('bulkDelete removes only the requested, org-scoped contacts', async () => {
      await service.importCsv('org_1', 'phoneNumber\n+15552222222');
      const [id] = [...prismaMock.__contacts.keys()];

      const result = await service.bulkDelete('org_1', [id]);
      expect(result.deleted).toBe(1);
      expect(prismaMock.__contacts.has(id)).toBe(false);
    });
  });

  describe('setOptIn — consent history & audit', () => {
    it('records a consent event and an audit entry when the status actually changes', async () => {
      prismaMock.__contacts.set('c1', { id: 'c1', organizationId: 'org_1', optInStatus: 'PENDING' });

      const updated = await service.setOptIn('org_1', 'c1', true, 'user_1', 'customer requested');

      expect(updated.optInStatus).toBe('OPTED_IN');
      expect(prismaMock.__consentEvents).toHaveLength(1);
      expect(prismaMock.__consentEvents[0]).toMatchObject({
        organizationId: 'org_1',
        contactId: 'c1',
        action: 'OPT_IN',
        source: 'MANUAL',
        reason: 'customer requested',
        actorUserId: 'user_1',
      });
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'contact.opted_in', entityId: 'c1' }),
      );
    });

    it('is idempotent: setting the same status twice only writes one consent event', async () => {
      prismaMock.__contacts.set('c1', { id: 'c1', organizationId: 'org_1', optInStatus: 'PENDING' });

      await service.setOptIn('org_1', 'c1', false, 'user_1');
      await service.setOptIn('org_1', 'c1', false, 'user_1');

      expect(prismaMock.__consentEvents).toHaveLength(1);
      expect(auditMock.record).toHaveBeenCalledTimes(1);
    });

    it('still updates optOutAt on a repeated no-op call, even without a new consent event', async () => {
      prismaMock.__contacts.set('c1', { id: 'c1', organizationId: 'org_1', optInStatus: 'OPTED_OUT' });

      const before = new Date(Date.now() - 10_000);
      prismaMock.__contacts.get('c1').optOutAt = before;

      const updated = await service.setOptIn('org_1', 'c1', false);
      expect(updated.optOutAt).not.toBe(before);
      expect(prismaMock.__consentEvents).toHaveLength(0);
    });
  });

  describe('applyInboundConsentKeyword', () => {
    it('opts a contact out on a matched OPT_OUT keyword, recording source=INBOUND_KEYWORD', async () => {
      prismaMock.__contacts.set('c1', { id: 'c1', organizationId: 'org_1', optInStatus: 'OPTED_IN' });

      await service.applyInboundConsentKeyword('org_1', 'c1', 'OPT_OUT', 'stop', 'msg_1');

      expect(prismaMock.__contacts.get('c1').optInStatus).toBe('OPTED_OUT');
      expect(prismaMock.__consentEvents).toHaveLength(1);
      expect(prismaMock.__consentEvents[0]).toMatchObject({
        action: 'OPT_OUT',
        source: 'INBOUND_KEYWORD',
        reason: 'stop',
        metadata: { messageId: 'msg_1' },
      });
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'contact.opted_out', metadata: { source: 'INBOUND_KEYWORD', keyword: 'stop' } }),
      );
    });

    it('is idempotent: a second STOP from an already-opted-out contact writes nothing new', async () => {
      prismaMock.__contacts.set('c1', { id: 'c1', organizationId: 'org_1', optInStatus: 'OPTED_OUT' });

      await service.applyInboundConsentKeyword('org_1', 'c1', 'OPT_OUT', 'stop', 'msg_2');

      expect(prismaMock.__consentEvents).toHaveLength(0);
      expect(auditMock.record).not.toHaveBeenCalled();
    });

    it('opts a contact back in on a matched OPT_IN keyword', async () => {
      prismaMock.__contacts.set('c1', { id: 'c1', organizationId: 'org_1', optInStatus: 'OPTED_OUT' });

      await service.applyInboundConsentKeyword('org_1', 'c1', 'OPT_IN', 'start', 'msg_3');

      expect(prismaMock.__contacts.get('c1').optInStatus).toBe('OPTED_IN');
      expect(prismaMock.__consentEvents[0]).toMatchObject({ action: 'OPT_IN', source: 'INBOUND_KEYWORD' });
    });

    it('is a no-op (does not throw) for a contact that does not exist in this organization', async () => {
      await expect(
        service.applyInboundConsentKeyword('org_1', 'nonexistent', 'OPT_OUT', 'stop', 'msg_4'),
      ).resolves.toBeUndefined();
      expect(prismaMock.__consentEvents).toHaveLength(0);
    });
  });

  describe('getConsentHistory', () => {
    it('returns events for the contact, newest first, scoped to the organization', async () => {
      prismaMock.__contacts.set('c1', { id: 'c1', organizationId: 'org_1', optInStatus: 'PENDING' });

      await service.setOptIn('org_1', 'c1', true, 'user_1');
      await service.setOptIn('org_1', 'c1', false, 'user_1');

      const history = await service.getConsentHistory('org_1', 'c1');
      expect(history).toHaveLength(2);
      expect(history[0].action).toBe('OPT_OUT');
      expect(history[1].action).toBe('OPT_IN');
    });

    it('throws NotFoundException for a contact outside the organization', async () => {
      prismaMock.__contacts.set('c1', { id: 'c1', organizationId: 'org_1', optInStatus: 'PENDING' });
      await expect(service.getConsentHistory('org_2', 'c1')).rejects.toThrow('Contact not found');
    });
  });
});
