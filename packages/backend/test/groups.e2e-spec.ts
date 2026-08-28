import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, registerOwner, TestActor } from './utils/test-app';

describe('Groups (e2e)', () => {
  let app: INestApplication;
  let owner: TestActor;
  let groupId: string;
  let contactAId: string;
  let contactBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerOwner(app, 'groups-owner');

    const contactA = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ phoneNumber: '+15550003333', firstName: 'Member A' })
      .expect(201);
    contactAId = contactA.body.id;

    const contactB = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ phoneNumber: '+15550004444', firstName: 'Member B' })
      .expect(201);
    contactBId = contactB.body.id;
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

  it('creates a group', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'BGMI Squad' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('BGMI Squad');
    groupId = res.body.id;
  });

  it('renames a group', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'RYPER Squad' })
      .expect(200);

    expect(res.body.name).toBe('RYPER Squad');
  });

  it('adds members to a group', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ contactIds: [contactAId, contactBId] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const memberIds = (res.body.members ?? []).map(
      (m: { id?: string; contactId?: string }) => m.contactId ?? m.id,
    );
    expect(memberIds).toEqual(expect.arrayContaining([contactAId, contactBId]));
  });

  it('removes one member without affecting the other', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/groups/${groupId}/members/${contactAId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const memberIds = (res.body.members ?? []).map(
      (m: { id?: string; contactId?: string }) => m.contactId ?? m.id,
    );
    expect(memberIds).not.toContain(contactAId);
    expect(memberIds).toContain(contactBId);
  });

  it('lists groups and finds the one just created', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/groups')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.some((g: { id: string }) => g.id === groupId)).toBe(true);
  });

  it('deletes a group', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });
});
