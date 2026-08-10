import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { QueryProvider } from './providers';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import './globals.css';

export const metadata: Metadata = {
  title: 'WhatsApp Business Automation Platform',
  description:
    'Official WhatsApp Business Platform automation, campaigns, scheduling, and analytics.',
  manifest: '/manifest.json',
  appleWebApp: {
    // Standalone status bar handling on iOS when launched from the home
    // screen — 'black-translucent' lets the glass UI's fixed background
    // extend under the status bar instead of leaving a hard bar behind it.
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'WA Platform',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the glass UI's fixed background extend under notches/home
  // indicators on iOS instead of leaving a hard black bar.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef1f6' },
    { media: '(prefers-color-scheme: dark)', color: '#05060c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Loaded before hydration so every glass surface can attach its
            optics on first paint instead of popping in unstyled. */}
        <Script src="/vendor/liquid-glass.js" strategy="beforeInteractive" />
        <ServiceWorkerRegistration />
        <div className="app-backdrop" aria-hidden="true" />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
