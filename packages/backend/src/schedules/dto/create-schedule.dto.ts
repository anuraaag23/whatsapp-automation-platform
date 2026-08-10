import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import type { RecurrenceType, AudienceType } from '@prisma/client';
import { RECURRENCE_TYPES, AUDIENCE_TYPES } from '../../common/constants/prisma-enums.constants';

export class CreateScheduleDto {
  @IsString()
  name!: string;

  @IsIn(RECURRENCE_TYPES)
  recurrenceType!: RecurrenceType;

  @IsOptional() @IsString() cronExpression?: string;
  @IsOptional() @IsInt() @Min(1) intervalHours?: number;
  @IsOptional() @IsInt() @Min(1) intervalDays?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) daysOfWeek?: number[];

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'timeOfDay must be HH:MM (24h)' })
  timeOfDay?: string;

  @IsOptional() @IsString() timezone?: string;

  @IsOptional() @IsBoolean() randomTimeEnabled?: boolean;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) randomWindowStart?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) randomWindowEnd?: string;
  @IsOptional() @IsInt() @Min(0) randomMinGapMinutes?: number;
  @IsOptional() @IsInt() @Min(0) randomMaxGapMinutes?: number;
  @IsOptional() @IsBoolean() avoidSameTimeAsLast?: boolean;

  /** Pool of candidate message bodies; one is chosen at random per send. */
  @IsOptional() @IsArray() @IsString({ each: true }) messagePool?: string[];
  @IsOptional() @IsString() templateId?: string;

  @IsIn(AUDIENCE_TYPES)
  audienceType!: AudienceType;

  @IsObject()
  audienceRef!: Record<string, unknown>;

  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() expiryDate?: string;
}
