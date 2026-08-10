import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AiService } from './ai.service';

class AiRequestDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  extra?: string;
}

class TranslateDto extends AiRequestDto {
  @IsString()
  targetLanguage!: string;
}

class ToneDto extends AiRequestDto {
  @IsIn(['formal', 'friendly', 'urgent', 'casual', 'professional'])
  tone!: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate')
  generate(@Body() dto: AiRequestDto) {
    return this.aiService.run('generate', dto.text, dto.extra).then((result) => ({ result }));
  }

  @Post('rewrite')
  rewrite(@Body() dto: AiRequestDto) {
    return this.aiService.run('rewrite', dto.text, dto.extra).then((result) => ({ result }));
  }

  @Post('translate')
  translate(@Body() dto: TranslateDto) {
    return this.aiService
      .run('translate', dto.text, `Target language: ${dto.targetLanguage}`)
      .then((result) => ({ result }));
  }

  @Post('fix-grammar')
  fixGrammar(@Body() dto: AiRequestDto) {
    return this.aiService.run('fix_grammar', dto.text).then((result) => ({ result }));
  }

  @Post('adjust-tone')
  adjustTone(@Body() dto: ToneDto) {
    return this.aiService
      .run('adjust_tone', dto.text, `Target tone: ${dto.tone}`)
      .then((result) => ({ result }));
  }

  @Post('summarize')
  summarize(@Body() dto: AiRequestDto) {
    return this.aiService.run('summarize', dto.text).then((result) => ({ result }));
  }
}
