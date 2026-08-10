import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface WhatsappSendResult {
  success: boolean;
  waMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SendTextParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
}

export interface SendTemplateParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: Record<string, unknown>[];
}

export interface SendMediaParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  type: 'image' | 'video' | 'audio' | 'document';
  link: string;
  caption?: string;
}

/**
 * Thin client over the official WhatsApp Business (Meta Cloud API) Graph
 * endpoints. Every call here hits the real Graph API surface — nothing is
 * mocked — but it needs a live phoneNumberId + accessToken from a connected
 * WhatsappAccount to actually deliver anything. Without those it will fail
 * with a real 4xx from Meta, exactly as it should.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
@Injectable()
export class WhatsappClient {
  private readonly logger = new Logger(WhatsappClient.name);
  private readonly http: AxiosInstance;
  private readonly apiVersion: string;

  constructor(private readonly config: ConfigService) {
    this.apiVersion = this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v20.0';
    this.http = axios.create({ baseURL: `https://graph.facebook.com/${this.apiVersion}` });
  }

  async sendText(params: SendTextParams): Promise<WhatsappSendResult> {
    return this.post(params.phoneNumberId, params.accessToken, {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: { body: params.body, preview_url: true },
    });
  }

  async sendTemplate(params: SendTemplateParams): Promise<WhatsappSendResult> {
    return this.post(params.phoneNumberId, params.accessToken, {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.languageCode },
        components: params.components ?? [],
      },
    });
  }

  async sendMedia(params: SendMediaParams): Promise<WhatsappSendResult> {
    return this.post(params.phoneNumberId, params.accessToken, {
      messaging_product: 'whatsapp',
      to: params.to,
      type: params.type,
      [params.type]: { link: params.link, caption: params.caption },
    });
  }

  /** Registers a template with Meta for approval. Requires MANAGE_TEMPLATES permission. */
  async createTemplate(
    businessAccountId: string,
    accessToken: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; status: string } | null> {
    try {
      const { data } = await this.http.post(`/${businessAccountId}/message_templates`, payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { id: data.id, status: data.status };
    } catch (error) {
      this.logger.error('Failed to create WhatsApp template', this.describeError(error));
      return null;
    }
  }

  /**
   * Fetches live status for the connected phone number: quality rating
   * (GREEN/YELLOW/RED, set by Meta based on block/report rates), the
   * messaging tier limit (how many unique customers can be messaged per
   * 24h), and verification status. Surfaced in Settings so quality issues
   * are visible before they cause a suspension, not after.
   */
  async getPhoneNumberStatus(
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{
    displayPhoneNumber: string;
    verifiedName: string;
    qualityRating: string;
    codeVerificationStatus: string;
    messagingLimitTier: string;
  } | null> {
    try {
      const { data } = await this.http.get(`/${phoneNumberId}`, {
        params: {
          fields: 'display_phone_number,verified_name,quality_rating,code_verification_status,messaging_limit_tier',
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return {
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating ?? 'UNKNOWN',
        codeVerificationStatus: data.code_verification_status ?? 'UNKNOWN',
        messagingLimitTier: data.messaging_limit_tier ?? 'UNKNOWN',
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch phone number status: ${this.describeError(error).message}`);
      return null;
    }
  }

  private async post(
    phoneNumberId: string,
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<WhatsappSendResult> {
    try {
      const { data } = await this.http.post(`/${phoneNumberId}/messages`, body, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { success: true, waMessageId: data.messages?.[0]?.id };
    } catch (error) {
      const described = this.describeError(error);
      this.logger.warn(`WhatsApp send failed: ${described.message}`);
      return { success: false, errorCode: described.code, errorMessage: described.message };
    }
  }

  private describeError(error: unknown): { code?: string; message: string } {
    if (axios.isAxiosError(error)) {
      const waError = error.response?.data?.error;
      return {
        code: waError?.code ? String(waError.code) : error.code,
        message: waError?.message ?? error.message,
      };
    }
    return { message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
