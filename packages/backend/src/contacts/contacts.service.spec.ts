import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../prisma/prisma.service';

function createPrismaMock() {
  const contacts = new Map<string, any>();
  let idCounter = 1;

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
      findMany: jest.fn(async ({ where }: any) => {
        return [...contacts.values()].filter((c) => where.id.in.includes(c.id));
      }),
    },
    tag: {
      findFirst: jest.fn(async () => ({ id: 'tag_1', name: 'VIP', organizationId: 'org_1' })),
    },
    contactTag: {
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
    },
    __contacts: contacts,
  };
}

describe('ContactsService', () => {
  let service: ContactsService;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(ContactsService);
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

    it('bulkDelete removes only the requested, org-scoped contacts', async () => {
      await service.importCsv('org_1', 'phoneNumber\n+15552222222');
      const [id] = [...prismaMock.__contacts.keys()];

      const result = await service.bulkDelete('org_1', [id]);
      expect(result.deleted).toBe(1);
      expect(prismaMock.__contacts.has(id)).toBe(false);
    });
  });
});
