import { CanActivate, ExecutionContext, Injectable, Logger, RawBodyRequest, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Verifies Meta's `X-Hub-Signature-256` header on inbound WhatsApp Cloud API
 * webhook deliveries, per:
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating-payloads
 *
 * This is deliberately a standalone guard, NOT the global JwtAuthGuard —
 * Meta is not a logged-in user and never has an access token. Authenticity
 * here comes entirely from proving the sender knows WHATSAPP_APP_SECRET
 * (Meta's per-app secret, from the App Dashboard → Settings → Basic), by
 * recomputing the HMAC over the exact raw request bytes and comparing it to
 * what Meta sent, using a timing-safe comparison so response timing can't be
 * used to guess the signature byte by byte.
 *
 * Requires `rawBody: true` to be set when creating the Nest app (see
 * main.ts) so `request.rawBody` contains the untouched request bytes —
 * verifying against the JSON-parsed-and-reserialized body would not match
 * Meta's signature if formatting differs by even one byte (key order,
 * whitespace, unicode escaping, etc.).
 */
@Injectable()
export class WhatsappSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WhatsappSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();

    const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      // Fail closed: without a secret we cannot prove the request actually
      // came from Meta, so an unconfigured server must reject webhook
      // traffic rather than silently trust it.
      this.logger.error(
        'WHATSAPP_APP_SECRET is not configured — rejecting webhook request. Set it in the environment to the Meta App Secret (App Dashboard → Settings → Basic).',
      );
      throw new UnauthorizedException('Webhook signature verification is not configured');
    }

    const signatureHeader = request.headers['x-hub-signature-256'];
    if (!signatureHeader || typeof signatureHeader !== 'string') {
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException('Raw request body unavailable for signature verification');
    }

    const expectedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const expected = Buffer.from(`sha256=${expectedHex}`, 'utf8');
    const provided = Buffer.from(signatureHeader, 'utf8');

    // timingSafeEqual throws if lengths differ, so check that first (this
    // length check itself leaks only the length, not any signature byte).
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
