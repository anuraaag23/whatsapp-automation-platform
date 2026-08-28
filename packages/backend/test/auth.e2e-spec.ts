import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp } from './utils/test-app';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  const email = `test-${Date.now()}@example.com`;
  const password = 'SuperSecret123!';

  beforeAll(async () => {
    app = await createTestApp();
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

  it('registers a new organization + owner user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        firstName: 'Test',
        lastName: 'User',
        organizationName: `Test Org ${Date.now()}`,
      })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in with correct credentials and fetches /me', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const accessToken = loginRes.body.accessToken;
    const cookies = loginRes.headers['set-cookie'];

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.email).toBe(email);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(200);
  });

  it('rejects unauthenticated requests to protected routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });
});
