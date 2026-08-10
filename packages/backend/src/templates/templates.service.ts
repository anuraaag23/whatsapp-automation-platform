import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { WhatsappClient } from '../whatsapp/whatsapp.client';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

export interface TemplateStatusUpdateEvent {
  waTemplateId: string;
  status: string;
  reason?: string;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappClient: WhatsappClient,
    private readonly crypto: CryptoService,
  ) {}

  list(organizationId: string) {
    return this.prisma.messageTemplate.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async create(organizationId: string, dto: CreateTemplateDto) {
    const template = await this.prisma.messageTemplate.create({
      data: {
        ...dto,
        organizationId,
        variables: (dto.variables ?? []) as Prisma.InputJsonValue,
        buttons: (dto.buttons ?? []) as Prisma.InputJsonValue,
      },
    });
    await this.prisma.templateStatusHistory.create({
      data: { templateId: template.id, status: 'DRAFT' },
    });
    return template;
  }

  async update(organizationId: string, id: string, dto: UpdateTemplateDto) {
    await this.findOne(organizationId, id);
    const { variables, buttons, ...rest } = dto;
    return this.prisma.messageTemplate.update({
      where: { id },
      data: {
        ...rest,
        ...(variables ? { variables: variables as Prisma.InputJsonValue } : {}),
        ...(buttons ? { buttons: buttons as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.messageTemplate.delete({ where: { id } });
    return { success: true };
  }

  /** Renders {{variable}} placeholders against a sample data set for live preview. */
  async preview(organizationId: string, id: string, sampleData: Record<string, string>) {
    const template = await this.findOne(organizationId, id);
    const rendered = template.bodyText.replace(/{{\s*([\w]+)\s*}}/g, (_match: string, key: string) => {
      return sampleData[key] ?? `{{${key}}}`;
    });
    return { rendered };
  }

  /** Submits the template to Meta for approval. Requires a connected WhatsappAccount. */
  async submitForApproval(organizationId: string, id: string) {
    const template = await this.findOne(organizationId, id);
    const account = await this.prisma.whatsappAccount.findUnique({ where: { organizationId } });

    if (!account) {
      return {
        submitted: false,
        reason: 'No WhatsApp Business account connected for this organization',
      };
    }

    const result = await this.whatsappClient.createTemplate(
      account.businessAccountId,
      this.crypto.decrypt(account.accessTokenCiphertext),
      {
        name: template.name,
        category: template.category,
        language: template.language,
        components: [
          template.headerType !== 'NONE'
            ? { type: 'HEADER', format: template.headerType, text: template.headerContent }
            : undefined,
          { type: 'BODY', text: template.bodyText },
          template.footerText ? { type: 'FOOTER', text: template.footerText } : undefined,
        ].filter(Boolean),
      },
    );

    if (!result) {
      return { submitted: false, reason: 'Meta API rejected the submission — check server logs' };
    }

    await this.prisma.messageTemplate.update({
      where: { id },
      data: { waTemplateId: result.id, waStatus: 'PENDING' },
    });
    await this.prisma.templateStatusHistory.create({
      data: { templateId: id, status: 'PENDING', note: 'Submitted to Meta for review' },
    });

    return { submitted: true, waTemplateId: result.id, waStatus: result.status };
  }

  /** Applied by the WhatsApp webhook's message_template_status_update events. */
  @OnEvent('whatsapp.template_status_update')
  async applyStatusUpdate(event: TemplateStatusUpdateEvent) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { waTemplateId: event.waTemplateId },
    });
    if (!template) return;

    const statusMap: Record<string, 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED'> = {
      APPROVED: 'APPROVED',
      REJECTED: 'REJECTED',
      PAUSED: 'PAUSED',
      PENDING: 'PENDING',
      FLAGGED: 'PAUSED',
    };
    const normalized = statusMap[event.status?.toUpperCase() ?? ''] ?? 'PENDING';

    await this.prisma.messageTemplate.update({
      where: { id: template.id },
      data: { waStatus: normalized, waRejectionReason: event.reason },
    });
    await this.prisma.templateStatusHistory.create({
      data: { templateId: template.id, status: normalized, note: event.reason },
    });
  }

  async history(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.templateStatusHistory.findMany({
      where: { templateId: id },
      orderBy: { changedAt: 'desc' },
    });
  }
}
