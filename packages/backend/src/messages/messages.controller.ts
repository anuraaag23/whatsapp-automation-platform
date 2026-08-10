import { Controller, Get, Query } from '@nestjs/common';
import type { MessageStatus } from '@prisma/client';
import { MessagesService } from './messages.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: MessageStatus,
    @Query('contactId') contactId?: string,
    @Query('campaignId') campaignId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.messagesService.list(user.organizationId, {
      status,
      contactId,
      campaignId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
