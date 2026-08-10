import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import type { TemplateCategory, HeaderType } from '@prisma/client';
import { TEMPLATE_CATEGORIES, HEADER_TYPES } from '../../common/constants/prisma-enums.constants';

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsIn(TEMPLATE_CATEGORIES)
  category!: TemplateCategory;

  @IsString()
  language!: string;

  @IsString()
  bodyText!: string;

  @IsOptional() @IsIn(HEADER_TYPES) headerType?: HeaderType;
  @IsOptional() @IsString() headerContent?: string;
  @IsOptional() @IsString() footerText?: string;
  @IsOptional() @IsArray() buttons?: Record<string, unknown>[];
  @IsOptional() @IsArray() @IsString({ each: true }) variables?: string[];
}
