'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, User, Building2, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { GlassPanel, GlassButton } from '@/components/glass';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

const inputClass =
  'w-full bg-transparent text-sm outline-none placeholder:text-deep-navy/30 dark:placeholder:text-white/30';
const fieldWrapClass =
  'flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/10';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);

  const [invitePreview, setInvitePreview] = useState<{ email: string; organizationName: string; role: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    organizationName: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    apiClient
      .get(`/organizations/invites/preview/${inviteToken}`)
      .then((res) => {
        setInvitePreview(res.data);
        setForm((f) => ({ ...f, email: res.data.email }));
      })
      .catch(() => setInviteError('This invite link is invalid or has expired.'));
  }, [inviteToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post('/auth/register', {
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        ...(inviteToken ? { inviteToken } : { organizationName: form.organizationName }),
      });
      setAccessToken(res.data.accessToken);

      const me = await apiClient.get('/auth/me');
      setUser(me.data);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Unable to create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <GlassPanel className="w-full max-w-md" animate>
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 h-14 w-14 overflow-hidden rounded-2xl shadow-[0_8px_24px_rgba(10,132,255,0.4)]">
            <Image src="/logo.png" alt="WA Platform" width={56} height={56} className="h-full w-full object-cover" priority />
          </div>
          <h1 className="text-xl font-semibold text-deep-navy dark:text-white">
            {invitePreview ? `Join ${invitePreview.organizationName}` : 'Create your workspace'}
          </h1>
          <p className="mt-1 text-sm text-deep-navy/60 dark:text-white/60">
            {invitePreview
              ? `You've been invited as ${invitePreview.role.toLowerCase()}`
              : 'Set up your organization and get started'}
          </p>
        </div>

        {inviteError && (
          <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{inviteError}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">First name</span>
              <div className={fieldWrapClass}>
                <User size={16} className="text-deep-navy/40 dark:text-white/40" />
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className={inputClass}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">Last name</span>
              <div className={fieldWrapClass}>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className={inputClass}
                />
              </div>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">Email</span>
            <div className={fieldWrapClass}>
              <Mail size={16} className="text-deep-navy/40 dark:text-white/40" />
              <input
                type="email"
                required
                readOnly={Boolean(invitePreview)}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@company.com"
                className={`${inputClass} ${invitePreview ? 'opacity-60' : ''}`}
              />
            </div>
          </label>

          {!inviteToken && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">
                Organization name
              </span>
              <div className={fieldWrapClass}>
                <Building2 size={16} className="text-deep-navy/40 dark:text-white/40" />
                <input
                  required
                  value={form.organizationName}
                  onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                  placeholder="Acme Inc"
                  className={inputClass}
                />
              </div>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">Password</span>
            <div className={fieldWrapClass}>
              <Lock size={16} className="text-deep-navy/40 dark:text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                className={inputClass}
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
            {invitePreview ? 'Accept invite & create account' : 'Create account'}
          </GlassButton>
        </form>

        <p className="mt-6 text-center text-xs text-deep-navy/50 dark:text-white/40">
          Already have an account?{' '}
          <a href="/login" className="text-electric hover:underline">
            Sign in
          </a>
        </p>
      </GlassPanel>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
