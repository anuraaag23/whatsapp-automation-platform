'use client';

import { useEffect } from 'react';

/**
 * Registers /public/sw.js so the browser considers this app installable
 * (Add to Home Screen on iOS/Android, "Install" in Chrome/Edge on desktop).
 * See sw.js itself for what it does and — more importantly — what it
 * deliberately does NOT cache.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }, []);

  return null;
}
