import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MESSAGE_DISPATCH_QUEUE } from '../queue/queue.module';

function createPrismaMock() {
  const organizations = new Map<string, any>();
  const users = new Map<string, any>();

  return {
    organization: {
      findUnique: jest.fn(async ({ where }: any) => organizations.get(where.id) ?? null),
      findMany: jest.fn(async () => [...organizations.values()]),
      count: jest.fn(async () => organizations.size),
      update: jest.fn(async ({ where, data }: any) => {
        const updated = { ...organizations.get(where.id), ...data };
        organizations.set(where.id, updated);
        return updated;
      }),
      groupBy: jest.fn(async () => []),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const updated = { ...users.get(where.id), ...data };
        users.set(where.id, updated);
        return updated;
      }),
      count: jest.fn(async () => users.size),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    __organizations: organizations,
    __users: users,
  };
}

describe('SuperAdminService — organization suspend/activate', () => {
  let service: SuperAdminService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let auditMock: { record: jest.Mock };

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    auditMock = { record: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: getQueueToken(MESSAGE_DISPATCH_QUEUE), useValue: { getJobCounts: jest.fn(), client: Promise.resolve({}) } },
      ],
    }).compile();

    service = moduleRef.get(SuperAdminService);
  });

  it('suspends an active organization and records an audited action', async () => {
    prismaMock.__organizations.set('org_1', { id: 'org_1', status: 'ACTIVE' });

    const result = await service.suspendOrganization('org_1', 'admin_1', 'Payment overdue');

    expect(result.status).toBe('SUSPENDED');
    expect(result.suspendedReason).toBe('Payment overdue');
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        userId: 'admin_1',
        action: 'super_admin.organization_suspended',
        entityType: 'Organization',
        entityId: 'org_1',
      }),
    );
  });

  it('rejects suspending an organization that is already suspended', async () => {
    prismaMock.__organizations.set('org_1', { id: 'org_1', status: 'SUSPENDED' });
    await expect(service.suspendOrganization('org_1', 'admin_1')).rejects.toThrow(BadRequestException);
    expect(auditMock.record).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a nonexistent organization id — never trusts the id blindly', async () => {
    await expect(service.suspendOrganization('does_not_exist', 'admin_1')).rejects.toThrow(NotFoundException);
  });

  it('activates a suspended organization, clearing suspension fields, and audits it', async () => {
    prismaMock.__organizations.set('org_1', { id: 'org_1', status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: 'test' });

    const result = await service.activateOrganization('org_1', 'admin_1');

    expect(result.status).toBe('ACTIVE');
    expect(result.suspendedAt).toBeNull();
    expect(result.suspendedReason).toBeNull();
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'super_admin.organization_activated', entityId: 'org_1' }),
    );
  });

  it('rejects activating an organization that is already active', async () => {
    prismaMock.__organizations.set('org_1', { id: 'org_1', status: 'ACTIVE' });
    await expect(service.activateOrganization('org_1', 'admin_1')).rejects.toThrow(BadRequestException);
  });
});

describe('SuperAdminService — user status changes', () => {
  let service: SuperAdminService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let auditMock: { record: jest.Mock };

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    auditMock = { record: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: getQueueToken(MESSAGE_DISPATCH_QUEUE), useValue: { getJobCounts: jest.fn(), client: Promise.resolve({}) } },
      ],
    }).compile();

    service = moduleRef.get(SuperAdminService);
  });

  it('deactivates a user and audits it against that user\'s own organization', async () => {
    prismaMock.__users.set('user_1', { id: 'user_1', organizationId: 'org_9', isActive: true });

    const result = await service.setUserActive('user_1', 'admin_1', false);

    expect(result.isActive).toBe(false);
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_9',
        userId: 'admin_1',
        action: 'super_admin.user_deactivated',
        entityType: 'User',
        entityId: 'user_1',
      }),
    );
  });

  it('reactivates a user and audits it distinctly from deactivation', async () => {
    prismaMock.__users.set('user_1', { id: 'user_1', organizationId: 'org_9', isActive: false });

    await service.setUserActive('user_1', 'admin_1', true);

    expect(auditMock.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'super_admin.user_activated' }));
  });

  it('throws NotFoundException for a nonexistent user id', async () => {
    await expect(service.setUserActive('nope', 'admin_1', true)).rejects.toThrow(NotFoundException);
  });
});
