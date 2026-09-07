'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { refreshAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';
import { setSessionCookie, clearSessionCookie } from '@/lib/session-cookie';

/**
 * Proactively verifies and restores the user session on load, or immediately
 * redirects unauthenticated users to /login without flashing protected UI.
 */
export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const authInitialized = useAuthStore((s) => s.authInitialized);
  const setAuthInitialized = useAuthStore((s) => s.setAuthInitialized);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (authInitialized && accessToken) {
      setSessionCookie();
      return;
    }

    if (accessToken) {
      setSessionCookie();
      setAuthInitialized(true);
      return;
    }

    let isMounted = true;

    async function initAuth() {
      try {
        const token = await refreshAccessToken();
        if (!isMounted) return;

        if (token) {
          setSessionCookie();
          setAuthInitialized(true);
        } else {
          // Refresh failed — clear credentials and redirect to login
          clearSessionCookie();
          setRedirecting(true);
          const search = typeof window !== 'undefined' ? window.location.search : '';
          const target = `${pathname || '/dashboard'}${search}`;
          router.replace(`/login?from=${encodeURIComponent(target)}`);
        }
      } catch {
        if (!isMounted) return;
        clearSessionCookie();
        setRedirecting(true);
        const search = typeof window !== 'undefined' ? window.location.search : '';
        const target = `${pathname || '/dashboard'}${search}`;
        router.replace(`/login?from=${encodeURIComponent(target)}`);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [authInitialized, accessToken, pathname, router, setAuthInitialized]);

  // If not yet initialized or redirecting, NEVER render children (zero UI flash)
  if (!authInitialized || !accessToken || redirecting) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-deep-navy/40 dark:text-white/30">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-electric border-t-transparent" />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

