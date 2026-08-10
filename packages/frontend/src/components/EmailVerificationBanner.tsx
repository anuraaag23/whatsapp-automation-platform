'use client';

import { useState } from 'react';
import { Mail, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

export function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerified || dismissed) return null;

  async function handleResend() {
    setSending(true);
    try {
      await apiClient.post('/auth/resend-verification');
      setSent(true);
    } catch {
      // Non-critical — leave the banner as-is so they can try again.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-2.5 text-xs text-deep-navy dark:text-white">
      <div className="flex items-center gap-2">
        <Mail size={14} className="shrink-0 text-amber" />
        {sent ? (
          <span>Verification email sent — check your inbox.</span>
        ) : (
          <span>
            Please verify <span className="font-medium">{user.email}</span> to secure your
            account.{' '}
            <button
              onClick={handleResend}
              disabled={sending}
              className="font-medium text-electric hover:underline disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Resend email'}
            </button>
          </span>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-deep-navy/40 hover:text-deep-navy/70 dark:text-white/40 dark:hover:text-white/70"
      >
        <X size={14} />
      </button>
    </div>
  );
}
