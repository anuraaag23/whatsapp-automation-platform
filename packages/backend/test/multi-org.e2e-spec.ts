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
    await closeTestApp(app);
  });

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
