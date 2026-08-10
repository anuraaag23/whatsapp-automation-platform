'use client';

import { ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Search, Bell, Check, Sun, Moon, Monitor } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassSurface } from './GlassSurface';
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from '@/hooks/api/notifications';
import { useGlobalSearch } from '@/hooks/api/search';
import { useTheme, ThemeMode } from '@/hooks/useTheme';

function useClickOutside(refs: Array<React.RefObject<HTMLElement | null>>, onOutside: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideAny = refs.some((r) => r.current && r.current.contains(target));
      if (!insideAny) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Tracks a fixed-position anchor (bottom-left corner, right-aligned) below a
 * trigger element, recalculated while `active`. Used so popover content can
 * be portaled straight to <body> — escaping any ancestor with `filter` /
 * `backdrop-filter` applied (see GlassSurface / useLiquidGlass), since those
 * properties drag their entire descendant subtree — including elements that
 * are position:absolute and visually escape the parent's box — into the
 * same filtered compositing layer. A portal is the only reliable escape
 * hatch; adjusting z-index or "opacity" does not help.
 */
function useAnchoredPosition(triggerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const recalc = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
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

function SearchPalette() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { data: results } = useGlobalSearch(query);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPosition(wrapRef, open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-sm text-deep-navy/50 dark:bg-white/10 dark:text-white/50">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search everything…"
          className="w-48 bg-transparent outline-none placeholder:text-deep-navy/40 dark:placeholder:text-white/40"
        />
        <kbd className="ml-1 rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">⌘K</kbd>
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && query.trim().length >= 2 && pos && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                style={{ position: 'fixed', top: pos.top, right: pos.right }}
                className="z-50 w-80 overflow-hidden rounded-2xl border border-white/30 bg-white/90 p-2 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-deep-navy/90"
              >
                {!results || results.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-deep-navy/40 dark:text-white/40">
                    No results for &quot;{query}&quot;
                  </p>
                ) : (
                  results.map((r) => (
                    <Link
                      key={`${r.type}-${r.id}`}
                      href={r.href}
                      className="flex flex-col rounded-xl px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <span className="font-medium text-deep-navy dark:text-white">{r.title}</span>
                      <span className="text-xs text-deep-navy/50 dark:text-white/40">{r.subtitle}</span>
                    </Link>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: unreadCount } = useUnreadCount();
  const { data: notifications } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const buttonWrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useClickOutside([buttonWrapRef, panelRef], () => setOpen(false));

  const pos = useAnchoredPosition(buttonWrapRef, open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div ref={buttonWrapRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 text-deep-navy/70 hover:bg-black/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/20"
      >
        <Bell size={18} />
        {Boolean(unreadCount) && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {/*
        Portaled to <body> — deliberately NOT rendered inside the GlassSurface
        subtree. GlassSurface's wrapper carries a `backdrop-filter: url(#lg-filter-N) ...`
        (see useLiquidGlass), whose SVG displacement map is sized to the navbar
        bar itself. backdrop-filter forces a stacking context that still
        captures descendants positioned outside the filtered element's own
        box (like this panel, previously placed at top-12/right-0), so it was
        being composited through a refraction map built for a 64px bar —
        producing the translucent/ghosted look with rainbow fringing at the
        edges. Portaling escapes that subtree entirely; position is tracked
        manually via useAnchoredPosition instead of CSS `absolute`.
      */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                style={{ position: 'fixed', top: pos.top, right: pos.right }}
                className="z-50 max-h-96 w-80 overflow-y-auto rounded-2xl border border-white/30 bg-white p-1.5 shadow-glass dark:border-white/10 dark:bg-deep-navy"
              >
                <div className="mb-1 flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-semibold text-deep-navy/70 dark:text-white/60">Notifications</span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      markAllRead.mutate(undefined, {
                        onError: () => setError('Could not mark all as read.'),
                      });
                    }}
                    className="flex items-center gap-1 text-[11px] text-electric hover:underline"
                  >
                    <Check size={12} /> Mark all read
                  </button>
                </div>
                {error && <p className="px-3 pb-2 text-[11px] text-danger">{error}</p>}
                {!notifications || notifications.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-deep-navy/40 dark:text-white/40">
                    You&apos;re all caught up.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      disabled={n.isRead}
                      onClick={() => {
                        setError(null);
                        markRead.mutate(n.id, {
                          onError: () => setError('Could not mark that one as read.'),
                        });
                      }}
                      className={`block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:cursor-default disabled:hover:bg-transparent dark:disabled:hover:bg-transparent ${n.isRead ? 'opacity-50' : ''}`}
                    >
                      <p className="font-medium text-deep-navy dark:text-white">{n.title}</p>
                      <p className="text-xs text-deep-navy/60 dark:text-white/50">{n.body}</p>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
  light: <Sun size={16} />,
  dark: <Moon size={16} />,
  auto: <Monitor size={16} />,
};

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const order: ThemeMode[] = ['light', 'dark', 'auto'];

  return (
    <button
      type="button"
      aria-label={`Theme: ${mode}. Click to change.`}
      title={`Theme: ${mode}`}
      onClick={() => {
        const next = order[(order.indexOf(mode) + 1) % order.length];
        setMode(next);
      }}
      className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 text-deep-navy/70 hover:bg-black/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/20"
    >
      {THEME_ICONS[mode]}
    </button>
  );
}

export function GlassNavbar({
  title,
  right,
  leftSlot,
}: {
  title: string;
  right?: ReactNode;
  leftSlot?: ReactNode;
}) {
  return (
    <GlassSurface
      tint="neutral"
      radiusClassName="rounded-2xl"
      glass={{ scale: -60, chroma: 3, blur: 5, mapBlur: 14 }}
      className="flex h-16 items-center justify-between gap-3 px-3 sm:px-5"
      animate={false}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leftSlot}
        <h1 className="truncate text-base font-semibold text-deep-navy dark:text-white sm:text-lg">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <SearchPalette />
        <ThemeToggle />
        <NotificationsBell />
        {right}
      </div>
    </GlassSurface>
  );
}
