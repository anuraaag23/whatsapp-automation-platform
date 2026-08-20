import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, registerOwner, TestActor } from './utils/test-app';

describe('Segments (e2e)', () => {
  let app: INestApplication;
  let owner: TestActor;
  let segmentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerOwner(app, 'segments-owner');

    // Two contacts that a city-based rule can distinguish between.
    await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ phoneNumber: '+15550001111', firstName: 'Varanasi', city: 'Varanasi' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ phoneNumber: '+15550002222', firstName: 'Mumbai', city: 'Mumbai' })
      .expect(201);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('previews a match count for a rule before saving a segment', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/segments/preview')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ rules: [{ field: 'city', operator: 'equals', value: 'Varanasi' }] })
      .expect(201);

    expect(res.body.matchCount).toBe(1);
  });

  it('creates a segment with a rule set', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/segments')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Varanasi contacts',
        description: 'Contacts based in Varanasi',
        rules: [{ field: 'city', operator: 'equals', value: 'Varanasi' }],
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Varanasi contacts');
    segmentId = res.body.id;
  });

  it('lists segments and finds the one just created', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/segments')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.some((s: { id: string }) => s.id === segmentId)).toBe(true);
  });

  it('gets a single segment by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/segments/${segmentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(res.body.name).toBe('Varanasi contacts');
  });

  it('updates a segment to broaden its rule with a "contains" operator', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/segments/${segmentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Varanasi contacts',
        description: 'Broadened',
        rules: [{ field: 'city', operator: 'contains', value: 'Var' }],
      })
      .expect(200);

    expect(res.body.description).toBe('Broadened');
  });

  it('404s for a segment that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/segments/not-a-real-id')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('deletes a segment', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/segments/${segmentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/segments/${segmentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });
});
