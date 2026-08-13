import { IsIn, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';

export class SendMessageDto {
  @IsString()
  contactId!: string;

  @IsIn(['TEXT', 'IMAGE'])
  type!: 'TEXT' | 'IMAGE';

  @ValidateIf((o) => o.type === 'TEXT')
  @IsString()
  body?: string;

  // WhatsApp's Cloud API accepts a public image URL directly (no separate
  // upload step needed) — see WhatsappClient.sendMedia / the `link` field.
  @ValidateIf((o) => o.type === 'IMAGE')
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  caption?: string;
}
