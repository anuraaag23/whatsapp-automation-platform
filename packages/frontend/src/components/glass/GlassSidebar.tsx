'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronsUpDown, Check, Plus } from 'lucide-react';
import clsx from 'clsx';
import { GlassSurface } from './GlassSurface';
import { useMyOrganizations, useSwitchOrganization } from '@/hooks/api/organizations';
import { useAuthStore } from '@/store/auth-store';

export interface SidebarItem {
  label: string;
  href: string;
  icon: ReactNode;
}

/**
 * Tracks a fixed-position anchor below a trigger element, recalculated
 * while `active`. Popover content anchored this way gets portaled to
 * <body> instead of rendered as a `position: absolute` child — GlassSidebar
 * (like GlassNavbar and GlassSelect's various hosts) wraps its content in
 * GlassSurface, which mounts a `backdrop-filter` on itself via
 * useLiquidGlass. That filter drags every descendant — including
 * position:absolute content that visually escapes the ancestor's own box —
 * into the same filtered compositing layer, whose SVG displacement map is
 * sized to the ancestor, not the popover. The result is the translucent/
 * ghosted, rainbow-fringed look. Portaling out of that subtree is the fix.
 */
function useAnchoredPosition(triggerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const recalc = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
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

function OrgSwitcher() {
  const [open, setOpen] = useState(false);
  const { data: orgs } = useMyOrganizations();
  const switchOrg = useSwitchOrganization();
  const currentUser = useAuthStore((s) => s.user);

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

  const current = orgs?.find((o) => o.organization.id === currentUser?.organizationId) ?? orgs?.[0];

  return (
    <div ref={triggerRef} className="relative mb-4 px-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10"
      >
        {current?.organization.logoUrl ? (
          <img
            src={current.organization.logoUrl}
            alt={current.organization.name}
            className="h-8 w-8 shrink-0 rounded-xl object-cover shadow-[0_4px_16px_rgba(10,132,255,0.5)]"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-electric text-sm font-semibold text-white shadow-[0_4px_16px_rgba(10,132,255,0.5)]">
            {(current?.organization.name ?? 'W').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-deep-navy dark:text-white">
            {current?.organization.name ?? 'WA Platform'}
          </p>
          {current && <p className="text-[10px] text-deep-navy/40 dark:text-white/30">{current.role}</p>}
        </div>
        <ChevronsUpDown size={14} className="shrink-0 text-deep-navy/40 dark:text-white/30" />
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
                style={{ position: 'fixed', top: pos.top, left: pos.left, width: Math.max(pos.width, 256) }}
                className="z-50 overflow-hidden rounded-2xl border border-white/30 bg-white/95 p-1.5 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-deep-navy/95"
              >
                {orgs?.map((o) => (
                  <button
                    key={o.organization.id}
                    onClick={() => {
                      if (o.organization.id !== currentUser?.organizationId) switchOrg.mutate(o.organization.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <span className="flex-1 truncate text-deep-navy dark:text-white">{o.organization.name}</span>
                    <span className="text-[10px] text-deep-navy/40 dark:text-white/30">{o.role}</span>
                    {o.organization.id === currentUser?.organizationId && (
                      <Check size={13} className="text-electric" />
                    )}
                  </button>
                ))}
                <Link
                  href="/dashboard/settings"
                  onClick={() => setOpen(false)}
                  className="mt-1 flex items-center gap-2 rounded-xl border-t border-black/5 px-2.5 py-2 text-left text-xs font-medium text-electric dark:border-white/10"
                >
                  <Plus size={13} /> Create or manage organizations
                </Link>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

export function GlassSidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  return (
    <GlassSurface
      tint="neutral"
      radiusClassName="rounded-3xl"
      glass={{ scale: -90, chroma: 5, blur: 8, mapBlur: 18 }}
      className="flex h-full w-64 flex-col gap-1 p-4"
      animate={false}
    >
      <OrgSwitcher />

      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-300 delay-75',
                active
                  ? 'text-white'
                  : 'text-deep-navy/70 hover:text-deep-navy dark:text-white/60 dark:hover:text-white',
              )}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-electric shadow-[0_4px_18px_rgba(10,132,255,0.4)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex h-5 w-5 items-center justify-center">
                {item.icon}
              </span>
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </GlassSurface>
  );
}
