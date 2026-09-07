import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SuperAdminBootstrapController } from './super-admin-bootstrap.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('SuperAdminBootstrapController', () => {
  let controller: SuperAdminBootstrapController;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let config: {
    get: jest.Mock;
  };
  let audit: {
    record: jest.Mock;
  };

  const BOOTSTRAP_SECRET = 'correct-strong-bootstrap-secret-12345';
  const TARGET_EMAIL = 'anurag.ay8840@gmail.com';

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    config = {
      get: jest.fn((key: string) => {
        if (key === 'SUPER_ADMIN_BOOTSTRAP_SECRET') return BOOTSTRAP_SECRET;
        if (key === 'SUPER_ADMIN_BOOTSTRAP_EMAIL') return TARGET_EMAIL;
        return undefined;
      }),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperAdminBootstrapController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    controller = module.get<SuperAdminBootstrapController>(SuperAdminBootstrapController);
  });

  it('throws NotFoundException when SUPER_ADMIN_BOOTSTRAP_SECRET is not configured in environment', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'SUPER_ADMIN_BOOTSTRAP_SECRET') return undefined;
      return undefined;
    });

    await expect(
      controller.bootstrap({ email: TARGET_EMAIL, secret: BOOTSTRAP_SECRET }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when secret is missing from request', async () => {
    await expect(
      controller.bootstrap({ email: TARGET_EMAIL }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when secret is incorrect', async () => {
    await expect(
      controller.bootstrap({ email: TARGET_EMAIL, secret: 'wrong-secret' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when secret has mismatched length', async () => {
    await expect(
      controller.bootstrap({ email: TARGET_EMAIL, secret: BOOTSTRAP_SECRET + '-extra' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when email does not match configured target email', async () => {
    await expect(
      controller.bootstrap({ email: 'attacker@evil.com', secret: BOOTSTRAP_SECRET }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when target user does not exist in database', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      controller.bootstrap({ email: TARGET_EMAIL, secret: BOOTSTRAP_SECRET }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('successfully promotes target user to Super Admin and records audit log', async () => {
    const existingUser = {
      id: 'usr_123',
      email: TARGET_EMAIL,
      role: 'OWNER',
      isSuperAdmin: false,
      organizationId: 'org_123',
    };
    prisma.user.findUnique.mockResolvedValue(existingUser);
    prisma.user.update.mockResolvedValue({ ...existingUser, isSuperAdmin: true });

    const res = await controller.bootstrap({ email: TARGET_EMAIL, secret: BOOTSTRAP_SECRET });

    expect(res.success).toBe(true);
    expect(res.alreadyPromoted).toBe(false);
    expect(res.email).toBe(TARGET_EMAIL);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'usr_123' },
      data: { isSuperAdmin: true },
      select: expect.any(Object),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'super_admin.bootstrap_granted',
        entityId: 'usr_123',
        userId: 'usr_123',
      }),
    );
  });

  it('returns idempotent success if target account is already a Super Admin without writing to DB', async () => {
    const existingSuperAdmin = {
      id: 'usr_123',
      email: TARGET_EMAIL,
      role: 'OWNER',
      isSuperAdmin: true,
      organizationId: 'org_123',
    };
    prisma.user.findUnique.mockResolvedValue(existingSuperAdmin);

    const res = await controller.bootstrap({ email: TARGET_EMAIL, secret: BOOTSTRAP_SECRET });

    expect(res.success).toBe(true);
    expect(res.alreadyPromoted).toBe(true);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('accepts the bootstrap secret via x-bootstrap-secret header', async () => {
    const existingUser = {
      id: 'usr_123',
      email: TARGET_EMAIL,
      role: 'OWNER',
      isSuperAdmin: false,
      organizationId: 'org_123',
    };
    prisma.user.findUnique.mockResolvedValue(existingUser);
    prisma.user.update.mockResolvedValue({ ...existingUser, isSuperAdmin: true });

    const res = await controller.bootstrap({ email: TARGET_EMAIL }, BOOTSTRAP_SECRET);

    expect(res.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
