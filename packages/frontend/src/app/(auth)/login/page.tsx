'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { GlassPanel, GlassButton } from '@/components/glass';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post('/auth/login', { email, password });
      setAccessToken(res.data.accessToken);

      const me = await apiClient.get('/auth/me');
      setUser(me.data);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Unable to sign in. Please try again.');
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
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-deep-navy/60 dark:text-white/60">
            Sign in to your WhatsApp automation workspace
          </p>
        </div>

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

          <label className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">
                Password
              </span>
              <a href="/forgot-password" className="text-xs text-electric hover:underline">
                Forgot password?
              </a>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/10">
              <Lock size={16} className="text-deep-navy/40 dark:text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          )}

          <GlassButton type="submit" size="lg" loading={loading} className="mt-2 w-full">
            Sign in
          </GlassButton>
        </form>

        <p className="mt-6 text-center text-xs text-deep-navy/50 dark:text-white/40">
          Demo credentials (after seeding): owner@demo.com / ChangeMe123!
        </p>
        <p className="mt-2 text-center text-xs text-deep-navy/50 dark:text-white/40">
          New here?{' '}
          <a href="/register" className="text-electric hover:underline">
            Create an account
          </a>
        </p>
      </GlassPanel>
    </main>
  );
}
