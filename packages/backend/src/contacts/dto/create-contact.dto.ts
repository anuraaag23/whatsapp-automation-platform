import { IsArray, IsBoolean, IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phoneNumber must be a valid E.164 phone number' })
  phoneNumber!: string;

  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isFavorite?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tagIds?: string[];
}
