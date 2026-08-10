'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

export function QueryProvider({ children }: PropsWithChildren) {

  // The Zustand auth store only ever gets `user` set once, at the moment of
  // login — it isn't persisted to localStorage and nothing re-populates it
  // on a page refresh or direct navigation. The session itself still works
  // fine after a refresh (the access token silently re-issues via the
  // httpOnly refresh cookie in api-client's interceptor), but `user` stays
  // null, which broke every piece of UI that reads it for role checks or
  // display (the audit log's owner/admin gate, the user menu, the email
  // verification banner). This re-fetches it once on mount whenever it's
  // missing, so those all see the real user again after a refresh.
  useEffect(() => {
    if (!useAuthStore.getState().user) {
      apiClient
        .get('/auth/me')
        .then((res) => useAuthStore.getState().setUser(res.data))
        .catch(() => {
          // No valid session (e.g. genuinely logged out, or on a public
          // page like /login) — nothing to do, leave user as null.
        });
    }
  }, []);

  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
