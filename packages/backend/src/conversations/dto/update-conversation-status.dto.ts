import { IsIn } from 'class-validator';
import { CONVERSATION_STATUS } from '../../common/constants/prisma-enums.constants';

export class UpdateConversationStatusDto {
  @IsIn(Object.values(CONVERSATION_STATUS))
  status!: (typeof CONVERSATION_STATUS)[keyof typeof CONVERSATION_STATUS];
}
