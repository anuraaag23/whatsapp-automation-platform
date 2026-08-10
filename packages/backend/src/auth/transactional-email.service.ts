import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailSenderService } from '../notifications/senders/email-sender.service';

/**
 * Sends auth-flow emails (password reset, email verification) using a
 * single system-wide SMTP account, configured via env vars.
 *
 * This is deliberately separate from the per-organization SMTP settings in
 * Settings > Notification Channels: those are configured *by* an org owner
 * *after* they have an account, and campaign/notification email should be
 * traceable to that org's own sending identity. Auth emails have to work
 * before any of that exists (e.g. the very first user of a brand-new org),
 * so they go out from the platform's own address instead.
 *
 * If SYSTEM_SMTP_* isn't configured (e.g. local dev), this logs the link to
 * the console instead of failing the request — so registration/reset still
 * works end-to-end without real SMTP creds, you just copy the link from
 * the backend logs.
 */
@Injectable()
export class TransactionalEmailService {
  private readonly logger = new Logger(TransactionalEmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailSender: EmailSenderService,
  ) {}

  private isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SYSTEM_SMTP_HOST') &&
        this.config.get<string>('SYSTEM_SMTP_USER') &&
        this.config.get<string>('SYSTEM_SMTP_PASSWORD'),
    );
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const subject = 'Reset your password';
    const text = `We received a request to reset your password.\n\nReset it here (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`;

    if (!this.isConfigured()) {
      this.logger.warn(`SYSTEM_SMTP not configured — password reset link for ${to}: ${resetUrl}`);
      return;
    }

    const sent = await this.emailSender.send({
      host: this.config.get<string>('SYSTEM_SMTP_HOST') as string,
      port: Number(this.config.get<string>('SYSTEM_SMTP_PORT') ?? 587),
      user: this.config.get<string>('SYSTEM_SMTP_USER') as string,
      password: this.config.get<string>('SYSTEM_SMTP_PASSWORD') as string,
      from: this.config.get<string>('SYSTEM_SMTP_FROM') ?? 'no-reply@waplatform.local',
      to,
      subject,
      text,
    });

    if (!sent) {
      this.logger.warn(`Password reset email failed to send — link for ${to}: ${resetUrl}`);
    }
  }

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    const subject = 'Verify your email address';
    const text = `Confirm this is your email address to finish setting up your account:\n${verifyUrl}\n\nThis link expires in 24 hours.`;

    if (!this.isConfigured()) {
      this.logger.warn(`SYSTEM_SMTP not configured — email verification link for ${to}: ${verifyUrl}`);
      return;
    }

    const sent = await this.emailSender.send({
      host: this.config.get<string>('SYSTEM_SMTP_HOST') as string,
      port: Number(this.config.get<string>('SYSTEM_SMTP_PORT') ?? 587),
      user: this.config.get<string>('SYSTEM_SMTP_USER') as string,
      password: this.config.get<string>('SYSTEM_SMTP_PASSWORD') as string,
      from: this.config.get<string>('SYSTEM_SMTP_FROM') ?? 'no-reply@waplatform.local',
      to,
      subject,
      text,
    });

    if (!sent) {
      this.logger.warn(`Email verification failed to send — link for ${to}: ${verifyUrl}`);
    }
  }
}
