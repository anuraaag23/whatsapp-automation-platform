'use client';

import {
  Building2,
  Users,
  MessageCircle,
  Send,
  Inbox,
  Workflow,
  ListChecks,
  Database,
  Server,
} from 'lucide-react';
import { GlassCard } from '@/components/glass';
import { useSuperAdminOverview } from '@/hooks/api/super-admin';

function StatusPill({ status }: { status: 'healthy' | 'down' | 'degraded' }) {
  const styles = {
    healthy: 'bg-emerald/10 text-emerald',
    degraded: 'bg-amber/10 text-amber',
    down: 'bg-danger/10 text-danger',
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

export default function SuperAdminOverviewPage() {
  const { data, isLoading, isError } = useSuperAdminOverview();

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Platform Overview</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Live, platform-wide numbers across every organization.
        </p>
      </div>

      {isError && (
        <GlassCard variant="lite">
          <p className="text-sm text-danger">Couldn&apos;t load platform stats. Try refreshing.</p>
        </GlassCard>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <GlassCard variant="lite" padded className="flex flex-col gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 text-electric dark:bg-white/10">
            <Building2 size={18} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-deep-navy dark:text-white">
              {isLoading ? '—' : data?.organizations.total ?? 0}
            </p>
            <p className="text-xs text-deep-navy/60 dark:text-white/60">
              Organizations ({isLoading ? '—' : data?.organizations.active ?? 0} active,{' '}
              {isLoading ? '—' : data?.organizations.suspended ?? 0} suspended)
            </p>
          </div>
        </GlassCard>

        <GlassCard variant="lite" padded className="flex flex-col gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 text-electric dark:bg-white/10">
            <Users size={18} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-deep-navy dark:text-white">
              {isLoading ? '—' : data?.users.total ?? 0}
            </p>
            <p className="text-xs text-deep-navy/60 dark:text-white/60">
              Users ({isLoading ? '—' : data?.users.active ?? 0} active,{' '}
              {isLoading ? '—' : data?.users.verified ?? 0} verified)
            </p>
          </div>
        </GlassCard>

        <GlassCard variant="lite" padded className="flex flex-col gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 text-emerald dark:bg-white/10">
            <MessageCircle size={18} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-deep-navy dark:text-white">
              {isLoading ? '—' : data?.whatsappAccounts.connected ?? 0}
              <span className="text-base text-deep-navy/40 dark:text-white/30">
                {' '}
                / {isLoading ? '—' : data?.whatsappAccounts.total ?? 0}
              </span>
            </p>
            <p className="text-xs text-deep-navy/60 dark:text-white/60">WhatsApp accounts connected</p>
          </div>
        </GlassCard>

        <GlassCard variant="lite" padded className="flex flex-col gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 text-amber dark:bg-white/10">
            <Workflow size={18} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-deep-navy dark:text-white">
              {isLoading ? '—' : data?.automations.active ?? 0}
              <span className="text-base text-deep-navy/40 dark:text-white/30">
                {' '}
                / {isLoading ? '—' : data?.automations.total ?? 0}
              </span>
            </p>
            <p className="text-xs text-deep-navy/60 dark:text-white/60">Active automations</p>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard variant="lite" title="Message volume" subtitle="Sent / received, across all organizations">
          <div className="flex flex-col gap-3">
            {(
              [
                ['24 hours', data?.messages.last24h],
                ['7 days', data?.messages.last7d],
                ['30 days', data?.messages.last30d],
              ] as const
            ).map(([label, stats]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-deep-navy/60 dark:text-white/60">{label}</span>
                <span className="flex items-center gap-4 font-medium text-deep-navy dark:text-white">
                  <span className="flex items-center gap-1">
                    <Send size={13} className="text-electric" /> {isLoading ? '—' : stats?.sent ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Inbox size={13} className="text-emerald" /> {isLoading ? '—' : stats?.received ?? 0}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="lite" title="Automation runs" subtitle="Across all organizations">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-deep-navy/60 dark:text-white/60">Running</span>
              <span className="font-medium text-deep-navy dark:text-white">
                {isLoading ? '—' : data?.automations.runs.running ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-deep-navy/60 dark:text-white/60">Completed</span>
              <span className="font-medium text-emerald">{isLoading ? '—' : data?.automations.runs.completed ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-deep-navy/60 dark:text-white/60">Failed</span>
              <span className="font-medium text-danger">{isLoading ? '—' : data?.automations.runs.failed ?? 0}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard variant="lite" title="Platform health" subtitle="Backend infrastructure at a glance — full detail on the Health page">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-deep-navy/40 dark:text-white/30" />
            <div>
              <p className="text-xs text-deep-navy/60 dark:text-white/60">Database</p>
              {isLoading ? (
                <span className="text-xs text-deep-navy/40">—</span>
              ) : (
                <StatusPill status={data?.health.database.status ?? 'down'} />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Server size={16} className="text-deep-navy/40 dark:text-white/30" />
            <div>
              <p className="text-xs text-deep-navy/60 dark:text-white/60">Redis</p>
              {isLoading ? (
                <span className="text-xs text-deep-navy/40">—</span>
              ) : (
                <StatusPill status={data?.health.redis.status ?? 'down'} />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-deep-navy/40 dark:text-white/30" />
            <div>
              <p className="text-xs text-deep-navy/60 dark:text-white/60">Queue backlog</p>
              <p className="text-sm font-medium text-deep-navy dark:text-white">
                {isLoading ? '—' : (data?.queue.waiting ?? 0) + (data?.queue.delayed ?? 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-danger" />
            <div>
              <p className="text-xs text-deep-navy/60 dark:text-white/60">Failed jobs</p>
              <p className="text-sm font-medium text-danger">{isLoading ? '—' : data?.queue.failed ?? 0}</p>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
