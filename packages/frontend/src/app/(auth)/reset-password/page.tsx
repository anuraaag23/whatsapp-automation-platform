'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { GlassPanel, GlassButton } from '@/components/glass';
import { apiClient } from '@/lib/api-client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('This reset link is missing its token — request a new one.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ?? 'This reset link is invalid or has expired. Request a new one.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassPanel className="w-full max-w-md" animate>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 h-14 w-14 overflow-hidden rounded-2xl shadow-[0_8px_24px_rgba(10,132,255,0.4)]">
          <Image src="/logo.png" alt="WA Platform" width={56} height={56} className="h-full w-full object-cover" priority />
        </div>
        <h1 className="text-xl font-semibold text-deep-navy dark:text-white">
          Choose a new password
        </h1>
      </div>

      {done ? (
        <p className="rounded-lg bg-emerald/10 px-3 py-3 text-center text-sm text-emerald">
          Password reset. Redirecting you to sign in…
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">
              New password
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/10">
              <Lock size={16} className="text-deep-navy/40 dark:text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-transparent text-sm outline-none placeholder:text-deep-navy/30 dark:placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="shrink-0 text-deep-navy/40 hover:text-deep-navy/70 dark:text-white/40 dark:hover:text-white/70"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">
              Confirm new password
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/10">
              <Lock size={16} className="text-deep-navy/40 dark:text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full bg-transparent text-sm outline-none placeholder:text-deep-navy/30 dark:placeholder:text-white/30"
              />
            </div>
          </label>

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          )}

          <GlassButton type="submit" size="lg" loading={loading} className="mt-2 w-full">
            Reset password
          </GlassButton>
        </form>
      )}
    </GlassPanel>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
