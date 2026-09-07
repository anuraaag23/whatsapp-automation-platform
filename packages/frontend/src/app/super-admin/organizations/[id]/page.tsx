'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ShieldOff, ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import { GlassCard, GlassButton } from '@/components/glass';
import {
  useSuperAdminOrganization,
  useSuspendOrganization,
  useActivateOrganization,
} from '@/hooks/api/super-admin';

export default function SuperAdminOrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: org, isLoading } = useSuperAdminOrganization(params.id);
  const suspend = useSuspendOrganization();
  const activate = useActivateOrganization();

  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const [reason, setReason] = useState('');

  if (isLoading) {
    return <p className="p-4 text-sm text-deep-navy/40 dark:text-white/30">Loading…</p>;
  }
  if (!org) {
    return <p className="p-4 text-sm text-danger">Organization not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <button
        onClick={() => router.push('/super-admin/organizations')}
        className="flex w-fit items-center gap-1.5 text-sm text-deep-navy/60 hover:text-deep-navy dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft size={14} /> Back to Organizations
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">{org.name}</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">{org.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              org.status === 'ACTIVE' ? 'bg-emerald/10 text-emerald' : 'bg-danger/10 text-danger'
            }`}
          >
            {org.status}
          </span>
          {org.status === 'ACTIVE' ? (
            <GlassButton
              variant="secondary"
              size="sm"
              icon={<ShieldOff size={14} />}
              onClick={() => setConfirmingSuspend(true)}
            >
              Suspend
            </GlassButton>
          ) : (
            <GlassButton
              variant="primary"
              size="sm"
              icon={<ShieldCheckIcon size={14} />}
              loading={activate.isPending}
              onClick={() => activate.mutate(org.id)}
            >
              Activate
            </GlassButton>
          )}
        </div>
      </div>

      {confirmingSuspend && (
        <GlassCard variant="lite" title="Suspend this organization?" subtitle="This blocks login for every user in this org until reactivated.">
          <div className="flex flex-col gap-3">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional, shown in the audit log)"
              className="w-full rounded-xl border-0 bg-black/5 px-3 py-2.5 text-sm text-deep-navy outline-none placeholder:text-deep-navy/40 dark:bg-white/10 dark:text-white dark:placeholder:text-white/30"
            />
            <div className="flex gap-2">
              <GlassButton
                variant="secondary"
                size="sm"
                loading={suspend.isPending}
                onClick={() =>
                  suspend.mutate(
                    { id: org.id, reason: reason || undefined },
                    { onSuccess: () => setConfirmingSuspend(false) },
                  )
                }
              >
                Confirm Suspend
              </GlassButton>
              <GlassButton variant="secondary" size="sm" onClick={() => setConfirmingSuspend(false)}>
                Cancel
              </GlassButton>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <GlassCard variant="lite" padded>
          <p className="text-2xl font-semibold text-deep-navy dark:text-white">{org._count.users}</p>
          <p className="text-xs text-deep-navy/60 dark:text-white/60">Users</p>
        </GlassCard>
        <GlassCard variant="lite" padded>
          <p className="text-2xl font-semibold text-deep-navy dark:text-white">{org._count.contacts}</p>
          <p className="text-xs text-deep-navy/60 dark:text-white/60">Contacts</p>
        </GlassCard>
        <GlassCard variant="lite" padded>
          <p className="text-2xl font-semibold text-deep-navy dark:text-white">{org._count.automations}</p>
          <p className="text-xs text-deep-navy/60 dark:text-white/60">Automations</p>
        </GlassCard>
        <GlassCard variant="lite" padded>
          <p className="text-2xl font-semibold text-deep-navy dark:text-white">{org.messageCount ?? 0}</p>
          <p className="text-xs text-deep-navy/60 dark:text-white/60">Messages</p>
        </GlassCard>
      </div>

      <GlassCard
        variant="lite"
        title="WhatsApp connection"
        subtitle={org.whatsappAccount ? undefined : 'Not connected'}
      >
        {org.whatsappAccount ? (
          <div className="flex flex-col gap-1 text-sm text-deep-navy/70 dark:text-white/60">
            <p>
              Status: <span className="font-medium text-deep-navy dark:text-white">{org.whatsappAccount.status}</span>
            </p>
            <p>Display number: {org.whatsappAccount.displayPhoneNumber}</p>
            <p className="text-xs text-deep-navy/40 dark:text-white/30">
              Access tokens are never shown here — see Settings on their own dashboard.
            </p>
          </div>
        ) : (
          <p className="text-sm text-deep-navy/50 dark:text-white/40">This organization hasn&apos;t connected a WhatsApp Business account yet.</p>
        )}
      </GlassCard>

      <GlassCard variant="lite" title="Members" subtitle={`${org.members?.length ?? 0} member(s)`}>
        <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
          {org.members?.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="text-deep-navy dark:text-white">
                  {m.user.firstName} {m.user.lastName}
                </p>
                <p className="text-xs text-deep-navy/50 dark:text-white/40">{m.user.email}</p>
              </div>
              <span className="text-xs text-deep-navy/50 dark:text-white/40">{m.role}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard variant="lite" title="Recent audit activity" subtitle="Last 20 events for this organization">
        <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
          {org.recentAudit?.length === 0 && (
            <p className="py-2 text-sm text-deep-navy/40 dark:text-white/30">No audit events yet.</p>
          )}
          {org.recentAudit?.map((entry: any) => (
            <div key={entry.id} className="py-2 text-sm">
              <p className="text-deep-navy dark:text-white">{entry.action}</p>
              <p className="text-xs text-deep-navy/50 dark:text-white/40">
                {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'System'} ·{' '}
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
