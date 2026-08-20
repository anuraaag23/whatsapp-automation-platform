import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * Boots a full Nest app (real Postgres/Redis via AppModule, no mocking) the
 * same way main.ts does, minus helmet/CORS which don't matter for supertest.
 * Every e2e-spec should call this once in beforeAll and app.close() in
 * afterAll — one Nest app per test *file*, not per test, since compiling
 * the full module graph is the expensive part.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // rawBody: true mirrors main.ts's bootstrap — without it, request.rawBody
  // is undefined and WhatsappSignatureGuard has nothing to verify against.
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}

/**
 * Closes an app from afterAll(), defensively. If beforeAll's
 * `createTestApp()` throws (e.g. the database is unreachable), Jest still
 * runs afterAll — but the spec's `app` variable was never assigned, so
 * calling `app.close()` directly throws its own unrelated
 * "Cannot read properties of undefined (reading 'close')", which buries the
 * real failure under a confusing second one. This only closes when there's
 * actually something to close, and otherwise does nothing — it does not
 * swallow or re-report the original beforeAll failure, which Jest already
 * surfaces on its own.
 */
export async function closeTestApp(app: INestApplication | undefined): Promise<void> {
  if (!app) return;
  await app.close();
}

export interface TestActor {
  accessToken: string;
  userId: string;
  organizationId: string;
  email: string;
  role: string;
}

/**
 * Registers a brand-new organization + OWNER user with a randomized email,
 * so tests never collide with each other or with seeded demo data even when
 * run repeatedly against the same database. Returns an authenticated actor.
 */
export async function registerOwner(app: INestApplication, label: string): Promise<TestActor> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${label}-${unique}@example.com`;
  const password = 'SuperSecret123!';

  const registerRes = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      firstName: 'Test',
      lastName: label,
      organizationName: `${label} Org ${unique}`,
    })
    .expect(201);

  const accessToken = registerRes.body.accessToken as string;

  const meRes = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  return {
    accessToken,
    userId: meRes.body.id,
    organizationId: meRes.body.organizationId,
    email,
    role: meRes.body.role,
  };
}

/**
 * Registers a second, fully independent user (their own home org), has
 * `owner` invite them into `owner`'s organization with the given role, then
 * switches that user's session into `owner`'s org. Returns an actor whose
 * accessToken is scoped to `owner`'s organization at the requested role —
 * this is the realistic way a non-owner ends up in an org, so RBAC tests
 * exercise the actual invite + switch-organization flow rather than
 * fabricating a token.
 */
export async function registerMemberWithRole(
  app: INestApplication,
  owner: TestActor,
  label: string,
  role: string,
): Promise<TestActor> {
  const member = await registerOwner(app, label);

  await request(app.getHttpServer())
    .post('/api/v1/organizations/invite')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ email: member.email, role })
    .expect(201);

  const switchRes = await request(app.getHttpServer())
    .post('/api/v1/auth/switch-organization')
    .set('Authorization', `Bearer ${member.accessToken}`)
    .send({ organizationId: owner.organizationId })
    .expect(200);

  return {
    accessToken: switchRes.body.accessToken,
    userId: member.userId,
    organizationId: owner.organizationId,
    email: member.email,
    role,
  };
}
