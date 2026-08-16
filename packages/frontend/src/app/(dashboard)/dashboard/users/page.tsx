'use client';

import { ShieldCheck, UserX } from 'lucide-react';
import { GlassCard, GlassSelect } from '@/components/glass';
import { useOrgUsers, useUpdateUserRole, useDeactivateUser, Role } from '@/hooks/api/users';
import { useAuthStore } from '@/store/auth-store';

const ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'SUPPORT', 'VIEWER'];

export default function UsersPage() {
  const { data: users, isLoading } = useOrgUsers();
  const updateRole = useUpdateUserRole();
  const deactivateUser = useDeactivateUser();
  const currentUser = useAuthStore((s) => s.user);

  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Users</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Manage team access with role-based permissions.
        </p>
      </div>

      <GlassCard variant="lite" padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-deep-navy/50 dark:border-white/10 dark:text-white/40">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/40">
                  Loading…
                </td>
              </tr>
            )}
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="px-4 py-3 font-medium text-deep-navy dark:text-white">
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-4 py-3 text-deep-navy/70 dark:text-white/70">{u.email}</td>
                <td className="px-4 py-3">
                  {canManage && u.role !== 'OWNER' ? (
                    <GlassSelect
                      value={u.role}
                      onChange={(value) => updateRole.mutate({ id: u.id, role: value as Role })}
                      options={ROLES.filter((r) => r !== 'OWNER').map((r) => ({ value: r, label: r }))}
                      className="w-32 text-xs"
                    />
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-electric">
                      <ShieldCheck size={12} /> {u.role}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      u.isActive ? 'bg-emerald/10 text-emerald' : 'bg-black/5 text-deep-navy/50 dark:bg-white/10 dark:text-white/40'
                    }`}
                  >
                    {u.isActive ? 'active' : 'deactivated'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && u.role !== 'OWNER' && u.isActive && (
                    <button
                      onClick={() => deactivateUser.mutate(u.id)}
                      className="text-deep-navy/30 hover:text-danger dark:text-white/30"
                      aria-label="Deactivate user"
                    >
                      <UserX size={16} />
                    </button>
                  )}
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
