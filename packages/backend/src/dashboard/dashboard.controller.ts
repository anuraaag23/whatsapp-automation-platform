import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.stats(user.organizationId);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.recentActivity(user.organizationId);
  }
}
