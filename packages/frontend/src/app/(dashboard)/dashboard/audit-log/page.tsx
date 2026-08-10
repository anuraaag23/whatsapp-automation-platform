'use client';

import { useState } from 'react';
import { ScrollText, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { GlassCard, GlassButton, GlassSelect } from '@/components/glass';
import { useAuditLogs, useAuditLogFilterOptions } from '@/hooks/api/audit-logs';
import { useAuthStore } from '@/store/auth-store';

function StatusPill({ status }: { status: string }) {
  const ok = status === 'success';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        ok ? 'bg-emerald/10 text-emerald' : 'bg-danger/10 text-danger'
      }`}
    >
      {status}
    </span>
  );
}

export default function AuditLogPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canView = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: filterOptions } = useAuditLogFilterOptions();
  const { data, isLoading } = useAuditLogs({ action, entityType, from, to, page });

  if (!canView) {
    return (
      <GlassCard variant="lite" padded className="flex flex-col items-center gap-2 py-16 text-center">
        <ShieldAlert className="text-amber" size={28} />
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Only organization owners and admins can view the audit log.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center gap-2">
        <ScrollText size={22} className="text-deep-navy/60 dark:text-white/50" />
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Audit log</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Every recorded action across your organization — logins, config changes, sends, and more.
          </p>
        </div>
      </div>

      {/* Filters */}
      <GlassCard variant="lite" padded className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          Action
          <GlassSelect
            value={action}
            onChange={(value) => {
              setAction(value);
              setPage(1);
            }}
            placeholder="All actions"
            options={(filterOptions?.actions ?? []).map((a) => ({ value: a, label: a }))}
            className="w-40"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          Entity type
          <GlassSelect
            value={entityType}
            onChange={(value) => {
              setEntityType(value);
              setPage(1);
            }}
            placeholder="All types"
            options={(filterOptions?.entityTypes ?? []).map((t) => ({ value: t, label: t }))}
            className="w-40"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-white/40 bg-white/50 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/10"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-white/40 bg-white/50 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/10"
          />
        </label>

        {(action || entityType || from || to) && (
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() => {
              setAction('');
              setEntityType('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
          >
            Clear filters
          </GlassButton>
        )}
      </GlassCard>

      {/* Table */}
      <GlassCard variant="lite" padded={false} className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-deep-navy/50 dark:border-white/10 dark:text-white/40">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/40">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && data?.entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/40">
                  No audit log entries match these filters.
                </td>
              </tr>
            )}
            {data?.entries.map((entry) => (
              <tr key={entry.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="whitespace-nowrap px-4 py-3 text-deep-navy/70 dark:text-white/60">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-deep-navy/70 dark:text-white/70">
                  {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : '—'}
                </td>
                <td className="px-4 py-3 font-medium text-deep-navy dark:text-white">{entry.action}</td>
                <td className="px-4 py-3 text-deep-navy/60 dark:text-white/50">
                  {entry.entityType}
                  {entry.entityId ? ` (${entry.entityId.slice(0, 8)}…)` : ''}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={entry.status} />
                </td>
                <td className="px-4 py-3 text-deep-navy/50 dark:text-white/40">
                  {entry.ipAddress ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-deep-navy/60 dark:text-white/50">
          <span>
            Page {data.page} of {data.totalPages} — {data.total} total entries
          </span>
          <div className="flex gap-2">
            <GlassButton
              size="sm"
              variant="secondary"
              icon={<ChevronLeft size={14} />}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
            >
              Prev
            </GlassButton>
            <GlassButton
              size="sm"
              variant="secondary"
              icon={<ChevronRight size={14} />}
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, data.totalPages))}
            >
              Next
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
}
