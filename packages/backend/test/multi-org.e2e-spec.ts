import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp } from './utils/test-app';

describe('Multi-organization (e2e)', () => {
  let app: INestApplication;
  const email = `multiorg-${Date.now()}@example.com`;
  const password = 'SuperSecret123!';
  let accessToken: string;
  let homeOrgId: string;
  let secondOrgId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        firstName: 'Multi',
        lastName: 'Org',
        organizationName: `Home Org ${Date.now()}`,
      });
    accessToken = registerRes.body.accessToken;

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    homeOrgId = meRes.body.organizationId;
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

  it('lists exactly the home organization right after registration', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].organization.id).toBe(homeOrgId);
    expect(res.body[0].role).toBe('OWNER');
  });

  it('creates a second organization owned by the same user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Second Org ${Date.now()}` })
      .expect(201);

    secondOrgId = res.body.id;
    expect(secondOrgId).not.toBe(homeOrgId);

    const orgsRes = await request(app.getHttpServer())
      .get('/api/v1/auth/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(orgsRes.body).toHaveLength(2);
  });

  it('rejects switching into an organization the user is not a member of', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/switch-organization')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ organizationId: 'not-a-real-org-id' })
      .expect(401);
  });

  it('switches organization context and the new token reflects it', async () => {
    const switchRes = await request(app.getHttpServer())
      .post('/api/v1/auth/switch-organization')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ organizationId: secondOrgId })
      .expect(200);

    const newToken = switchRes.body.accessToken;

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    expect(meRes.body.organizationId).toBe(secondOrgId);
  });

  it('an old token for the home org still independently works after switching', async () => {
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.organizationId).toBe(homeOrgId);
  });
});
