'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { Download, Users, MessageSquare, Megaphone, UserCheck } from 'lucide-react';
import { GlassCard, GlassButton } from '@/components/glass';
import { useMessageVolume, useCampaignPerformance, useAnalyticsOverview } from '@/hooks/api/analytics';

// Recharts' default <Tooltip> renders a plain white box with black text —
// fine on a light dashboard, but it doesn't pick up this app's dark Liquid
// Glass theme at all, so it shows up as a jarring opaque white card. Same
// story for the Bar chart's hover cursor, which defaults to solid light
// gray. These match the app's existing glass-panel look instead.
const chartTooltipStyle = {
  contentStyle: {
    background: 'rgba(11, 14, 26, 0.92)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 12,
    backdropFilter: 'blur(12px)',
  },
  labelStyle: { color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  itemStyle: { padding: 0 },
};
const axisTick = { fontSize: 11, fill: 'currentColor' };
const axisTickClassName = 'text-deep-navy/50 dark:text-white/40';

export default function AnalyticsPage() {
  const { data: volume, isLoading: volumeLoading } = useMessageVolume(14);
  const { data: campaigns } = useCampaignPerformance();
  const { data: overview } = useAnalyticsOverview();

  // Relative by default (same-origin), proxied server-side to the backend
  // by the Next.js rewrite — see api-client.ts for why.
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Analytics</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Message volume, delivery performance, and campaign results.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`${apiBase}/api/v1/analytics/message-volume.csv`} target="_blank" rel="noreferrer">
            <GlassButton variant="secondary" icon={<Download size={16} />}>
              CSV
            </GlassButton>
          </a>
          <a href={`${apiBase}/api/v1/analytics/report.pdf`} target="_blank" rel="noreferrer">
            <GlassButton variant="secondary" icon={<Download size={16} />}>
              PDF Report
            </GlassButton>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Contacts', value: overview?.totalContacts, icon: <Users size={16} /> },
          { label: 'Opted In', value: overview?.optedIn, icon: <UserCheck size={16} /> },
          { label: 'Messages Sent', value: overview?.totalMessages, icon: <MessageSquare size={16} /> },
          { label: 'Campaigns', value: overview?.totalCampaigns, icon: <Megaphone size={16} /> },
        ].map((stat) => (
          <GlassCard key={stat.label} variant="lite" className="flex flex-col gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric/10 text-electric">
              {stat.icon}
            </div>
            <p className="text-xl font-semibold text-deep-navy dark:text-white">{stat.value ?? '—'}</p>
            <p className="text-xs text-deep-navy/50 dark:text-white/40">{stat.label}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard variant="lite" title="Message Volume" subtitle="Last 14 days">
        {volumeLoading ? (
          <p className="py-12 text-center text-sm text-deep-navy/40 dark:text-white/30">Loading…</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={volume}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-black/5 dark:text-white/10" />
              <XAxis dataKey="date" tick={axisTick} className={axisTickClassName} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={axisTick} className={axisTickClassName} allowDecimals={false} />
              <Tooltip {...chartTooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="sent" stroke="#0A84FF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="delivered" stroke="#30D158" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="read" stroke="#FF9F0A" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="failed" stroke="#FF453A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </GlassCard>

      <GlassCard variant="lite" title="Campaign Performance">
        {!campaigns || campaigns.length === 0 ? (
          <p className="py-8 text-center text-sm text-deep-navy/40 dark:text-white/30">
            No running or completed campaigns yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={campaigns}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-black/5 dark:text-white/10" />
              <XAxis dataKey="name" tick={axisTick} className={axisTickClassName} />
              <YAxis tick={axisTick} className={axisTickClassName} allowDecimals={false} />
              <Tooltip {...chartTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
              <Legend />
              <Bar dataKey="sent" fill="#0A84FF" radius={[6, 6, 0, 0]} />
              <Bar dataKey="delivered" fill="#30D158" radius={[6, 6, 0, 0]} />
              <Bar dataKey="failed" fill="#FF453A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </GlassCard>
    </div>
  );
}
