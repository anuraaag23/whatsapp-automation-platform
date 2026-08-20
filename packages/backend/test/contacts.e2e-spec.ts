import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestApp, createTestApp, registerOwner, TestActor } from './utils/test-app';

describe('Contacts (e2e)', () => {
  let app: INestApplication;
  let owner: TestActor;
  let otherOrgOwner: TestActor;
  let contactId: string;
  let tagId: string;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerOwner(app, 'contacts-owner');
    otherOrgOwner = await registerOwner(app, 'contacts-other-org');
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('rejects an invalid phone number', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ phoneNumber: 'not-a-phone-number', firstName: 'Bad' })
      .expect(400);

    expect(res.body.message).toBeDefined();
  });

  it('creates a contact', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        phoneNumber: '+15551234567',
        firstName: 'Anurag',
        lastName: 'Yadav',
        company: 'RYPER',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.phoneNumber).toBe('+15551234567');
    contactId = res.body.id;
  });

  it('rejects a duplicate phone number within the same organization', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ phoneNumber: '+15551234567', firstName: 'Duplicate' })
      .expect(409);
  });

  it('lists contacts and finds the one just created', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.some((c: { id: string }) => c.id === contactId)).toBe(true);
  });

  it('gets a single contact by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(res.body.firstName).toBe('Anurag');
  });

  it('updates a contact', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ city: 'Varanasi' })
      .expect(200);

    expect(res.body.city).toBe('Varanasi');
  });

  it('creates a tag and attaches it to the contact', async () => {
    const tagRes = await request(app.getHttpServer())
      .post('/api/v1/contacts/tags')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'VIP', color: '#0A84FF' })
      .expect(201);

    tagId = tagRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/contacts/${contactId}/tags/${tagId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(201);

    const contactRes = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const tagIds = (contactRes.body.tags ?? []).map((t: { id?: string; tagId?: string }) => t.id ?? t.tagId);
    expect(tagIds).toContain(tagId);
  });

  it('toggles favorite, archive, and opt-in flags', async () => {
    const favRes = await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}/favorite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ isFavorite: true })
      .expect(200);
    expect(favRes.body.isFavorite).toBe(true);

    const archiveRes = await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}/archive`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ isArchived: true })
      .expect(200);
    expect(archiveRes.body.isArchived).toBe(true);

    // Un-archive so later list/bulk assertions aren't surprised by default filtering.
    await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}/archive`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ isArchived: false })
      .expect(200);

    const optInRes = await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}/opt-in`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ optedIn: false })
      .expect(200);
    expect(optInRes.body.optInStatus).toBe('OPTED_OUT');
  });

  it('imports contacts via CSV', async () => {
    const csv = 'phoneNumber,firstName,lastName\n+15559876543,Imported,Contact\n+15559876544,Second,Import';

    const res = await request(app.getHttpServer())
      .post('/api/v1/contacts/import')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ csv })
      .expect(201);

    expect(res.body.imported ?? res.body.created ?? res.body.count).toBeGreaterThanOrEqual(2);
  });

  it('bulk-tags, bulk-archives, and bulk-deletes contacts', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const items = Array.isArray(listRes.body) ? listRes.body : listRes.body.items;
    const importedIds = items
      .filter((c: { phoneNumber: string }) => c.phoneNumber.startsWith('+155598765'))
      .map((c: { id: string }) => c.id);
    expect(importedIds.length).toBeGreaterThanOrEqual(2);

    await request(app.getHttpServer())
      .post('/api/v1/contacts/bulk/tag')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ contactIds: importedIds, tagId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/contacts/bulk/archive')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ contactIds: importedIds, isArchived: true })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/contacts/bulk/delete')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ contactIds: importedIds })
      .expect(201);

    for (const id of importedIds) {
      await request(app.getHttpServer())
        .get(`/api/v1/contacts/${id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);
    }
  });

  it("does not leak contacts across organizations", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${otherOrgOwner.accessToken}`)
      .expect(404);
  });

  it('deletes a contact', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });
});
