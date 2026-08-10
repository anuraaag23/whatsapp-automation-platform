'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export interface GlassSelectOption {
  value: string;
  label: string;
}

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: GlassSelectOption[];
  placeholder?: string;
  className?: string;
}

/**
 * A dropdown styled to match the rest of the Liquid Glass UI.
 *
 * Native <select> elements can't be styled this way — the popup list is
 * drawn by the browser/OS itself, not the page's CSS, so there's no way to
 * give it a frosted/blurred background no matter what classes you throw at
 * it. This builds the same interaction (button -> option list -> select)
 * entirely out of app-controlled markup instead, so it can actually use
 * the same glass surface as everything else (GlassCard, the user menu,
 * dialogs, etc).
 *
 * The option list is portaled to <body> rather than rendered as a normal
 * `position: absolute` child. GlassSelect is routinely used inside
 * GlassDialog / GlassPanel / GlassCard, all of which carry a
 * `backdrop-filter` from useLiquidGlass. A `backdrop-filter` on an ancestor
 * forces every descendant — including position:absolute content that
 * visually escapes the ancestor's own box — into that same filtered
 * compositing layer. Since the SVG displacement map behind that filter is
 * sized to the ancestor's own box (not to wherever the dropdown ends up),
 * the option list would render translucent/ghosted with rainbow fringing
 * at the edges, exactly like the notification bell did before its fix.
 * Portaling out of that subtree is the only reliable way around it —
 * z-index and opacity tweaks don't touch the underlying cause.
 */
export function GlassSelect({ value, onChange, options, placeholder, className }: GlassSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const recalc = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('scroll', recalc, true);
    };
  }, [open, recalc]);

  useEffect(() => {
    function onPointerDownOutside(e: PointerEvent) {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideTrigger && !insidePanel) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDownOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDownOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={triggerRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-left text-sm outline-none dark:border-white/10 dark:bg-white/10"
      >
        <span className={selected ? 'text-deep-navy dark:text-white' : 'text-deep-navy/30 dark:text-white/30'}>
          {selected?.label ?? placeholder ?? 'Select…'}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-deep-navy/40 transition-transform dark:text-white/40 ${open ? 'rotate-180' : ''}`}
        />
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
                style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
                className="z-50 max-h-64 overflow-y-auto rounded-2xl border border-white/30 bg-white/90 p-1.5 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-deep-navy/90"
              >
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm text-deep-navy hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
                  >
                    <span>{option.label}</span>
                    {option.value === value && <Check size={14} className="shrink-0 text-electric" />}
                  </button>
                ))}
                {options.length === 0 && (
                  <p className="px-3 py-2 text-xs text-deep-navy/40 dark:text-white/40">No options</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
