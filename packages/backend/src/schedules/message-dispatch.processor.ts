import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MESSAGE_TYPE } from '../common/constants/prisma-enums.constants';
import { MESSAGE_DISPATCH_QUEUE } from '../queue/queue.module';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';

export interface DispatchJobData {
  organizationId: string;
  contactId: string;
  scheduleId?: string;
  campaignId?: string;
  templateId?: string;
  body?: string;
}

@Processor(MESSAGE_DISPATCH_QUEUE, { concurrency: 5 })
export class MessageDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageDispatchProcessor.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
  ) {
    super();
  }

  async process(job: Job<DispatchJobData>): Promise<void> {
    const { organizationId, contactId, scheduleId, campaignId, templateId, body } = job.data;

    // Scoped by (id, organizationId) together — job.data.organizationId is
    // which account to send FROM, but was never actually verified against
    // the contact/template being sent TO until this fix. See
    // WhatsappService.sendToContact for the matching fix at the other end
    // of this same call chain.
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, organizationId } });
    if (!contact || contact.optInStatus !== 'OPTED_IN') {
      this.logger.warn(`Skipping dispatch to ${contactId}: contact missing, not opted in, or not in this organization`);
      return;
    }

    const rendered = body ? this.renderVariables(body, contact) : undefined;

    if (templateId) {
      const template = await this.prisma.messageTemplate.findFirst({ where: { id: templateId, organizationId } });
      if (template) {
        await this.whatsappService.sendToContact({
          organizationId,
          contactId,
          type: MESSAGE_TYPE.TEMPLATE,
          content: { name: template.name, language: template.language },
          scheduleId,
          campaignId,
        });
        if (campaignId) await this.campaignsService.checkAndMarkCompletion(campaignId);
        return;
      }
    }

    await this.whatsappService.sendToContact({
      organizationId,
      contactId,
      type: MESSAGE_TYPE.TEXT,
      content: { body: rendered ?? body ?? '' },
      scheduleId,
      campaignId,
    });
    if (campaignId) await this.campaignsService.checkAndMarkCompletion(campaignId);
  }

  /** Substitutes {{first_name}}, {{last_name}}, {{company}}, {{city}} from the VARIABLES section of the spec. */
  private renderVariables(text: string, contact: { firstName: string | null; lastName: string | null; company: string | null; city: string | null }): string {
    return text
      .replace(/{{\s*first_name\s*}}/gi, contact.firstName ?? '')
      .replace(/{{\s*last_name\s*}}/gi, contact.lastName ?? '')
      .replace(/{{\s*company\s*}}/gi, contact.company ?? '')
      .replace(/{{\s*city\s*}}/gi, contact.city ?? '')
      .replace(/{{\s*date\s*}}/gi, new Date().toLocaleDateString());
  }
}
