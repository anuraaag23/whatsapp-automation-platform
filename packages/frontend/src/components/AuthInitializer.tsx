'use client';

import { useEffect } from 'react';
import { refreshAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

/**
 * Runs once when the dashboard mounts. Access tokens live in memory only
 * (by design — nothing auth-related sits in localStorage), so on every
 * fresh page load every dashboard query would otherwise fire with no
 * token, get a 401, and only succeed on the automatic retry that
 * api-client's response interceptor triggers. That's not broken — it
 * works — but it means every page load shows a burst of 401s in the
 * Network tab before things settle.
 *
 * This does the same silent refresh proactively, once, up front, so by
 * the time the dashboard's actual data hooks run they already have a
 * valid token and skip the fail-then-retry round trip entirely.
 */
export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const authInitialized = useAuthStore((s) => s.authInitialized);
  const setAuthInitialized = useAuthStore((s) => s.setAuthInitialized);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (authInitialized) return;

    if (accessToken) {
      // Already have one (e.g. arrived here right after login, same SPA
      // session) — nothing to refresh, just mark ready.
      setAuthInitialized(true);
      return;
    }

    refreshAccessToken().finally(() => setAuthInitialized(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authInitialized) {
    // Brief and unstyled on purpose — this is normally on screen for
    // well under a second (one network round trip), not worth a full
    // branded loading state.
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-deep-navy/40 dark:text-white/30">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
