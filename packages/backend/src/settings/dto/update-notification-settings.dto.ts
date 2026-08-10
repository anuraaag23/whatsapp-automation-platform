import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() smtpPort?: number;
  @IsOptional() @IsString() smtpUser?: string;
  @IsOptional() @IsString() smtpPassword?: string;
  @IsOptional() @IsString() smtpFromAddress?: string;
  @IsOptional() @IsString() notifyEmailTo?: string;

  @IsOptional() @IsBoolean() slackEnabled?: boolean;
  @IsOptional() @IsString() slackWebhookUrl?: string;

  @IsOptional() @IsBoolean() telegramEnabled?: boolean;
  @IsOptional() @IsString() telegramBotToken?: string;
  @IsOptional() @IsString() telegramChatId?: string;
}
