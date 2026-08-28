import { IsOptional, IsString } from 'class-validator';

export class AssignConversationDto {
  /** A user id within the same organization, or omitted/null to unassign. */
  @IsOptional()
  @IsString()
  userId?: string | null;
}
