'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw, Pencil } from 'lucide-react';
import { GlassCard, GlassButton } from '@/components/glass';
import {
  useSuperAdminOrganizationQuota,
  useSetOrganizationPlan,
  useSetQuotaOverride,
  useResetQuotaOverride,
  QUOTA_RESOURCE_LABELS,
  type QuotaResourceSummary,
} from '@/hooks/api/super-admin';

function StatusBadge({ status }: { status: QuotaResourceSummary['status'] }) {
  const styles: Record<QuotaResourceSummary['status'], string> = {
    ok: 'bg-emerald/10 text-emerald',
    warning: 'bg-amber/10 text-amber',
    exceeded: 'bg-danger/10 text-danger',
    unlimited: 'bg-electric/10 text-electric',
    untracked: 'bg-black/5 text-deep-navy/40 dark:bg-white/10 dark:text-white/30',
  };
  const labels: Record<QuotaResourceSummary['status'], string> = {
    ok: 'OK',
    warning: 'Near limit',
    exceeded: 'Exceeded',
    unlimited: 'Unlimited',
    untracked: 'Not tracked',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}

function QuotaRow({ organizationId, row }: { organizationId: string; row: QuotaResourceSummary }) {
  const [editing, setEditing] = useState(false);
  const [unlimited, setUnlimited] = useState(row.limit === null && row.source === 'override');
  const [value, setValue] = useState(row.limit !== null ? row.limit.toString() : '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const setOverride = useSetQuotaOverride(organizationId);
  const resetOverride = useResetQuotaOverride(organizationId);

  const untracked = row.status === 'untracked';

  function startEditing() {
    setUnlimited(row.limit === null && row.source === 'override');
    setValue(row.limit !== null ? row.limit.toString() : '');
    setValidationError(null);
    setEditing(true);
  }

  function save() {
    setValidationError(null);

    if (unlimited) {
      setOverride.mutate({ resource: row.resource, value: -1 }, { onSuccess: () => setEditing(false) });
      return;
    }

    // Mirrors the backend's SetQuotaOverrideDto rule exactly (whole
    // numbers, 0 or greater) so an invalid value never round-trips to the
    // server just to be told no — but the backend still re-checks this
    // itself; this is a UX convenience, not the actual security boundary.
    const trimmed = value.trim();
    if (trimmed === '') {
      setValidationError('Enter a limit, or turn on Unlimited above.');
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setValidationError('Must be a whole number of 0 or greater (or turn on Unlimited above).');
      return;
    }

    setOverride.mutate(
      { resource: row.resource, value: parsed },
      {
        onSuccess: () => setEditing(false),
        onError: (err: any) => setValidationError(err?.response?.data?.message ?? 'Could not save — please try again.'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2 border-b border-black/5 py-4 last:border-0 dark:border-white/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-deep-navy dark:text-white">{QUOTA_RESOURCE_LABELS[row.resource]}</p>
          <p className="text-xs text-deep-navy/50 dark:text-white/40">
            {untracked
              ? 'No usage tracking exists for this resource yet.'
              : row.limit === null
                ? 'Unlimited'
                : `${row.usage ?? 0} / ${row.limit} used (${row.source})`}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>

      {!untracked && row.limit !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div
            className={`h-full rounded-full ${row.status === 'exceeded' ? 'bg-danger' : row.status === 'warning' ? 'bg-amber' : 'bg-emerald'}`}
            style={{ width: `${Math.min(row.percentUsed ?? 0, 100)}%` }}
          />
        </div>
      )}

      {!untracked && (
        <div className="flex flex-col gap-2">
          {editing ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-deep-navy/70 dark:text-white/60">
                  <input
                    type="checkbox"
                    checked={unlimited}
                    onChange={(e) => {
                      setUnlimited(e.target.checked);
                      setValidationError(null);
                    }}
                    className="h-3.5 w-3.5 accent-electric"
                  />
                  Unlimited
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={value}
                  disabled={unlimited}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="e.g. 1000"
                  className="w-32 rounded-lg border-0 bg-black/5 px-2.5 py-1.5 text-sm text-deep-navy outline-none disabled:opacity-40 dark:bg-white/10 dark:text-white"
                />
                <GlassButton size="sm" variant="primary" loading={setOverride.isPending} onClick={save}>
                  Save
                </GlassButton>
                <GlassButton size="sm" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </GlassButton>
              </div>
              {validationError && <p className="text-xs text-danger">{validationError}</p>}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <GlassButton size="sm" variant="secondary" icon={<Pencil size={12} />} onClick={startEditing}>
                Override
              </GlassButton>
              {row.source === 'override' && (
                <GlassButton
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw size={12} />}
                  loading={resetOverride.isPending}
                  onClick={() => resetOverride.mutate(row.resource)}
                >
                  Reset to plan default
                </GlassButton>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SuperAdminOrganizationQuotaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useSuperAdminOrganizationQuota(params.id);
  const setPlan = useSetOrganizationPlan(params.id);

  if (isLoading) {
    return <p className="p-4 text-sm text-deep-navy/40 dark:text-white/30">Loading…</p>;
  }
  if (!data) {
    return <p className="p-4 text-sm text-danger">Organization not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <button
        onClick={() => router.push('/super-admin/limits')}
        className="flex w-fit items-center gap-1.5 text-sm text-deep-navy/60 hover:text-deep-navy dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft size={14} /> Back to Limits &amp; Quotas
      </button>

      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">{data.organization.name}</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">{data.organization.slug}</p>
      </div>

      <GlassCard variant="lite" title="Plan" subtitle="Sets the default limit for every resource below with no override">
        <select
          value={data.organization.planId ?? ''}
          onChange={(e) => setPlan.mutate(e.target.value || null)}
          disabled={setPlan.isPending}
          className="rounded-xl border-0 bg-black/5 px-3 py-2.5 text-sm text-deep-navy outline-none dark:bg-white/10 dark:text-white"
        >
          <option value="">No plan (unlimited on every resource)</option>
          {data.availablePlans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </GlassCard>

      <GlassCard variant="lite" title="Limits & usage" subtitle="Plan default, unless an organization-specific override is set">
        <div className="flex flex-col">
          {data.summary.map((row) => (
            <QuotaRow key={row.resource} organizationId={params.id} row={row} />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
