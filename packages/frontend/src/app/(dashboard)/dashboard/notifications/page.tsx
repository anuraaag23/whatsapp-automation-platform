'use client';

import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { GlassCard, GlassButton } from '@/components/glass';
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/api/notifications';

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Notifications</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Alerts from campaigns, schedules, and account status. Click one to mark it read.
          </p>
        </div>
        <GlassButton
          variant="secondary"
          icon={<Check size={16} />}
          loading={markAllRead.isPending}
          onClick={() => {
            setError(null);
            markAllRead.mutate(undefined, {
              onError: () => setError('Could not mark all as read — please try again.'),
            });
          }}
        >
          Mark all read
        </GlassButton>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-3">
        {isLoading && <GlassCard variant="lite">Loading…</GlassCard>}
        {!isLoading && notifications?.length === 0 && (
          <GlassCard variant="lite" className="flex flex-col items-center gap-2 py-10 text-center">
            <Bell className="text-deep-navy/30 dark:text-white/20" size={28} />
            <p className="text-sm text-deep-navy/50 dark:text-white/40">You&apos;re all caught up.</p>
          </GlassCard>
        )}
        {notifications?.map((n) => (
          <button
            key={n.id}
            type="button"
            disabled={n.isRead}
            onClick={() => {
              setError(null);
              markRead.mutate(n.id, {
                onError: () => setError('Could not mark that one as read — please try again.'),
              });
            }}
            className="text-left disabled:cursor-default"
          >
            <GlassCard
              variant="lite"
              className={`transition-opacity ${n.isRead ? 'opacity-50' : 'hover:opacity-90'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-deep-navy dark:text-white">{n.title}</p>
                  <p className="text-sm text-deep-navy/60 dark:text-white/50">{n.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="whitespace-nowrap text-xs text-deep-navy/40 dark:text-white/30">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                  {!n.isRead && (
                    <span className="rounded-full bg-electric px-2 py-0.5 text-[10px] font-medium text-white">
                      New
                    </span>
                  )}
                </div>
              </div>
            </GlassCard>
          </button>
        ))}
      </div>
    </div>
  );
}
