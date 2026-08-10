'use client';

import { useEffect, useRef, useState } from 'react';

export interface LiquidGlassOptions {
  /** Displacement strength; negative = magnifying bulge. -60 subtle … -180 dramatic. */
  scale?: number;
  /** Per-channel scale stagger (prism fringe at the rim); 0 disables. */
  chroma?: number;
  /** Neutral interior inset, fraction of the smaller side. */
  border?: number;
  /** Curvature of the bulge: small = hard rim, large = dome. */
  mapBlur?: number;
  /** Backdrop blur inside the glass, in px. */
  blur?: number;
  /** Backdrop saturation boost. */
  saturate?: number;
  /** Corner radius override in px; defaults to the element's border-radius. */
  radius?: number | null;
  /** Frosted blur used on Safari/Firefox where SVG-filtered backdrops aren't supported. */
  fallbackBlur?: number;
  /**
   * Skips mounting the real SVG-refraction effect entirely and falls
   * straight to the cheap frosted-blur look — same code path as the
   * mobile/reduced-motion/unsupported-browser fallback. Use this for any
   * card rendered inside a list/grid .map(): each real instance mounts its
   * own canvas-drawn displacement map plus an independent backdrop-filter
   * compositing layer, and the browser has to recompute every one of those
   * layers on every frame anything behind them moves (scroll, other
   * animations, etc). One or two of these (navbar, sidebar, an open dialog)
   * is unnoticeable; a grid of 20+ campaign/contact/template cards each
   * running their own is exactly what makes the whole app feel like it's
   * dropping frames everywhere, not just on that one page.
   */
  disabled?: boolean;
}

interface LiquidGlassHandle {
  supported: boolean;
  refresh: () => void;
  destroy: () => void;
}

declare global {
  interface Window {
    liquidGlass?: (el: Element, opts?: LiquidGlassOptions) => LiquidGlassHandle;
  }
}

/**
 * Mounts the real optical liquid-glass effect (SVG displacement filter +
 * backdrop-filter, from the vendored liquid-glass.js) onto the returned ref.
 * Falls back to a plain frosted blur automatically on Safari/Firefox.
 */
export function useLiquidGlass<T extends HTMLElement = HTMLDivElement>(
  options: LiquidGlassOptions = {},
) {
  const ref = useRef<T | null>(null);
  const [supported, setSupported] = useState(true);

  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    if (!ref.current || typeof window === 'undefined') return;

    // The real SVG-displacement refraction is gorgeous but genuinely
    // expensive to composite — it's a filter reference re-evaluated
    // against the live backdrop on every frame anything behind it moves.
    // On phones/tablets (coarse pointer) or when the person has asked for
    // reduced motion, skip mounting it entirely and fall back to the same
    // plain frosted `.lg-fallback` style already used for Safari/Firefox,
    // which the library treats as "unsupported" — same visual family
    // (translucent + blurred), a fraction of the GPU cost.
    const isLowPowerContext =
      options.disabled ||
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (isLowPowerContext || !window.liquidGlass) {
      ref.current.classList.add('lg-fallback');
      setSupported(false);
      return;
    }

    const handle = window.liquidGlass(ref.current, options);
    setSupported(handle.supported);

    return () => handle.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  return { ref, supported };
}
