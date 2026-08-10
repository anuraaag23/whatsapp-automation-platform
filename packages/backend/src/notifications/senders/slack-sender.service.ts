import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SlackSenderService {
  private readonly logger = new Logger(SlackSenderService.name);

  async send(webhookUrl: string, title: string, body: string): Promise<boolean> {
    try {
      await axios.post(
        webhookUrl,
        { text: `*${title}*\n${body}` },
        { timeout: 5000 },
      );
      return true;
    } catch (error) {
      this.logger.warn(`Slack delivery failed: ${(error as Error).message}`);
      return false;
    }
  }
}
