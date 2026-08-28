import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  MESSAGE_DISPATCH_QUEUE,
  SCHEDULE_TICK_QUEUE,
} from '../../src/queue/queue.module';
import {
  WEBHOOK_EVENT_PROCESS_QUEUE,
  WEBHOOK_EVENT_RETRY_QUEUE,
} from '../../src/whatsapp/whatsapp.constants';
import {
  AUTOMATION_RUN_QUEUE,
  AUTOMATION_SCHEDULE_TICK_QUEUE,
} from '../../src/automations/automations.constants';
import { MessageDispatchProcessor } from '../../src/schedules/message-dispatch.processor';
import { ScheduleTickProcessor } from '../../src/schedules/schedule-tick.processor';
import { WebhookEventRetryProcessor } from '../../src/whatsapp/webhook-event-retry.processor';
import { WebhookEventDispatchProcessor } from '../../src/whatsapp/webhook-event-dispatch.processor';
import { AutomationRunProcessor } from '../../src/automations/automation-run.processor';
import { AutomationScheduleTickProcessor } from '../../src/automations/automation-schedule-tick.processor';

/**
 * Every @Processor()-decorated class in AppModule. Needed because
 * @nestjs/bullmq's own automatic shutdown (BullExplorer.onApplicationShutdown)
 * calls plain `worker.close()` — not `worker.close(true)` — for every one of
 * these; see closeAllWorkers below for why that's the actual root cause of
 * the "Jest did not exit" warning, and force-closing them here up front is
 * the fix.
 */
const ALL_PROCESSOR_TOKENS = [
  MessageDispatchProcessor,
  ScheduleTickProcessor,
  WebhookEventRetryProcessor,
  WebhookEventDispatchProcessor,
  AutomationRunProcessor,
  AutomationScheduleTickProcessor,
];

/**
 * Every BullMQ queue name registered anywhere in AppModule (across
 * QueueModule, WhatsappModule, SchedulesModule, AutomationsModule). Kept
 * in one place so closeAllQueues below can't silently miss one as new
 * queues are added. (MESSAGE_DISPATCH_QUEUE used to be independently
 * registered in three different modules — schedules, campaigns, health —
 * each getting its own separate Queue client/Redis connection; consolidated
 * to a single registration in QueueModule so there's exactly one to close.)
 */
const ALL_QUEUE_NAMES = [
  MESSAGE_DISPATCH_QUEUE,
  SCHEDULE_TICK_QUEUE,
  WEBHOOK_EVENT_PROCESS_QUEUE,
  WEBHOOK_EVENT_RETRY_QUEUE,
  AUTOMATION_RUN_QUEUE,
  AUTOMATION_SCHEDULE_TICK_QUEUE,
];

