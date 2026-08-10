import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramSenderService {
  private readonly logger = new Logger(TelegramSenderService.name);

  async send(botToken: string, chatId: string, title: string, body: string): Promise<boolean> {
    try {
      await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        { chat_id: chatId, text: `*${title}*\n${body}`, parse_mode: 'Markdown' },
        { timeout: 5000 },
      );
      return true;
    } catch (error) {
      this.logger.warn(`Telegram delivery failed: ${(error as Error).message}`);
      return false;
    }
  }
}
