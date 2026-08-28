import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import http from 'http';
import { createHmac } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { closeTestApp, createTestApp } from './utils/test-app';

/**
 * WHATSAPP_APP_SECRET is guaranteed to be set for every e2e run by
 * test/env-setup.ts (loaded via Jest's `setupFiles`, before this file or
 * any test module is evaluated) — see TEST_ENV_FIX_REPORT.md. These tests
 * used to skip with a warning when it was missing; now that it's always
 * present, they always run. The assertion below is a defensive check, not
 * a real branch: if it ever fires, setupFiles has been misconfigured, and
 * that should fail loudly rather than silently skip signature/idempotency
 * coverage again.
 */
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
if (!APP_SECRET) {
  throw new Error(
    'WHATSAPP_APP_SECRET is unset even though test/env-setup.ts should have set it. ' +
      'Check that test/jest-e2e.json still has "setupFiles": ["<rootDir>/env-setup.ts"].',
  );
}

const webhookPath = '/api/v1/webhooks/whatsapp';

function sign(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/**
 * Dispatch now runs asynchronously on a BullMQ worker (see
 * PHASE_C_REPORT.md — this is the burst/ECONNRESET fix), not inline in the
 * HTTP request, so a webhook event's status is only guaranteed to be
 * RECEIVED, not PROCESSED, by the time the POST resolves. Tests that need
 * to observe the outcome of dispatch (not just that it was accepted) poll
 * for it instead of asserting immediately after the response.
 */
async function waitForEventStatus(
  prisma: PrismaService,
  externalEventId: string,
  timeoutMs = 10_000,
): Promise<{ status: string } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [event] = await prisma.webhookEvent.findMany({ where: { provider: 'whatsapp', externalEventId } });
    if (event && event.status !== 'RECEIVED') return event;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function waitForAllProcessed(
  prisma: PrismaService,
  externalEventIds: string[],
  timeoutMs = 20_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const processed = await prisma.webhookEvent.count({
      where: { provider: 'whatsapp', externalEventId: { in: externalEventIds }, status: 'PROCESSED' },
    });
    if (processed === externalEventIds.length) return processed;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return prisma.webhookEvent.count({
    where: { provider: 'whatsapp', externalEventId: { in: externalEventIds }, status: 'PROCESSED' },
  });
}

/**
 * A fresh, valid-looking phone number every call. Deliberately NOT a
 * shared constant: earlier tests in this file (e.g. 'accepts a validly
 * signed POST') intentionally return as soon as the HTTP response comes
 * back, without waiting for their webhook event to finish async
 * processing — correct for what THOSE tests check (the fast synchronous
 * accept path), but it means their contact-creation work can still be
 * in flight when a LATER test starts. If two tests shared the same
 * default phone number, that leftover work and the next test's own
 * request would race on the same Contact/Conversation row — this is
 * what was actually causing the intermittent "processes two genuinely
 * different events independently" failure (see PHASE_C4_REPORT.md), not
 * an async-completion/listener-registration bug in production code.
 * Giving every call its own number removes the shared state the race
 * needed, rather than trying to out-wait a race with more polling.
 */
let inboundFromCounter = 0;
function nextTestPhoneNumber(): string {
  inboundFromCounter += 1;
  return `1555${Date.now().toString().slice(-6)}${String(inboundFromCounter).padStart(3, '0')}`;
}

function buildInboundPayload(messageId: string, from = nextTestPhoneNumber(), testPhoneNumberId = 'test-phone-number-id', text = 'hi') {
  return {
    entry: [
      {
        id: 'test-waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: testPhoneNumberId },
              messages: [{ id: messageId, from, type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsApp webhook hardening (Phase B)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let organizationId: string;
  let phoneNumberId: string;

  beforeAll(async () => {
    // Explicit, generous timeout, matching afterAll's below — see its
    // comment for why. This hook does the same category of real I/O
    // (createTestApp() connects to Postgres, Redis, and bootstraps ~6
    // BullMQ queues/workers, before this hook even starts its own seed
    // writes) and was previously relying on Jest's bare 5000ms default,
    // which was always marginal for that amount of real network I/O, not
    // something the diagnostic instrumentation below (entirely scoped
    // inside the burst test's own `it()` body, never executed until well
    // after this hook completes) could affect.
    app = await createTestApp();
    prisma = app.get(PrismaService);

    // Phase D: dispatch for an inbound_message event now actually resolves
    // the receiving WhatsApp account and persists a real Contact,
    // Conversation, and Message — it's no longer just an event emission.
    // That resolution is genuinely organization-boundary-derived (see
    // InboundMessageService), so these tests need a real account seeded
    // matching buildInboundPayload's phone_number_id, the same way a real
    // deployment would have one connected before Meta ever sends it a
    // webhook.
    // Use a unique phoneNumberId per test run to avoid collisions with
    // leftover test data from previous runs.
    phoneNumberId = `test-phone-number-id-${Date.now()}`;
    const organization = await prisma.organization.create({
      data: { name: `Webhook Test Org ${Date.now()}`, slug: `webhook-test-org-${Date.now()}` },
    });
    organizationId = organization.id;
    await prisma.whatsappAccount.create({
      data: {
        organizationId,
        businessAccountId: 'test-waba-id',
        phoneNumberId,
        displayPhoneNumber: '+15550009999',
        accessTokenCiphertext: 'not-a-real-token',
        webhookVerifyToken: 'not-a-real-verify-token',
      },
    });
  }, 30_000);

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

  it('rejects a POST with no X-Hub-Signature-256 header', async () => {
    const raw = JSON.stringify(buildInboundPayload(`wamid.nosig.${Date.now()}`));

    await request(app.getHttpServer()).post(webhookPath).type('json').send(raw).expect(401);
  });

  it('rejects a POST with a well-formed but incorrect signature', async () => {
    const raw = JSON.stringify(buildInboundPayload(`wamid.badsig.${Date.now()}`));

    await request(app.getHttpServer())
      .post(webhookPath)
      .type('json')
      .set('X-Hub-Signature-256', `sha256=${'0'.repeat(64)}`)
      .send(raw)
      .expect(401);
  });

  it('keeps the GET verification handshake public and unauthenticated by signature', async () => {
    const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN as string;
    const res = await request(app.getHttpServer())
      .get(webhookPath)
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': 'abc123' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  it('rejects the GET verification handshake when the verify token does not match', async () => {
    const res = await request(app.getHttpServer())
      .get(webhookPath)
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'abc123' });

    expect(res.status).toBe(403);
  });

  it('accepts a validly signed POST', async () => {
    const raw = JSON.stringify(buildInboundPayload(`wamid.valid.${Date.now()}`));

    const res = await request(app.getHttpServer())
      .post(webhookPath)
      .type('json')
      .set('X-Hub-Signature-256', sign(raw, APP_SECRET as string))
      .send(raw);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: true });
  });

  it('processes the same webhook event exactly once when Meta redelivers it', async () => {
    const messageId = `wamid.dup.${Date.now()}`;
    // Use unique text to avoid cross-test listener interference
    const uniqueText = `idempotency-test-${Date.now()}`;
    const raw = JSON.stringify(buildInboundPayload(messageId, undefined, phoneNumberId, uniqueText));
    const signature = sign(raw, APP_SECRET as string);

    const events = app.get(EventEmitter2);
    let fired = 0;
    const listener = (payload: any) => {
      if (payload.text === uniqueText) fired += 1;
    };
    events.on('whatsapp.inbound_message', listener);

    await request(app.getHttpServer())
      .post(webhookPath)
      .type('json')
      .set('X-Hub-Signature-256', signature)
      .send(raw)
      .expect(201);

    // Same bytes, same signature — exactly what a Meta redelivery looks
    // like. Dedup happens synchronously at accept time (before any
    // enqueueing), so this is rejected immediately regardless of whether
    // the first delivery has finished async processing yet.
    await request(app.getHttpServer())
      .post(webhookPath)
      .type('json')
      .set('X-Hub-Signature-256', signature)
      .send(raw)
      .expect(201);

    // Dispatch for the (one, deduped) accepted delivery runs on a BullMQ
    // worker, not inline in the request — wait for it to actually finish
    // before checking the outcome.
    const finalEvent = await waitForEventStatus(prisma, messageId);

    events.off('whatsapp.inbound_message', listener);

    expect(finalEvent?.status).toBe('PROCESSED');
    expect(fired).toBe(1);

    const stored = await prisma.webhookEvent.findMany({
      where: { provider: 'whatsapp', externalEventId: messageId },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('PROCESSED');

    // The webhook-event-level dedup is necessary but not sufficient —
    // what actually matters is that a Meta redelivery never creates a
    // second application Message row for the same WAMID.
    const messages = await prisma.message.findMany({ where: { organizationId, waMessageId: messageId } });
    expect(messages).toHaveLength(1);
  });

  it('processes two genuinely different events independently', async () => {
    // idA and idB each get their own auto-generated sender phone number
    // (buildInboundPayload's default) — this used to intermittently show
    // `fired: 0` even though both events reached PROCESSED, because every
    // other test in this file defaulted to the SAME phone number, and an
    // earlier test's contact-creation work could still be racing
    // in-flight (deliberately not waited on — see e.g. 'accepts a validly
    // signed POST') when this test's own request landed. Root cause was
    // shared test state, not a production bug — see PHASE_C4_REPORT.md.
    const idA = `wamid.distinctA.${Date.now()}`;
    const idB = `wamid.distinctB.${Date.now()}`;

    const events = app.get(EventEmitter2);
    let fired = 0;
    const listener = (payload: any) => {
      fired += 1;
    };
    events.on('whatsapp.inbound_message', listener);

    for (const id of [idA, idB]) {
      const raw = JSON.stringify(buildInboundPayload(id, undefined, phoneNumberId));
      await request(app.getHttpServer())
        .post(webhookPath)
        .type('json')
        .set('X-Hub-Signature-256', sign(raw, APP_SECRET as string))
        .send(raw)
        .expect(201);
    }

    const processedCount = await waitForAllProcessed(prisma, [idA, idB], 30_000);

    events.off('whatsapp.inbound_message', listener);

    expect(processedCount).toBe(2);
    expect(fired).toBe(2);

    const stored = await prisma.webhookEvent.findMany({
      where: { provider: 'whatsapp', externalEventId: { in: [idA, idB] } },
    });
    expect(stored).toHaveLength(2);
  });

  it('reuses the same conversation for a second message from the same contact', async () => {
    const from = `15550${Date.now().toString().slice(-6)}`;
    const idA = `wamid.convA.${Date.now()}`;
    const idB = `wamid.convB.${Date.now()}`;

    for (const id of [idA, idB]) {
      const raw = JSON.stringify(buildInboundPayload(id, from, phoneNumberId));
      await request(app.getHttpServer())
        .post(webhookPath)
        .type('json')
        .set('X-Hub-Signature-256', sign(raw, APP_SECRET as string))
        .send(raw)
        .expect(201);
    }

    await waitForAllProcessed(prisma, [idA, idB]);

    const contact = await prisma.contact.findFirst({ where: { organizationId, phoneNumber: from } });
    expect(contact).not.toBeNull();

    const conversations = await prisma.conversation.findMany({ where: { organizationId, contactId: contact!.id } });
    expect(conversations).toHaveLength(1);

    const messages = await prisma.message.findMany({ where: { conversationId: conversations[0].id } });
    expect(messages).toHaveLength(2);
    expect(conversations[0].unreadCount).toBe(2);
  });

  it(
    'tolerates a burst of legitimate signed requests above the generic 120/min API limit',
    async () => {
      // 150 > the global 120/min default, but under this route's 300/min
      // override — this is the number that actually distinguishes "the
      // override is applied" from "the request volume was just low".
      //
      // Root cause of the ECONNRESET/hang this test used to intermittently
      // produce: it was never an application bug. createTestApp() (see
      // test/utils/test-app.ts) previously relied on supertest's own lazy
      // .listen(0) behavior — calling it internally the first time a
      // request hits a server that isn't listening yet — rather than the
      // app explicitly listening itself. That works fine for individual,
      // sequential requests (which is exactly why this file's earlier
      // tests always passed), but does not hold up under a large
      // concurrent burst fired in a tight loop. Confirmed via a minimal,
      // dependency-free reproduction (a bare Node http.Server, no
      // Nest/Prisma/Redis/BullMQ involved at all): lazy-listen produced
      // ~147/150 ECONNRESET even after 8 successful sequential warm-up
      // requests first (ruling out "just hasn't started listening yet" as
      // the explanation), while having the app explicitly call
      // app.listen(0) before any requests eliminated it completely. See
      // createTestApp() for the fix.
      //
      // The request path itself does a single fast INSERT per sub-event
      // before responding, with the real dispatch chain running async on a
      // BullMQ worker (see PHASE_C_REPORT.md) — the burst also fires
      // through a keep-alive agent sized to the full request count so no
      // request needs to queue for or reuse a socket mid-burst.
      const count = 150;
      const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: count });

      try {
        const externalIds = Array.from({ length: count }, (_, i) => `wamid.burst.${Date.now()}.${i}`);
        const requests = externalIds.map((id) => {
          const raw = JSON.stringify(buildInboundPayload(id, undefined, phoneNumberId));
          return request(app.getHttpServer())
            .post(webhookPath)
            .agent(keepAliveAgent)
            .type('json')
            .set('X-Hub-Signature-256', sign(raw, APP_SECRET as string))
            .send(raw);
        });

        // Promise.all, not allSettled: any request that errors (including a
        // connection reset) throws here and fails the test immediately and
        // loudly, rather than being counted, tolerated, or silently dropped.
        const responses = await Promise.all(requests);

        for (const res of responses) {
          expect(res.status).toBe(201);
        }

        const processedCount = await waitForAllProcessed(prisma, externalIds, 40_000);
        expect(processedCount).toBe(count);

        // waitForAllProcessed confirms our own DB status is PROCESSED for
        // every event — that happens inside the job processor function,
        // microseconds BEFORE BullMQ finishes its own internal
        // job-finalization (marking the job complete, applying
        // removeOnComplete, releasing its lock). Letting that settle here,
        // rather than immediately proceeding to this file's afterAll,
        // reduces the chance worker.close() has to wait on trailing BullMQ
        // bookkeeping from this specific 150-job burst — see
        // PHASE_C3_REPORT.md.
        await new Promise((resolve) => setTimeout(resolve, 500));
      } finally {
        keepAliveAgent.destroy();
      }
    },
    45_000,
  );
});
