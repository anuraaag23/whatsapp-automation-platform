import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AUTOMATION_STATUS } from '../common/constants/prisma-enums.constants';
import { AutomationsService } from './automations.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('automations')
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.automationsService.list(user.organizationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.automationsService.findOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAutomationDto) {
    return this.automationsService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
  ) {
    return this.automationsService.update(user.organizationId, id, dto);
  }

  @Post(':id/activate')
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.automationsService.setStatus(user.organizationId, id, AUTOMATION_STATUS.ACTIVE);
  }

  @Post(':id/pause')
  pause(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.automationsService.setStatus(user.organizationId, id, AUTOMATION_STATUS.PAUSED);
  }

  @Post(':id/run')
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { contactId: string },
  ) {
    return this.automationsService.runManually(user.organizationId, id, body.contactId);
  }

  @Get(':id/runs')
  listRuns(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.automationsService.listRuns(user.organizationId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.automationsService.remove(user.organizationId, id);
  }
}
