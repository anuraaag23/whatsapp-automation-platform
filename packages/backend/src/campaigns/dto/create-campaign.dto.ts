import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import type { AudienceType, CampaignType } from '@prisma/client';
import { AUDIENCE_TYPES, CAMPAIGN_TYPES } from '../../common/constants/prisma-enums.constants';

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsIn(CAMPAIGN_TYPES)
  type!: CampaignType;

  @IsOptional() @IsString() templateId?: string;

  @IsIn(AUDIENCE_TYPES)
  audienceType!: AudienceType;

  @IsObject()
  audienceRef!: Record<string, unknown>;

  @IsOptional() @IsString() scheduledAt?: string;
}
