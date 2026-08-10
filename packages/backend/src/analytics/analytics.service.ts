import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Daily outbound message volume for the last N days, split by status. */
  async messageVolume(organizationId: string, days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const messages = await this.prisma.message.findMany({
      where: { organizationId, direction: 'OUTBOUND', createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    });

    const byDay = new Map<string, { date: string; sent: number; delivered: number; read: number; failed: number }>();

    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { date: key, sent: 0, delivered: 0, read: 0, failed: 0 });
    }

    for (const msg of messages) {
      const key = msg.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (!bucket) continue;
      if (msg.status === 'SENT') bucket.sent++;
      if (msg.status === 'DELIVERED') bucket.delivered++;
      if (msg.status === 'READ') bucket.read++;
      if (msg.status === 'FAILED') bucket.failed++;
    }

    return Array.from(byDay.values());
  }

  /**
   * Live per-campaign send/delivery/failure counts, computed directly from
   * Message records — same source of truth messageVolume() already uses.
   * Campaign.stats (a cached JSON column) is never actually written to
   * anywhere outside a migration default, so reading it here always
   * returned flat zeros regardless of what actually happened. This
   * replaces it with a real aggregation instead of trying to keep a cache
   * column in sync (simpler, and can't drift out of sync with reality).
   */
  async campaignPerformance(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId, status: { in: ['RUNNING', 'COMPLETED', 'PAUSED'] } },
      select: { id: true, name: true, _count: { select: { recipients: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (campaigns.length === 0) return [];

    const campaignIds = campaigns.map((c) => c.id);
    const grouped = await this.prisma.message.groupBy({
      by: ['campaignId', 'status'],
      where: { organizationId, campaignId: { in: campaignIds } },
      _count: { _all: true },
    });

    const countsByCampaign = new Map<string, Record<string, number>>();
    for (const row of grouped) {
      if (!row.campaignId) continue;
      const entry = countsByCampaign.get(row.campaignId) ?? {};
      entry[row.status] = row._count._all;
      countsByCampaign.set(row.campaignId, entry);
    }

    return campaigns.map((c) => {
      const counts = countsByCampaign.get(c.id) ?? {};
      const sent = (counts.SENT ?? 0) + (counts.DELIVERED ?? 0) + (counts.READ ?? 0);
      const delivered = (counts.DELIVERED ?? 0) + (counts.READ ?? 0);
      const read = counts.READ ?? 0;
      const failed = counts.FAILED ?? 0;
      const recipients = c._count.recipients || 1;
      return {
        id: c.id,
        name: c.name,
        recipients: c._count.recipients,
        sent,
        delivered,
        read,
        failed,
        deliveryRate: Math.round((delivered / recipients) * 100),
        readRate: Math.round((read / recipients) * 100),
      };
    });
  }

  async overview(organizationId: string) {
    const [totalContacts, optedIn, totalMessages, totalCampaigns] = await Promise.all([
      this.prisma.contact.count({ where: { organizationId, isArchived: false } }),
      this.prisma.contact.count({ where: { organizationId, optInStatus: 'OPTED_IN' } }),
      this.prisma.message.count({ where: { organizationId, direction: 'OUTBOUND' } }),
      this.prisma.campaign.count({ where: { organizationId } }),
    ]);

    return { totalContacts, optedIn, totalMessages, totalCampaigns };
  }

  /** Renders message volume as CSV for the CSV Export requirement. */
  async messageVolumeCsv(organizationId: string, days = 14): Promise<string> {
    const rows = await this.messageVolume(organizationId, days);
    const header = 'date,sent,delivered,read,failed';
    const lines = rows.map((r) => `${r.date},${r.sent},${r.delivered},${r.read},${r.failed}`);
    return [header, ...lines].join('\n');
  }

  /** Renders a one-page PDF summary report (overview + message volume + campaign performance). */
  async buildPdfReport(organizationId: string): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default;
    const [overview, volume, campaigns] = await Promise.all([
      this.overview(organizationId),
      this.messageVolume(organizationId, 14),
      this.campaignPerformance(organizationId),
    ]);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Analytics Report', { align: 'left' });
      doc.fontSize(10).fillColor('#666').text(new Date().toLocaleString());
      doc.moveDown(1.5);

      doc.fontSize(14).fillColor('#000').text('Overview');
      doc.fontSize(10).fillColor('#333');
      doc.text(`Total contacts: ${overview.totalContacts}`);
      doc.text(`Opted-in contacts: ${overview.optedIn}`);
      doc.text(`Messages sent (all time): ${overview.totalMessages}`);
      doc.text(`Total campaigns: ${overview.totalCampaigns}`);
      doc.moveDown(1.5);

      doc.fontSize(14).fillColor('#000').text('Message Volume — Last 14 Days');
      doc.fontSize(9).fillColor('#333');
      for (const row of volume) {
        doc.text(`${row.date}   sent ${row.sent}   delivered ${row.delivered}   read ${row.read}   failed ${row.failed}`);
      }
      doc.moveDown(1.5);

      doc.fontSize(14).fillColor('#000').text('Campaign Performance');
      doc.fontSize(9).fillColor('#333');
      if (campaigns.length === 0) {
        doc.text('No running or completed campaigns yet.');
      }
      for (const c of campaigns) {
        doc.text(`${c.name} — ${c.recipients} recipients, ${c.deliveryRate}% delivered, ${c.readRate}% read`);
      }

      doc.end();
    });
  }
}
