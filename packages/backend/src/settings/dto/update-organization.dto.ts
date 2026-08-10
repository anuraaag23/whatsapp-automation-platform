import { IsIn, IsOptional, IsString } from 'class-validator';
import type { Theme } from '@prisma/client';
import { THEMES } from '../../common/constants/prisma-enums.constants';

export class UpdateOrganizationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsIn(THEMES) theme?: Theme;
}
