import { Injectable } from '@nestjs/common';
import { MESSAGE_STATUS, CAMPAIGN_STATUS, AUTOMATION_STATUS } from '../common/constants/prisma-enums.constants';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(organizationId: string) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const [
      scheduledToday,
      upcoming,
      sentToday,
      delivered,
      read,
      failed,
      activeCampaigns,
      activeAutomations,
    ] = await Promise.all([
      this.prisma.schedule.count({
        where: { organizationId, nextRunAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.schedule.count({
        where: { organizationId, nextRunAt: { gte: endOfToday } },
      }),
      this.prisma.message.count({
        where: {
          organizationId,
          direction: 'OUTBOUND',
          createdAt: { gte: startOfToday, lt: endOfToday },
        },
      }),
      this.prisma.message.count({ where: { organizationId, status: MESSAGE_STATUS.DELIVERED } }),
      this.prisma.message.count({ where: { organizationId, status: MESSAGE_STATUS.READ } }),
      this.prisma.message.count({ where: { organizationId, status: MESSAGE_STATUS.FAILED } }),
      this.prisma.campaign.count({ where: { organizationId, status: CAMPAIGN_STATUS.RUNNING } }),
      this.prisma.automation.count({ where: { organizationId, status: AUTOMATION_STATUS.ACTIVE } }),
    ]);

    return {
      scheduledToday,
      upcoming,
      sentToday,
      delivered,
      read,
      failed,
      activeCampaigns,
      activeAutomations,
    };
  }

  async recentActivity(organizationId: string, take = 15) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { firstName: true, lastName: true } } },
    });
  }
}
