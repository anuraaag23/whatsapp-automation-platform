'use client';

import { FormEvent, useState } from 'react';
import { Mail, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { GlassPanel, GlassButton } from '@/components/glass';
import { apiClient } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiClient.post('/auth/forgot-password', { email });
      // Always show the same success state, whether or not the email
      // exists — the backend intentionally never reveals that.
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <GlassPanel className="w-full max-w-md" animate>
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 h-14 w-14 overflow-hidden rounded-2xl shadow-[0_8px_24px_rgba(10,132,255,0.4)]">
            <Image src="/logo.png" alt="WA Platform" width={56} height={56} className="h-full w-full object-cover" priority />
          </div>
          <h1 className="text-xl font-semibold text-deep-navy dark:text-white">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-deep-navy/60 dark:text-white/60">
            Enter your account email and we&apos;ll send you a reset link
          </p>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="rounded-lg bg-emerald/10 px-3 py-3 text-sm text-emerald">
              If an account exists for <span className="font-medium">{email}</span>, a reset
              link is on its way. Check your inbox (and spam folder).
            </p>
            <a href="/login" className="text-sm text-electric hover:underline">
              Back to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">
                Email
              </span>
              <div className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/10">
                <Mail size={16} className="text-deep-navy/40 dark:text-white/40" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-deep-navy/30 dark:placeholder:text-white/30"
                />
              </div>
            </label>

            {error && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
            )}

            <GlassButton type="submit" size="lg" loading={loading} className="mt-2 w-full">
              Send reset link
            </GlassButton>

            <a
              href="/login"
              className="mt-1 flex items-center justify-center gap-1.5 text-xs text-deep-navy/50 hover:underline dark:text-white/40"
            >
              <ArrowLeft size={12} />
              Back to sign in
            </a>
          </form>
        )}
      </GlassPanel>
    </main>
  );
}
