'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
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

function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function OrgSwitcher() {
  const [open, setOpen] = useState(false);
  const { data: orgs } = useMyOrganizations();
  const switchOrg = useSwitchOrganization();
  const currentUser = useAuthStore((s) => s.user);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  const current = orgs?.find((o) => o.organization.id === currentUser?.organizationId) ?? orgs?.[0];

  return (
    <div ref={ref} className="relative mb-4 px-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10"
      >
        <div className="h-8 w-8 shrink-0 rounded-xl bg-electric shadow-[0_4px_16px_rgba(10,132,255,0.5)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-deep-navy dark:text-white">
            {current?.organization.name ?? 'WA Platform'}
          </p>
          {current && <p className="text-[10px] text-deep-navy/40 dark:text-white/30">{current.role}</p>}
        </div>
        <ChevronsUpDown size={14} className="shrink-0 text-deep-navy/40 dark:text-white/30" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute left-0 top-12 z-30 w-64 overflow-hidden rounded-2xl border border-white/30 bg-white/95 p-1.5 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-deep-navy/95"
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
      </AnimatePresence>
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
                'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
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
