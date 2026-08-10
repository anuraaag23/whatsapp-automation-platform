import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { WhatsappClient } from '../whatsapp/whatsapp.client';
import { ConnectWhatsappAccountDto } from './dto/connect-whatsapp-account.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly whatsappClient: WhatsappClient,
  ) {}

  getOrganization(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  }

  updateOrganization(organizationId: string, dto: UpdateOrganizationDto) {
    return this.prisma.organization.update({ where: { id: organizationId }, data: dto });
  }

  async getWhatsappAccount(organizationId: string) {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { organizationId } });
    if (!account) return null;
    // Never return the ciphertext (or a decrypted token) to the client.
    const { accessTokenCiphertext, ...safe } = account;
    return { ...safe, hasAccessToken: Boolean(accessTokenCiphertext) };
  }

  /** Live quality rating + messaging tier from Meta, fetched on demand (not cached/stored). */
  async getWhatsappAccountStatus(organizationId: string) {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { organizationId } });
    if (!account) throw new NotFoundException('No WhatsApp account connected');

    const status = await this.whatsappClient.getPhoneNumberStatus(
      account.phoneNumberId,
      this.crypto.decrypt(account.accessTokenCiphertext),
    );

    if (!status) {
      throw new NotFoundException(
        'Could not reach Meta to fetch status — check the connected account\u2019s access token is still valid',
      );
    }

    return status;
  }

  async connectWhatsappAccount(organizationId: string, dto: ConnectWhatsappAccountDto) {
    const accessTokenCiphertext = this.crypto.encrypt(dto.accessToken);

    const account = await this.prisma.whatsappAccount.upsert({
      where: { organizationId },
      create: {
        organizationId,
        businessAccountId: dto.businessAccountId,
        phoneNumberId: dto.phoneNumberId,
        displayPhoneNumber: dto.displayPhoneNumber,
        accessTokenCiphertext,
        webhookVerifyToken: crypto.randomBytes(24).toString('hex'),
        apiVersion: dto.apiVersion ?? 'v20.0',
        status: 'connected',
      },
      update: {
        businessAccountId: dto.businessAccountId,
        phoneNumberId: dto.phoneNumberId,
        displayPhoneNumber: dto.displayPhoneNumber,
        accessTokenCiphertext,
        apiVersion: dto.apiVersion ?? 'v20.0',
        status: 'connected',
      },
    });

    const { accessTokenCiphertext: _omit, ...safe } = account;
    return { ...safe, hasAccessToken: true };
  }

  async disconnectWhatsappAccount(organizationId: string) {
    const existing = await this.prisma.whatsappAccount.findUnique({ where: { organizationId } });
    if (!existing) throw new NotFoundException('No WhatsApp account connected');
    await this.prisma.whatsappAccount.delete({ where: { organizationId } });
    return { success: true };
  }

  async listApiKeys(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Returns the raw key exactly once — only the hash is persisted. */
  async createApiKey(organizationId: string, name: string) {
    const raw = `wap_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(raw).digest('hex');
    const apiKey = await this.prisma.apiKey.create({ data: { organizationId, name, keyHash } });
    return { id: apiKey.id, name: apiKey.name, key: raw };
  }

  async revokeApiKey(organizationId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, organizationId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  async getNotificationSettings(organizationId: string) {
    const settings = await this.prisma.notificationSettings.findUnique({ where: { organizationId } });
    if (!settings) {
      return {
        emailEnabled: false,
        slackEnabled: false,
        telegramEnabled: false,
        hasSmtpPassword: false,
        hasTelegramBotToken: false,
      };
    }
    const { smtpPasswordCiphertext, telegramBotTokenCiphertext, ...safe } = settings;
    return {
      ...safe,
      hasSmtpPassword: Boolean(smtpPasswordCiphertext),
      hasTelegramBotToken: Boolean(telegramBotTokenCiphertext),
    };
  }

  async updateNotificationSettings(organizationId: string, dto: UpdateNotificationSettingsDto) {
    const { smtpPassword, telegramBotToken, ...rest } = dto;

    const settings = await this.prisma.notificationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...rest,
        smtpPasswordCiphertext: smtpPassword ? this.crypto.encrypt(smtpPassword) : undefined,
        telegramBotTokenCiphertext: telegramBotToken ? this.crypto.encrypt(telegramBotToken) : undefined,
      },
      update: {
        ...rest,
        ...(smtpPassword ? { smtpPasswordCiphertext: this.crypto.encrypt(smtpPassword) } : {}),
        ...(telegramBotToken ? { telegramBotTokenCiphertext: this.crypto.encrypt(telegramBotToken) } : {}),
      },
    });

    const { smtpPasswordCiphertext, telegramBotTokenCiphertext, ...safe } = settings;
    return {
      ...safe,
      hasSmtpPassword: Boolean(smtpPasswordCiphertext),
      hasTelegramBotToken: Boolean(telegramBotTokenCiphertext),
    };
  }
}
