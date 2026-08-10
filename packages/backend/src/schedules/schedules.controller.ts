import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { SCHEDULE_STATUS } from '../common/constants/prisma-enums.constants';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.schedulesService.list(user.organizationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.schedulesService.findOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateScheduleDto) {
    return this.schedulesService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedulesService.update(user.organizationId, id, dto);
  }

  @Post(':id/pause')
  pause(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.schedulesService.setStatus(user.organizationId, id, SCHEDULE_STATUS.PAUSED);
  }

  @Post(':id/resume')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.schedulesService.setStatus(user.organizationId, id, SCHEDULE_STATUS.ACTIVE);
  }

  @Post(':id/disable')
  disable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.schedulesService.setStatus(user.organizationId, id, SCHEDULE_STATUS.DISABLED);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.schedulesService.duplicate(user.organizationId, id);
  }

  @Patch(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { nextRunAt: string },
  ) {
    return this.schedulesService.rescheduleNextRun(user.organizationId, id, new Date(body.nextRunAt));
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.schedulesService.remove(user.organizationId, id);
  }
}
