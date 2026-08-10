import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface EmailSendParams {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);

  async send(params: EmailSendParams): Promise<boolean> {
    try {
      const transporter = nodemailer.createTransport({
        host: params.host,
        port: params.port,
        secure: params.port === 465,
        auth: { user: params.user, pass: params.password },
      });

      await transporter.sendMail({
        from: params.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
      });

      return true;
    } catch (error) {
      this.logger.warn(`Email delivery failed: ${(error as Error).message}`);
      return false;
    }
  }
}
