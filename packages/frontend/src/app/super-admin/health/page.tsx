'use client';

import { Database, Server, ListChecks, Webhook, Cpu } from 'lucide-react';
import { GlassCard } from '@/components/glass';
import { useSuperAdminHealth } from '@/hooks/api/super-admin';

function Row({
  icon,
  label,
  status,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  status: 'healthy' | 'degraded' | 'down';
  detail?: string;
}) {
  const styles = {
    healthy: 'bg-emerald/10 text-emerald',
    degraded: 'bg-amber/10 text-amber',
    down: 'bg-danger/10 text-danger',
  } as const;

  return (
    <div className="flex items-center justify-between border-b border-black/5 py-3 last:border-0 dark:border-white/5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/50">
          {icon}
        </div>
        <span className="text-sm font-medium text-deep-navy dark:text-white">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {detail && <span className="text-xs text-deep-navy/50 dark:text-white/40">{detail}</span>}
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

export default function SuperAdminHealthPage() {
  const { data, isLoading, isError, dataUpdatedAt } = useSuperAdminHealth();

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Health Monitoring</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Live infrastructure status, refreshed every 15 seconds
          {dataUpdatedAt ? ` · last checked ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}.
        </p>
      </div>

      {isError && (
        <GlassCard variant="lite">
          <p className="text-sm text-danger">Couldn&apos;t reach the health endpoint.</p>
        </GlassCard>
      )}

      <GlassCard variant="lite" padded>
        {isLoading ? (
          <p className="py-4 text-sm text-deep-navy/40 dark:text-white/30">Checking services…</p>
        ) : (
          <>
            <Row icon={<Cpu size={16} />} label="Backend" status={data?.backend.status ?? 'down'} />
            <Row
              icon={<Database size={16} />}
              label="Database"
              status={data?.database.status ?? 'down'}
              detail={data?.database.latencyMs != null ? `${data.database.latencyMs}ms` : undefined}
            />
            <Row
              icon={<Server size={16} />}
              label="Redis"
              status={data?.redis.status ?? 'down'}
              detail={data?.redis.latencyMs != null ? `${data.redis.latencyMs}ms` : undefined}
            />
            <Row
              icon={<ListChecks size={16} />}
              label="Message queue"
              status={data?.queue.status ?? 'down'}
              detail={`${(data?.queue.waiting ?? 0) + (data?.queue.active ?? 0) + (data?.queue.delayed ?? 0)} jobs, ${data?.queue.failed ?? 0} failed`}
            />
            <Row
              icon={<Webhook size={16} />}
              label="WhatsApp webhooks"
              status={data?.whatsappWebhooks.lastInboundMessageAt ? 'healthy' : 'degraded'}
              detail={
                data?.whatsappWebhooks.lastInboundMessageAt
                  ? `Last inbound message: ${new Date(data.whatsappWebhooks.lastInboundMessageAt).toLocaleString()}`
                  : 'No inbound messages recorded yet'
              }
            />
          </>
        )}
      </GlassCard>

      <GlassCard variant="lite" title="Not yet monitored here" subtitle="Honest gaps, not silently omitted">
        <p className="text-sm text-deep-navy/60 dark:text-white/50">
          Email/SMTP delivery health isn&apos;t wired into this page yet — there&apos;s no dedicated SMTP health
          check in the backend to surface. The existing infra checks above (DB, Redis, queue, backend) reuse the
          same primitives as the app&apos;s own <code className="rounded bg-black/5 px-1 dark:bg-white/10">/health</code>{' '}
          endpoint.
        </p>
      </GlassCard>
    </div>
  );
}
