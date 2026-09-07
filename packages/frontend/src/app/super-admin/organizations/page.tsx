'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { GlassCard } from '@/components/glass';
import { useSuperAdminOrganizations } from '@/hooks/api/super-admin';

export default function SuperAdminOrganizationsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const router = useRouter();

  const { data, isLoading } = useSuperAdminOrganizations({
    search: search || undefined,
    status: status || undefined,
    page,
  });

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Organizations</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          {isLoading ? 'Loading…' : `${data?.total ?? 0} organization${data?.total === 1 ? '' : 's'} on the platform`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-deep-navy/40 dark:text-white/30" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or slug…"
            className="w-full rounded-xl border-0 bg-black/5 py-2.5 pl-9 pr-3 text-sm text-deep-navy outline-none placeholder:text-deep-navy/40 dark:bg-white/10 dark:text-white dark:placeholder:text-white/30"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border-0 bg-black/5 px-3 py-2.5 text-sm text-deep-navy outline-none dark:bg-white/10 dark:text-white"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      <GlassCard variant="lite" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-deep-navy/50 dark:border-white/10 dark:text-white/40">
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Automations</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/30">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && data?.organizations.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/30">
                    No organizations match this filter.
                  </td>
                </tr>
              )}
              {data?.organizations.map((org) => (
                <tr
                  key={org.id}
                  onClick={() => router.push(`/super-admin/organizations/${org.id}`)}
                  className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-black/[0.03] dark:border-white/5 dark:hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-deep-navy dark:text-white">{org.name}</p>
                    <p className="text-xs text-deep-navy/50 dark:text-white/40">{org.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        org.status === 'ACTIVE' ? 'bg-emerald/10 text-emerald' : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">{org._count.users}</td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">{org._count.contacts}</td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">{org._count.automations}</td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">
                    {org.whatsappAccount ? org.whatsappAccount.status : 'Not connected'}
                  </td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
