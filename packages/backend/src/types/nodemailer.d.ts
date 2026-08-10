declare module 'nodemailer' {
  export interface TransportAuth {
    user: string;
    pass: string;
  }

  export interface TransportOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth?: TransportAuth;
  }

  export interface MailOptions {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }

  export interface SentMessageInfo {
    messageId: string;
    accepted: string[];
    rejected: string[];
  }

  export interface Transporter {
    sendMail(options: MailOptions): Promise<SentMessageInfo>;
  }

  export function createTransport(options: TransportOptions): Transporter;
}
