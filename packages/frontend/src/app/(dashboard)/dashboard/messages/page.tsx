'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageSquare } from 'lucide-react';
import { GlassCard } from '@/components/glass';
import { useMessages } from '@/hooks/api/messages';

const STATUS_STYLES: Record<string, string> = {
  QUEUED: 'bg-amber/10 text-amber',
  SENT: 'bg-electric/10 text-electric',
  DELIVERED: 'bg-emerald/10 text-emerald',
  READ: 'bg-emerald/10 text-emerald',
  FAILED: 'bg-danger/10 text-danger',
};

const FILTERS = [
  { label: 'All', value: undefined },
  { label: 'Sent', value: 'SENT' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Read', value: 'READ' },
  { label: 'Failed', value: 'FAILED' },
];

export default function MessagesPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { data, isLoading } = useMessages(status);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Messages</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Every message sent and received through your connected WhatsApp account.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatus(f.value)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
              status === f.value
                ? 'bg-electric text-white'
                : 'bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <GlassCard variant="lite" padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-deep-navy/50 dark:border-white/10 dark:text-white/40">
                <th className="px-4 py-3 font-medium" />
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/40">
                    Loading messages…
                  </td>
                </tr>
              )}
              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-deep-navy/40 dark:text-white/40">
                    <MessageSquare className="mx-auto mb-2 opacity-30" size={24} />
                    No messages yet — they&apos;ll show up here once campaigns, schedules, or automations send something.
                  </td>
                </tr>
              )}
              {data?.items.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">
                    {m.direction === 'OUTBOUND' ? (
                      <ArrowUpRight size={14} className="text-electric" />
                    ) : (
                      <ArrowDownLeft size={14} className="text-emerald" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-deep-navy dark:text-white">
                    {m.contact.firstName || m.contact.lastName
                      ? `${m.contact.firstName ?? ''} ${m.contact.lastName ?? ''}`.trim()
                      : m.contact.phoneNumber}
                  </td>
                  <td className="px-4 py-3 text-deep-navy/60 dark:text-white/50">{m.type}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[m.status]}`}>
                      {m.status.toLowerCase()}
                    </span>
                    {m.errorMessage && (
                      <p className="mt-0.5 text-[11px] text-danger">{m.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-deep-navy/40 dark:text-white/30">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
