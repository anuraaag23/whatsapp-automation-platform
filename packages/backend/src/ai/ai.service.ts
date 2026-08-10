import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type AiAction = 'generate' | 'rewrite' | 'translate' | 'fix_grammar' | 'adjust_tone' | 'summarize';

const SYSTEM_PROMPTS: Record<AiAction, string> = {
  generate:
    'You write short, warm WhatsApp business messages. Keep it under 300 characters unless asked otherwise. Return only the message text, no quotes or preamble.',
  rewrite: 'Rewrite the given WhatsApp message to be clearer and more engaging while preserving its meaning and any {{variables}}. Return only the rewritten text.',
  translate: 'Translate the given WhatsApp message into the requested language, preserving any {{variables}} exactly as written. Return only the translated text.',
  fix_grammar: 'Fix grammar and spelling in the given text without changing its meaning or tone. Return only the corrected text.',
  adjust_tone: 'Rewrite the given text in the requested tone (e.g. formal, friendly, urgent) while preserving meaning and any {{variables}}. Return only the rewritten text.',
  summarize: 'Summarize the given customer reply in one short sentence for a support agent. Return only the summary.',
};

@Injectable()
export class AiService {
  constructor(private readonly config: ConfigService) {}

  async run(action: AiAction, input: string, extra?: string): Promise<string> {
    const apiKey = this.config.get<string>('AI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI features require AI_API_KEY to be configured (any OpenAI-compatible provider). Set it in .env to enable this.',
      );
    }

    const baseUrl = this.config.get<string>('AI_API_BASE_URL') ?? 'https://api.openai.com/v1';
    const model = this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini';

    const userPrompt = extra ? `${input}\n\n(Additional instruction: ${extra})` : input;

    const { data } = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[action] },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
      },
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
