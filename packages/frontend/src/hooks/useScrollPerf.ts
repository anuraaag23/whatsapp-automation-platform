'use client';

import { useEffect } from 'react';

/**
 * Attach once near the root of the app. While ANY scroll is in flight
 * anywhere on the page (capture phase catches scrolling inside nested
 * containers too, not just window scroll), adds `is-scrolling` to <body>.
 * globals.css uses that class to strip backdrop-filter off glass panels
 * for the duration — see the comment there for why that matters.
 *
 * rAF-throttled so this costs effectively nothing even on very fast
 * scroll-event streams (touch scrolling can fire dozens of scroll events
 * per frame).
 */
export function useScrollPerf() {
  useEffect(() => {
    let ticking = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          document.body.classList.add('is-scrolling');
          ticking = false;
        });
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, 150);
    }

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      if (idleTimer) clearTimeout(idleTimer);
      document.body.classList.remove('is-scrolling');
    };
  }, []);
}
