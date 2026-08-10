import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import type { AutomationTriggerType } from '@prisma/client';
import { AUTOMATION_TRIGGER_TYPES } from '../../common/constants/prisma-enums.constants';

export class CreateAutomationDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() description?: string;

  @IsIn(AUTOMATION_TRIGGER_TYPES)
  triggerType!: AutomationTriggerType;

  @IsObject()
  graph!: { nodes: unknown[]; edges: unknown[] };
}
