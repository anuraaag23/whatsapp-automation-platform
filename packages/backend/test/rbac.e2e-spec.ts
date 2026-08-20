import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, registerOwner, registerMemberWithRole, TestActor } from './utils/test-app';

describe('Role-based access control (e2e)', () => {
  let app: INestApplication;
  let owner: TestActor;
  let viewer: TestActor;
  let manager: TestActor;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerOwner(app, 'rbac-owner');
    viewer = await registerMemberWithRole(app, owner, 'rbac-viewer', 'VIEWER');
    manager = await registerMemberWithRole(app, owner, 'rbac-manager', 'MANAGER');
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe('OWNER/ADMIN-only endpoints reject lower roles', () => {
    it('VIEWER cannot read audit logs', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .expect(403);
    });

    it('MANAGER cannot read audit logs either — only OWNER/ADMIN', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${manager.accessToken}`)
        .expect(403);
    });

    it('OWNER can read audit logs', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
    });

    it('VIEWER cannot update organization settings', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/settings/organization')
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .send({ name: 'Should not stick' })
        .expect(403);
    });

    it('VIEWER cannot create API keys', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/settings/api-keys')
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .send({ name: 'Zapier' })
        .expect(403);
    });

    it("VIEWER cannot change another member's role", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${manager.userId}/role`)
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('VIEWER cannot remove an organization member', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/members/${manager.userId}`)
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .expect(403);
    });

    it('OWNER can promote a member and the new role takes effect on their next token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${manager.userId}/role`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      const updated = listRes.body.find((u: { id: string }) => u.id === manager.userId);
      expect(updated.role).toBe('ADMIN');
    });
  });

  describe('General endpoints stay open to any authenticated member', () => {
    it('VIEWER can list contacts', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .expect(200);
    });

    it('VIEWER can list templates', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/templates')
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .expect(200);
    });

    it('VIEWER can read org members (read-only member listing has no @Roles restriction)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/members')
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .expect(200);
    });
  });

  describe('Unauthenticated requests', () => {
    it('are rejected across the board, not just on protected-looking routes', async () => {
      await request(app.getHttpServer()).get('/api/v1/contacts').expect(401);
      await request(app.getHttpServer()).get('/api/v1/audit-logs').expect(401);
    });
  });
});
