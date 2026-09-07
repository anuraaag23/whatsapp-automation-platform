'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  MessageCircle,
  MessagesSquare,
  Workflow,
  BarChart3,
  HeartPulse,
  Gauge,
  Layers,
  BellRing,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Menu,
  X,
  ShieldAlert,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassSidebar, GlassNavbar, type SidebarItem } from '@/components/glass';
import { AuthInitializer } from '@/components/AuthInitializer';
import { useAuthStore } from '@/store/auth-store';

const NAV_ITEMS: SidebarItem[] = [
  { label: 'Overview', href: '/super-admin', icon: <LayoutDashboard size={18} /> },
  { label: 'Organizations', href: '/super-admin/organizations', icon: <Building2 size={18} /> },
  { label: 'Users', href: '/super-admin/users', icon: <Users size={18} /> },
  { label: 'WhatsApp', href: '/super-admin/whatsapp', icon: <MessageCircle size={18} /> },
  { label: 'Conversations', href: '/super-admin/conversations', icon: <MessagesSquare size={18} /> },
  { label: 'Automations', href: '/super-admin/automations', icon: <Workflow size={18} /> },
  { label: 'Analytics', href: '/super-admin/analytics', icon: <BarChart3 size={18} /> },
  { label: 'Health', href: '/super-admin/health', icon: <HeartPulse size={18} /> },
  { label: 'Limits & Quotas', href: '/super-admin/limits', icon: <Gauge size={18} /> },
  { label: 'Plans', href: '/super-admin/plans', icon: <Layers size={18} /> },
  { label: 'Alerts', href: '/super-admin/alerts', icon: <BellRing size={18} /> },
  { label: 'Audit & Security', href: '/super-admin/audit', icon: <ShieldCheck size={18} /> },
  { label: 'Platform Settings', href: '/super-admin/settings', icon: <SlidersHorizontal size={18} /> },
  { label: 'Diagnostics', href: '/super-admin/diagnostics', icon: <Stethoscope size={18} /> },
];

/**
 * Client-side gating here is defense-in-depth only, not the real security
 * boundary — every /super-admin/* API call is independently enforced by
 * SuperAdminGuard on the backend regardless of what this layout does or
 * doesn't render (see common/guards/super-admin.guard.ts). This exists so
 * a non-super-admin who somehow lands on this URL sees a redirect instead
 * of a page full of components making API calls that will all 403.
 */
function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const authInitialized = useAuthStore((s) => s.authInitialized);
  const router = useRouter();

  useEffect(() => {
    if (authInitialized && user && !user.isSuperAdmin) {
      router.replace('/dashboard');
    }
  }, [authInitialized, user, router]);

  if (!user) return null;
  if (!user.isSuperAdmin) return null;

  return <>{children}</>;
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <AuthInitializer>
      <SuperAdminGate>
        <div className="flex h-dvh gap-4 p-2.5 sm:p-4">
          <div className="hidden lg:flex">
            <GlassSidebar items={NAV_ITEMS} />
          </div>

          <AnimatePresence>
            {mobileNavOpen && (
              <div className="fixed inset-0 z-50 flex lg:hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMobileNavOpen(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ x: -280 }}
                  animate={{ x: 0 }}
                  exit={{ x: -280 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                  className="relative z-10 h-full p-2.5"
                >
                  <div className="mb-2 flex justify-end">
                    <button
                      onClick={() => setMobileNavOpen(false)}
                      aria-label="Close menu"
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-deep-navy dark:bg-deep-navy/80 dark:text-white"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div onClick={() => setMobileNavOpen(false)}>
                    <GlassSidebar items={NAV_ITEMS} />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden sm:gap-4">
            <GlassNavbar
              title="Super Admin"
              leftSlot={
                <button
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open menu"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/5 text-deep-navy/70 dark:bg-white/10 dark:text-white/70 lg:hidden"
                >
                  <Menu size={18} />
                </button>
              }
              right={
                <div className="flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger">
                  <ShieldAlert size={14} />
                  Platform Control
                </div>
              }
            />
            <div className="flex-1 overflow-y-auto pr-1">{children}</div>
          </div>
        </div>
      </SuperAdminGate>
    </AuthInitializer>
  );
}
