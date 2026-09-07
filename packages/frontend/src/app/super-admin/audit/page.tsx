'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/glass';
import { useSuperAdminAudit } from '@/hooks/api/super-admin';

export default function SuperAdminAuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSuperAdminAudit({ page });

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Audit &amp; Security</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Every administrative action, across every organization — reuses the same audit log every org-level page
          already writes to.
        </p>
      </div>

      <GlassCard variant="lite" padded={false}>
        <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
          {isLoading && <p className="p-4 text-sm text-deep-navy/40 dark:text-white/30">Loading…</p>}
          {!isLoading && data?.entries.length === 0 && (
            <p className="p-4 text-sm text-deep-navy/40 dark:text-white/30">No audit events yet.</p>
          )}
          {data?.entries.map((entry: any) => (
            <div key={entry.id} className="flex flex-col gap-1 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-deep-navy dark:text-white">{entry.action}</span>
                <span className="text-xs text-deep-navy/40 dark:text-white/30">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-deep-navy/50 dark:text-white/40">
                {entry.user ? `${entry.user.firstName} ${entry.user.lastName} (${entry.user.email})` : 'System'}
                {entry.organization ? ` · ${entry.organization.name}` : ''}
                {entry.entityType ? ` · ${entry.entityType}${entry.entityId ? ` #${entry.entityId.slice(0, 8)}` : ''}` : ''}
              </p>
            </div>
          ))}
        </div>
      </GlassCard>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg bg-black/5 px-3 py-1.5 text-deep-navy/70 disabled:opacity-40 dark:bg-white/10 dark:text-white/60"
          >
            Previous
          </button>
          <span className="text-deep-navy/60 dark:text-white/50">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg bg-black/5 px-3 py-1.5 text-deep-navy/70 disabled:opacity-40 dark:bg-white/10 dark:text-white/60"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