/**
 * Boots a full Nest app (real Postgres/Redis via AppModule, no mocking) the
 * same way main.ts does, minus helmet/CORS which don't matter for supertest.
 * Every e2e-spec should call this once in beforeAll and closeTestApp(app) in
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

  // Explicitly listen on an ephemeral port, exactly like production's
  // main.ts does (just port 0 instead of a fixed one), rather than relying
  // on supertest's own lazy-listen behavior (it calls .listen(0) internally
  // the first time a request hits a server that isn't listening yet).
  //
  // ROOT CAUSE this fixes, proven via a standalone, dependency-free
  // reproduction (a bare Node http.Server, no Nest/Prisma/Redis/BullMQ
  // involved at all): supertest's lazy-listen works fine for individual,
  // sequential requests — which is exactly why this app's other e2e tests,
  // run one at a time before the burst test, always passed — but does NOT
  // hold up under a large concurrent burst fired in a tight loop against a
  // server that was never explicitly listen()'d. Confirmed directly:
  //   - lazy listen, burst fired cold:            147/150 ECONNRESET
  //   - lazy listen, 8 sequential warm-up first:  147/150 ECONNRESET (same)
  //   - explicit app.listen(0) before the burst:  0/150 failures
  // The 8 warm-up requests matter here because that's exactly what this
  // test file's earlier tests already do before the burst test runs — and
  // it did NOT change the outcome, ruling out "just hasn't listened yet"
  // as the mechanism and confirming this is specific to how supertest's
  // internal lazy-listen state behaves under a genuine concurrent burst,
  // not merely whether *a* request has been made before.
  await app.listen(0);

  // Node's http.Server defaults keepAliveTimeout to 5000ms: if a client
  // holds a connection open (via a keep-alive Agent) and doesn't send its
  // next request within 5s of the previous response, the server closes the
  // socket. Under concurrent load, a *reused* connection can lose the race
  // — the server decides the socket is idle and starts closing it at
  // roughly the same moment the client agent picks that exact socket to
  // send the next queued request on — and the client sees ECONNRESET.
  // (This only bites connections that get reused; supertest without an
  // explicit keep-alive Agent opens one fresh connection per request and
  // never hits this specific race, so it wasn't visible before.) Node
  // requires headersTimeout > keepAliveTimeout or it logs a warning and
  // effectively ignores keepAliveTimeout, so both need raising together.
  // 65s comfortably exceeds anything this test suite's burst could
  // legitimately take, mirroring the values commonly used in front of a
  // load balancer for exactly this reason.
  const httpServer = app.getHttpServer();
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  return app;
}

/**
 * Force-closes every @Processor() worker's underlying BullMQ Worker BEFORE
 * anything else shuts down.
 *
 * Root cause of the "Jest did not exit one second after the test run has
 * completed" warning: @nestjs/bullmq's own automatic shutdown
 * (BullExplorer.onApplicationShutdown, in node_modules/@nestjs/bullmq)
 * calls `worker.close()` for every @Processor()-decorated class — with NO
 * arguments, i.e. force=false. BullMQ's Worker.close(false) waits for the
 * worker's current blocking Redis call (it polls for jobs via blocking
 * commands like BZPOPMIN) to return on its own before the connection is
 * allowed to disconnect, rather than tearing it down immediately. The
 * `forceDisconnectOnShutdown: true` set in QueueModule's connection config
 * does NOT help here — that option is only read by the Queue class's own
 * shutdown handler (see node_modules/@nestjs/bullmq's queue-provider
 * factory), never by BullExplorer's worker-closing code. So every Worker's
 * Redis connection was always waiting out its own graceful drain instead of
 * disconnecting immediately — often past Jest's 1-second check, hence the
 * warning, even though nothing was actually leaked forever.
 *
 * Calling `worker.close(true)` ourselves, via the actual WorkerHost
 * instances (not the Queue token — a Worker is a separate object,
 * reachable as `instance.worker` on the @Processor() class itself), forces
 * an immediate disconnect instead of waiting on the drain. This changes
 * nothing about how the app behaves in production shutdown (main.ts and
 * AppModule are untouched); it's purely test-teardown-specific and safe
 * precisely because a test doesn't need to wait for an in-flight job to
 * drain the way a real deploy's graceful shutdown should.
 */
async function closeAllWorkers(app: INestApplication): Promise<void> {
  await Promise.all(
    ALL_PROCESSOR_TOKENS.map(async (token) => {
      const instance = app.get(token, { strict: false }) as { worker?: { close: (force?: boolean) => Promise<void> } } | null;
      if (!instance?.worker) return;
      await instance.worker.close(true);
    }),
  );
}

/**
 * Explicitly closes every registered BullMQ Queue client (producer side —
 * see closeAllWorkers above for the Worker/consumer side, which is the
 * actual fix for the open-handle warning) before the wider Nest app
 * teardown, rather than relying solely on Nest's own onApplicationShutdown
 * cascade, which does not guarantee destroy order across unrelated
 * providers.
 */
async function closeAllQueues(app: INestApplication): Promise<void> {
  await Promise.all(
    ALL_QUEUE_NAMES.map(async (name) => {
      const queue = app.get<Queue>(getQueueToken(name), { strict: false });
      if (!queue) return;
      await queue.close();
    }),
  );
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
  await closeAllWorkers(app);
  await closeAllQueues(app);
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
