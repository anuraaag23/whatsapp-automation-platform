'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { GlassCard, GlassButton } from '@/components/glass';
import { useSuperAdminUsers, useSetUserActive } from '@/hooks/api/super-admin';

export default function SuperAdminUsersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSuperAdminUsers({ search: search || undefined, page });
  const setActive = useSetUserActive();

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Users</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          {isLoading ? 'Loading…' : `${data?.total ?? 0} user${data?.total === 1 ? '' : 's'} across every organization`}
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-deep-navy/40 dark:text-white/30" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or email…"
          className="w-full rounded-xl border-0 bg-black/5 py-2.5 pl-9 pr-3 text-sm text-deep-navy outline-none placeholder:text-deep-navy/40 dark:bg-white/10 dark:text-white dark:placeholder:text-white/30 sm:max-w-sm"
        />
      </div>

      <GlassCard variant="lite" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-deep-navy/50 dark:border-white/10 dark:text-white/40">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
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
              {data?.users.map((u) => (
                <tr key={u.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">
                    <p className="font-medium text-deep-navy dark:text-white">
                      {u.firstName} {u.lastName}
                      {u.isSuperAdmin && (
                        <span className="ml-2 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                          SUPER ADMIN
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-deep-navy/50 dark:text-white/40">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">{u.organization.name}</td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">{u.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.isActive ? 'bg-emerald/10 text-emerald' : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">{u.emailVerified ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/60">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <GlassButton
                      variant="secondary"
                      size="sm"
                      loading={setActive.isPending}
                      onClick={() => setActive.mutate({ id: u.id, isActive: !u.isActive })}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </GlassButton>
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
