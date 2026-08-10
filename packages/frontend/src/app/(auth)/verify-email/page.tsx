'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { GlassPanel, GlassButton } from '@/components/glass';
import { apiClient } from '@/lib/api-client';

type Status = 'verifying' | 'success' | 'error';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return;
    }

    apiClient
      .post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(
          err?.response?.data?.message ?? 'This verification link is invalid or has expired.',
        );
      });
  }, [token]);

  return (
    <GlassPanel className="w-full max-w-md" animate>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-electric shadow-[0_8px_24px_rgba(10,132,255,0.4)]">
          <MessageCircle className="text-white" size={26} />
        </div>

        {status === 'verifying' && (
          <>
            <Loader2 className="animate-spin text-electric" size={28} />
            <p className="text-sm text-deep-navy/60 dark:text-white/60">Verifying your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="text-emerald" size={32} />
            <h1 className="text-lg font-semibold text-deep-navy dark:text-white">
              Email verified
            </h1>
            <p className="text-sm text-deep-navy/60 dark:text-white/60">
              Your email address is confirmed.
            </p>
            <GlassButton size="md" onClick={() => (window.location.href = '/dashboard')}>
              Go to dashboard
            </GlassButton>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="text-danger" size={32} />
            <h1 className="text-lg font-semibold text-deep-navy dark:text-white">
              Verification failed
            </h1>
            <p className="text-sm text-deep-navy/60 dark:text-white/60">{message}</p>
            <p className="text-xs text-deep-navy/40 dark:text-white/40">
              You can request a new link from the verification banner after signing in.
            </p>
          </>
        )}
      </div>
    </GlassPanel>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
