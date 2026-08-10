import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { SegmentsService, SegmentRule } from './segments.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.segmentsService.list(user.organizationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.segmentsService.findOne(user.organizationId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { name: string; description?: string; rules: SegmentRule[] },
  ) {
    return this.segmentsService.create(user.organizationId, body.name, body.description, body.rules);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { name: string; description?: string; rules: SegmentRule[] },
  ) {
    return this.segmentsService.update(user.organizationId, id, body.name, body.description, body.rules);
  }

  @Post('preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Body() body: { rules: SegmentRule[] }) {
    return this.segmentsService
      .previewMatchCount(user.organizationId, body.rules)
      .then((count) => ({ matchCount: count }));
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.segmentsService.remove(user.organizationId, id);
  }
}
