'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import clsx from 'clsx';
import { motion, HTMLMotionProps, useReducedMotion } from 'framer-motion';
import { useLiquidGlass, LiquidGlassOptions } from './useLiquidGlass';

export type GlassTint = 'neutral' | 'navy' | 'electric';

export interface GlassSurfaceProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  tint?: GlassTint;
  radiusClassName?: string;
  glass?: LiquidGlassOptions;
  animate?: boolean;
  /**
   * 'full' (default) mounts the real SVG-refraction liquid glass effect —
   * use for chrome that appears once per page: navbar, sidebar, an open
   * dialog. 'lite' skips it and uses a single cheap CSS backdrop-blur
   * instead — use for any card rendered inside a list/grid .map(), where
   * mounting N independent real instances is what actually causes
   * app-wide frame drops. See the `disabled` doc on LiquidGlassOptions.
   */
  variant?: 'full' | 'lite';
}

const TINTS: Record<GlassTint, string> = {
  neutral:
    'bg-gradient-to-b from-white/40 to-white/10 dark:from-white/[0.06] dark:to-black/20',
  navy: 'bg-gradient-to-b from-deep-navy/30 to-deep-navy/50 dark:from-deep-navy/60 dark:to-deep-navy/80',
  electric: 'bg-gradient-to-b from-electric/15 to-electric/5 dark:from-electric/20 dark:to-electric/5',
};

/**
 * The single source of "glass" material in the app. Wraps the vendored
 * liquid-glass.js optics (real SVG refraction in Chromium, frosted
 * backdrop-blur fallback elsewhere) with the standard highlight / shadow
 * dressing so every panel, card, sidebar, and dialog reads as one material.
 */
export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  (
    {
      tint = 'neutral',
      radiusClassName = 'rounded-2xl',
      glass,
      animate = true,
      variant = 'full',
      className,
      children,
      ...rest
    },
    forwardedRef,
  ) => {
    const { ref: glassRef } = useLiquidGlass<HTMLDivElement>({
      ...glass,
      disabled: variant === 'lite',
    });
    const innerRef = useRef<HTMLDivElement | null>(null);
    const prefersReducedMotion = useReducedMotion();
    const shouldAnimate = animate && !prefersReducedMotion;

    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLDivElement);

    return (
      <motion.div
        ref={(node) => {
          glassRef.current = node;
          innerRef.current = node;
        }}
        initial={shouldAnimate ? { opacity: 0, scale: 0.97, y: 6 } : false}
        animate={shouldAnimate ? { opacity: 1, scale: 1, y: 0 } : undefined}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className={clsx(
          radiusClassName,
          TINTS[tint],
          'shadow-glass dark:shadow-glass-dark',
          'border border-white/30 dark:border-white/10',
          'relative isolate',
          // 'lite' still gets a real (but single-pass, cheap) CSS blur so it
          // doesn't look flat next to 'full' surfaces on the same page —
          // just without the per-instance canvas map + SVG refraction cost.
          variant === 'lite' && 'backdrop-blur-md',
          className,
        )}
        {...rest}
      >
        {children}
      </motion.div>
    );
  },
);

GlassSurface.displayName = 'GlassSurface';
