'use client';

import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { GlassPanel } from './GlassPanel';

export function GlassDialog({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          />
          <GlassPanel className={`relative z-10 w-full ${maxWidthClassName} max-h-[85vh] overflow-y-auto`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-deep-navy dark:text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-deep-navy/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </GlassPanel>
        </div>
      )}
    </AnimatePresence>
  );
}
