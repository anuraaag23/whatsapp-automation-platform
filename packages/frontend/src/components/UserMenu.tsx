'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { LogOut, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

/**
 * Same fix as NotificationsBell/GlassSelect/OrgSwitcher: UserMenu is mounted
 * inside GlassNavbar's `right` slot, which lives inside GlassSurface's
 * backdrop-filter subtree. A plain `position: absolute` panel here gets
 * dragged into that filtered compositing layer and renders ghosted with
 * rainbow fringing at the edges. Portal to <body>, position via the
 * trigger's own getBoundingClientRect() instead.
 */
function useAnchoredPosition(triggerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const recalc = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [triggerRef]);

  useEffect(() => {
    if (!active) return;
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('scroll', recalc, true);
    };
  }, [active, recalc]);

  return pos;
}

export function UserMenu() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPosition(triggerRef, open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideTrigger && !insidePanel) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      // Best-effort — revokes the refresh token server-side. Even if this
      // fails (e.g. network hiccup), we still clear local state below so
      // the person is never stuck unable to log out.
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore — proceed with local logout regardless.
    } finally {
      clear();
      router.push('/login');
    }
  }

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl bg-black/5 py-1.5 pl-1.5 pr-2.5 text-left hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-electric text-[11px] font-semibold text-white">
          {initials || 'U'}
        </span>
        <span className="hidden flex-col sm:flex">
          <span className="text-xs font-medium leading-tight text-deep-navy dark:text-white">
            {user.firstName} {user.lastName}
          </span>
          <span className="text-[10px] leading-tight text-deep-navy/50 dark:text-white/40">
            {user.role}
          </span>
        </span>
        <ChevronDown size={14} className="text-deep-navy/40 dark:text-white/40" />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
                style={{ position: 'fixed', top: pos.top, right: pos.right }}
                className="z-50 w-56 overflow-hidden rounded-2xl border border-white/30 bg-white/90 p-1.5 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-deep-navy/90"
              >
                <div className="px-2.5 py-2">
                  <p className="truncate text-sm font-medium text-deep-navy dark:text-white">
                    {user.email}
                  </p>
                  <p className="text-xs text-deep-navy/50 dark:text-white/40">
                    {user.organization?.name}
                  </p>
                </div>
                <div className="my-1 h-px bg-black/5 dark:bg-white/10" />
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  <LogOut size={15} />
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
