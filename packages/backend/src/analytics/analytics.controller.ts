import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.overview(user.organizationId);
  }

  @Get('message-volume')
  messageVolume(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.analyticsService.messageVolume(user.organizationId, days ? Number(days) : undefined);
  }

  @Get('campaign-performance')
  campaignPerformance(@CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.campaignPerformance(user.organizationId);
  }

  @Get('message-volume.csv')
  async messageVolumeCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.analyticsService.messageVolumeCsv(
      user.organizationId,
      days ? Number(days) : undefined,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="message-volume.csv"');
    res.send(csv);
  }

  @Get('report.pdf')
  async reportPdf(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const pdf = await this.analyticsService.buildPdfReport(user.organizationId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics-report.pdf"');
    res.send(pdf);
  }
}
