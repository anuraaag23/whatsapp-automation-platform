import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

function buildInboundPayload(messageId: string, from = '15550001111') {
  return {
    entry: [
      {
        id: 'test-waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'test-phone-number-id' },
              messages: [{ id: messageId, from, type: 'text', text: { body: 'hi' } }],
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

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

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
    const raw = JSON.stringify(buildInboundPayload(messageId));
    const signature = sign(raw, APP_SECRET as string);

    const events = app.get(EventEmitter2);
    let fired = 0;
    const listener = (payload: any) => {
      if (payload.text === 'hi') fired += 1;
    };
    events.on('whatsapp.inbound_message', listener);

    await request(app.getHttpServer())
      .post(webhookPath)
      .type('json')
      .set('X-Hub-Signature-256', signature)
      .send(raw)
      .expect(201);

    // Same bytes, same signature — exactly what a Meta redelivery looks like.
    await request(app.getHttpServer())
      .post(webhookPath)
      .type('json')
      .set('X-Hub-Signature-256', signature)
      .send(raw)
      .expect(201);

    events.off('whatsapp.inbound_message', listener);

    expect(fired).toBe(1);

    const stored = await prisma.webhookEvent.findMany({
      where: { provider: 'whatsapp', externalEventId: messageId },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('PROCESSED');
  });

  it('processes two genuinely different events independently', async () => {
    const idA = `wamid.distinctA.${Date.now()}`;
    const idB = `wamid.distinctB.${Date.now()}`;

    const events = app.get(EventEmitter2);
    let fired = 0;
    const listener = () => (fired += 1);
    events.on('whatsapp.inbound_message', listener);

    for (const id of [idA, idB]) {
      const raw = JSON.stringify(buildInboundPayload(id));
      await request(app.getHttpServer())
        .post(webhookPath)
        .type('json')
        .set('X-Hub-Signature-256', sign(raw, APP_SECRET as string))
        .send(raw)
        .expect(201);
    }

    events.off('whatsapp.inbound_message', listener);
    expect(fired).toBe(2);

    const stored = await prisma.webhookEvent.findMany({
      where: { provider: 'whatsapp', externalEventId: { in: [idA, idB] } },
    });
    expect(stored).toHaveLength(2);
  });

  it(
    'tolerates a burst of legitimate signed requests above the generic 120/min API limit',
    async () => {
      // 150 > the global 120/min default, but under this route's 300/min
      // override — this is the number that actually distinguishes "the
      // override is applied" from "the request volume was just low".
      const count = 150;
      const requests = Array.from({ length: count }, (_, i) => {
        const raw = JSON.stringify(buildInboundPayload(`wamid.burst.${Date.now()}.${i}`));
        return request(app.getHttpServer())
          .post(webhookPath)
          .type('json')
          .set('X-Hub-Signature-256', sign(raw, APP_SECRET as string))
          .send(raw);
      });

      const responses = await Promise.all(requests);
      const throttled = responses.filter((r) => r.status === 429);

      expect(throttled).toHaveLength(0);
    },
    30_000,
  );
});
