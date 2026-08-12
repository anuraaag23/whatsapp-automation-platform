import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  emailVerified: boolean;
  organization: { id: string; name: string; slug: string; logoUrl: string | null };
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  /**
   * True once the app has attempted its one-time silent refresh on load
   * (success or failure either way). Access tokens live in memory only —
   * on every fresh page load they start out null, even for an already
   * logged-in user, until this initial refresh (using the httpOnly
   * refresh-token cookie) completes. Gating data-fetching on this instead
   * of firing immediately avoids every dashboard query 401-ing on first
   * load just because the token hadn't been reloaded yet.
   */
  authInitialized: boolean;
  setAccessToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  setAuthInitialized: (value: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  authInitialized: false,
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setAuthInitialized: (authInitialized) => set({ authInitialized }),
  clear: () => set({ accessToken: null, user: null }),
}));
