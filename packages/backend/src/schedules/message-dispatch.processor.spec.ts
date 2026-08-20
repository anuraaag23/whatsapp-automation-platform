import { Test } from '@nestjs/testing';
import { MessageDispatchProcessor } from './message-dispatch.processor';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';

function createPrismaMock() {
  const contacts = new Map<string, any>();
  const templates = new Map<string, any>();

  return {
    contact: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          [...contacts.values()].find(
            (c) => c.id === where.id && c.organizationId === where.organizationId,
          ) ?? null
        );
      }),
    },
    messageTemplate: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          [...templates.values()].find(
            (t) => t.id === where.id && t.organizationId === where.organizationId,
          ) ?? null
        );
      }),
    },
    __contacts: contacts,
    __templates: templates,
  };
}

describe('MessageDispatchProcessor — tenant isolation', () => {
  let processor: MessageDispatchProcessor;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let whatsappServiceMock: { sendToContact: jest.Mock };

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    prismaMock.__contacts.set('contact_org_a', {
      id: 'contact_org_a',
      organizationId: 'org_a',
      optInStatus: 'OPTED_IN',
      firstName: 'A',
      lastName: null,
      company: null,
      city: null,
    });
    prismaMock.__contacts.set('contact_org_b', {
      id: 'contact_org_b',
      organizationId: 'org_b',
      optInStatus: 'OPTED_IN',
      firstName: 'B',
      lastName: null,
      company: null,
      city: null,
    });
    prismaMock.__templates.set('template_org_b', {
      id: 'template_org_b',
      organizationId: 'org_b',
      name: 'org_b_only_template',
      language: 'en_US',
    });

    whatsappServiceMock = { sendToContact: jest.fn(async () => ({ status: 'SENT' })) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MessageDispatchProcessor,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WhatsappService, useValue: whatsappServiceMock },
        { provide: CampaignsService, useValue: { checkAndMarkCompletion: jest.fn() } },
      ],
    }).compile();

    processor = moduleRef.get(MessageDispatchProcessor);
  });

  it('sends when the job\'s contactId belongs to the job\'s organizationId', async () => {
    await processor.process({
      data: { organizationId: 'org_a', contactId: 'contact_org_a', body: 'hi {{first_name}}' },
    } as any);

    expect(whatsappServiceMock.sendToContact).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_a', contactId: 'contact_org_a', content: { body: 'hi A' } }),
    );
  });

  it('refuses to dispatch when the job\'s contactId belongs to a DIFFERENT organization', async () => {
    // Before the Objective 3 fix, this would have resolved contact_org_b
    // (via an unscoped findUnique) and sent it a message using org_a's
    // WhatsApp account.
    await processor.process({
      data: { organizationId: 'org_a', contactId: 'contact_org_b', body: 'hi' },
    } as any);

    expect(whatsappServiceMock.sendToContact).not.toHaveBeenCalled();
  });

  it('refuses to use a template belonging to a different organization, even with a valid contact', async () => {
    // template_org_b exists, but not under org_a — must not be used to
    // send on org_a's behalf. Falls back to the plain-text path instead of
    // silently succeeding with someone else's template content.
    await processor.process({
      data: { organizationId: 'org_a', contactId: 'contact_org_a', templateId: 'template_org_b', body: 'fallback text' },
    } as any);

    expect(whatsappServiceMock.sendToContact).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TEXT', content: { body: 'fallback text' } }),
    );
    expect(whatsappServiceMock.sendToContact).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ name: 'org_b_only_template' }) }),
    );
  });
});
