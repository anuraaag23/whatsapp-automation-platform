import { IsOptional, IsString } from 'class-validator';

export class ConnectWhatsappAccountDto {
  @IsString()
  businessAccountId!: string;

  @IsString()
  phoneNumberId!: string;

  @IsString()
  displayPhoneNumber!: string;

  @IsString()
  accessToken!: string;

  @IsOptional() @IsString() apiVersion?: string;
}
