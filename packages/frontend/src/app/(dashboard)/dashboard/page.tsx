'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Send,
  CheckCheck,
  Eye,
  XCircle,
  Megaphone,
  Workflow,
  Clock,
} from 'lucide-react';
import { GlassCard } from '@/components/glass';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

interface DashboardStats {
  scheduledToday: number;
  upcoming: number;
  sentToday: number;
  delivered: number;
  read: number;
  failed: number;
  activeCampaigns: number;
  activeAutomations: number;
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  // Backed by future /dashboard/stats aggregate endpoint (messages, campaigns,
  // schedules). Wired through React Query now so widgets swap to live data
  // with zero component changes once that endpoint ships.
  const { data } = await apiClient.get<DashboardStats>('/dashboard/stats');
  return data;
}

const WIDGETS: {
  key: keyof DashboardStats;
  label: string;
  icon: React.ReactNode;
  tone: string;
}[] = [
  { key: 'scheduledToday', label: "Scheduled Today", icon: <Clock size={18} />, tone: 'text-electric' },
  { key: 'upcoming', label: 'Upcoming', icon: <Clock size={18} />, tone: 'text-electric' },
  { key: 'sentToday', label: 'Sent Today', icon: <Send size={18} />, tone: 'text-electric' },
  { key: 'delivered', label: 'Delivered', icon: <CheckCheck size={18} />, tone: 'text-emerald' },
  { key: 'read', label: 'Read', icon: <Eye size={18} />, tone: 'text-emerald' },
  { key: 'failed', label: 'Failed', icon: <XCircle size={18} />, tone: 'text-danger' },
  { key: 'activeCampaigns', label: 'Active Campaigns', icon: <Megaphone size={18} />, tone: 'text-amber' },
  { key: 'activeAutomations', label: 'Active Automations', icon: <Workflow size={18} />, tone: 'text-amber' },
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    retry: false,
  });

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">
          {user ? `Welcome back, ${user.firstName}` : 'Welcome back'}
        </h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Here&apos;s what&apos;s happening across your workspace today.
        </p>
      </div>

      {isError && (
        <GlassCard variant="lite">
          <p className="text-sm text-deep-navy/70 dark:text-white/70">
            The dashboard aggregate endpoint (
            <code className="rounded bg-black/5 px-1 dark:bg-white/10">
              GET /api/v1/dashboard/stats
            </code>
            ) hasn&apos;t been implemented yet — this is the next module to build on
            top of the Messages, Campaigns, and Schedules services.
          </p>
        </GlassCard>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {WIDGETS.map((widget) => (
          <GlassCard key={widget.key} variant="lite" padded className="flex flex-col gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10 ${widget.tone}`}>
              {widget.icon}
            </div>
            <div>
              <p className="text-2xl font-semibold text-deep-navy dark:text-white">
                {isLoading ? '—' : data?.[widget.key] ?? 0}
              </p>
              <p className="text-xs text-deep-navy/60 dark:text-white/60">{widget.label}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GlassCard
          variant="lite"
          title="Recent Activity"
          subtitle="Latest events across your workspace"
          className="lg:col-span-2"
        >
          <p className="text-sm text-deep-navy/50 dark:text-white/40">
            Activity feed will populate once the Messages and Logs modules are connected.
          </p>
        </GlassCard>
        <GlassCard variant="lite" title="Quick Actions" subtitle="Jump back in">
          <div className="flex flex-col gap-2">
            {[
              { label: 'New Campaign', href: '/dashboard/campaigns' },
              { label: 'New Schedule', href: '/dashboard/schedules' },
              { label: 'Import Contacts', href: '/dashboard/contacts' },
              { label: 'New Automation', href: '/dashboard/automation' },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => router.push(action.href)}
                className="rounded-xl bg-black/5 px-3 py-2.5 text-left text-sm font-medium text-deep-navy/80 transition-colors hover:bg-black/10 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20"
              >
                {action.label}
              </button>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
