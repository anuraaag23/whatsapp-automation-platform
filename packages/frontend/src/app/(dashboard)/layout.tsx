'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  CalendarClock,
  Megaphone,
  Workflow,
  FileText,
  Users,
  UsersRound,
  Calendar,
  BarChart3,
  Bell,
  ShieldCheck,
  Settings,
  ScrollText,
  HelpCircle,
  LifeBuoy,
  Menu,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassSidebar, GlassNavbar, type SidebarItem } from '@/components/glass';
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner';
import { UserMenu } from '@/components/UserMenu';
import { AuthInitializer } from '@/components/AuthInitializer';

const NAV_ITEMS: SidebarItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Messages', href: '/dashboard/messages', icon: <MessageSquare size={18} /> },
  { label: 'Schedules', href: '/dashboard/schedules', icon: <CalendarClock size={18} /> },
  { label: 'Campaigns', href: '/dashboard/campaigns', icon: <Megaphone size={18} /> },
  { label: 'Automation', href: '/dashboard/automation', icon: <Workflow size={18} /> },
  { label: 'Templates', href: '/dashboard/templates', icon: <FileText size={18} /> },
  { label: 'Contacts', href: '/dashboard/contacts', icon: <Users size={18} /> },
  { label: 'Groups', href: '/dashboard/groups', icon: <UsersRound size={18} /> },
  { label: 'Calendar', href: '/dashboard/calendar', icon: <Calendar size={18} /> },
  { label: 'Analytics', href: '/dashboard/analytics', icon: <BarChart3 size={18} /> },
  { label: 'Notifications', href: '/dashboard/notifications', icon: <Bell size={18} /> },
  { label: 'Users', href: '/dashboard/users', icon: <ShieldCheck size={18} /> },
  { label: 'Audit Log', href: '/dashboard/audit-log', icon: <ScrollText size={18} /> },
  { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={18} /> },
  { label: 'Help', href: '/dashboard/help', icon: <HelpCircle size={18} /> },
  { label: 'Support', href: '/dashboard/support', icon: <LifeBuoy size={18} /> },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <AuthInitializer>
      <div className="flex h-dvh gap-4 p-2.5 sm:p-4">
      {/* Desktop sidebar — always visible at lg+ */}
      <div className="hidden lg:flex">
        <GlassSidebar items={NAV_ITEMS} />
      </div>

      {/* Mobile / tablet sidebar — slides in as an overlay below lg */}
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
          title="Dashboard"
          leftSlot={
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/5 text-deep-navy/70 dark:bg-white/10 dark:text-white/70 lg:hidden"
            >
              <Menu size={18} />
            </button>
          }
          right={<UserMenu />}
        />
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="mb-3">
            <EmailVerificationBanner />
          </div>
          {children}
        </div>
      </div>
    </div>
    </AuthInitializer>
  );
}
