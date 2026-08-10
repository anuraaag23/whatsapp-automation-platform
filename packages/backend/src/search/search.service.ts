import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SearchResult {
  type: 'contact' | 'campaign' | 'template' | 'schedule';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(organizationId: string, query: string): Promise<SearchResult[]> {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim();

    const [contacts, campaigns, templates, schedules] = await Promise.all([
      this.prisma.contact.findMany({
        where: {
          organizationId,
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { phoneNumber: { contains: q } },
            { company: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),
      this.prisma.campaign.findMany({
        where: { organizationId, name: { contains: q, mode: 'insensitive' } },
        take: 5,
      }),
      this.prisma.messageTemplate.findMany({
        where: { organizationId, name: { contains: q, mode: 'insensitive' } },
        take: 5,
      }),
      this.prisma.schedule.findMany({
        where: { organizationId, name: { contains: q, mode: 'insensitive' } },
        take: 5,
      }),
    ]);

    return [
      ...contacts.map((c: any): SearchResult => ({
        type: 'contact',
        id: c.id,
        title: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.phoneNumber,
        subtitle: c.phoneNumber,
        href: `/dashboard/contacts?id=${c.id}`,
      })),
      ...campaigns.map((c: any): SearchResult => ({
        type: 'campaign',
        id: c.id,
        title: c.name,
        subtitle: `Campaign · ${c.status.toLowerCase()}`,
        href: `/dashboard/campaigns?id=${c.id}`,
      })),
      ...templates.map((t: any): SearchResult => ({
        type: 'template',
        id: t.id,
        title: t.name,
        subtitle: `Template · ${t.waStatus.toLowerCase()}`,
        href: `/dashboard/templates?id=${t.id}`,
      })),
      ...schedules.map((s: any): SearchResult => ({
        type: 'schedule',
        id: s.id,
        title: s.name,
        subtitle: `Schedule · ${s.status.toLowerCase()}`,
        href: `/dashboard/schedules?id=${s.id}`,
      })),
    ];
  }
}
