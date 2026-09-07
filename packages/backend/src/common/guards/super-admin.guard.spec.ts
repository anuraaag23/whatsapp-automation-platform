import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SuperAdminGuard } from './super-admin.guard';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

function makeContext(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeGuard(requiresSuperAdmin: boolean | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiresSuperAdmin) } as unknown as Reflector;
  return new SuperAdminGuard(reflector);
}

const NORMAL_USER: AuthenticatedUser = {
  userId: 'u1',
  email: 'user@org.com',
  role: 'ADMIN',
  organizationId: 'org_1',
  isSuperAdmin: false,
};

const ORG_OWNER: AuthenticatedUser = {
  userId: 'u2',
  email: 'owner@org.com',
  role: 'OWNER',
  organizationId: 'org_1',
  isSuperAdmin: false,
};

const SUPER_ADMIN: AuthenticatedUser = {
  userId: 'u3',
  email: 'platform@company.com',
  role: 'VIEWER', // deliberately a low org-role, to prove org role is irrelevant to this check
  organizationId: 'org_2',
  isSuperAdmin: true,
};

describe('SuperAdminGuard', () => {
  it('is a no-op (allows through) on a route with no @SuperAdminOnly() metadata', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext(NORMAL_USER))).toBe(true);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('throws 403 ForbiddenException for a normal authenticated user (isSuperAdmin: false)', () => {
    const guard = makeGuard(true);
    expect(() => guard.canActivate(makeContext(NORMAL_USER))).toThrow(ForbiddenException);
  });

  it('throws 403 for a normal organization OWNER/ADMIN — org role never grants Super Admin access', () => {
    const guard = makeGuard(true);
    expect(() => guard.canActivate(makeContext(ORG_OWNER))).toThrow(ForbiddenException);
  });

  it('throws (fails closed) when request.user is missing entirely — an unauthenticated request should never reach this far, but this guard does not assume that', () => {
    const guard = makeGuard(true);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('allows a user with isSuperAdmin: true through, regardless of their org role', () => {
    const guard = makeGuard(true);
    expect(guard.canActivate(makeContext(SUPER_ADMIN))).toBe(true);
  });
});
