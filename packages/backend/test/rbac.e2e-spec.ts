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
    // Explicit, generous timeout (Jest's default hook timeout is 5000ms).
    // A full NestJS app shutdown here closes ~6 BullMQ workers'
    // Redis connections plus the Prisma connection pool; under load
    // (especially right after the webhook burst test) that can
    // legitimately take a few seconds. If Jest's own hook timeout fires
    // before app.close() actually finishes, Jest moves on to the next
    // file WITHOUT cancelling the in-flight close() — it keeps running in
    // the background, competing for the exact same Redis/Postgres
    // connections the next file's beforeAll needs, which is what actually
    // caused later files' beforeAll to time out (see PHASE_C3_REPORT.md).
    // Giving close() enough time to genuinely finish, instead of being
    // abandoned, is the fix — not a cover-up of the beforeAll symptom.
    await closeTestApp(app);
  }, 30_000);

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
