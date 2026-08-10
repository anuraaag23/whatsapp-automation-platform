import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerOwner, TestActor } from './utils/test-app';

describe('Templates (e2e)', () => {
  let app: INestApplication;
  let owner: TestActor;
  let templateId: string;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerOwner(app, 'templates-owner');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an invalid category', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'bad_category_template',
        category: 'NOT_A_REAL_CATEGORY',
        language: 'en_US',
        bodyText: 'Hello {{1}}',
      })
      .expect(400);
  });

  it('creates a template', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'order_confirmation',
        category: 'MARKETING',
        language: 'en_US',
        bodyText: 'Hi {{1}}, your order {{2}} is confirmed!',
        variables: ['name', 'order_id'],
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('order_confirmation');
    templateId = res.body.id;
  });

  it('lists templates and finds the one just created', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/templates')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.some((t: { id: string }) => t.id === templateId)).toBe(true);
  });

  it('updates a template', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/templates/${templateId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ footerText: 'Reply STOP to unsubscribe' })
      .expect(200);

    expect(res.body.footerText).toBe('Reply STOP to unsubscribe');
  });

  it('previews a template, substituting {{1}}/{{2}} placeholders with sample data', async () => {
    // bodyText was created as 'Hi {{1}}, your order {{2}} is confirmed!' —
    // preview()'s regex captures the token inside {{ }} verbatim as the
    // sampleData key, so numbered WhatsApp-style placeholders need numeric
    // keys, not the human-readable variable names from `variables`.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/templates/${templateId}/preview`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ '1': 'Anurag', '2': '#1042' })
      .expect(201);

    expect(res.body.rendered).toBe('Hi Anurag, your order #1042 is confirmed!');
  });

  it('gracefully declines to submit when no WhatsApp account is connected', async () => {
    // This test org never connects a WhatsApp Business account, so submission
    // is expected to no-op rather than error — submitForApproval() checks for
    // a connected account before calling out to Meta's API.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/templates/${templateId}/submit`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(201);

    expect(res.body.submitted).toBe(false);
    expect(res.body.reason).toMatch(/WhatsApp/i);
  });

  it('records a DRAFT history entry from creation', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/templates/${templateId}/history`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('404s for a template that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/templates/not-a-real-id')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('deletes a template', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/templates/${templateId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/templates/${templateId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });
});
