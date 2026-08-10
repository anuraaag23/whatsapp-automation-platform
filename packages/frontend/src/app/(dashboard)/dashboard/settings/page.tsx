'use client';

import { useState } from 'react';
import { CheckCircle2, KeyRound, Link2, Mail, MessageCircle as SlackIcon, Plus, Send, Trash2, Unlink, Building2, UserPlus, Activity } from 'lucide-react';
import { GlassCard, GlassButton, GlassSelect } from '@/components/glass';
import {
  useWhatsappAccount,
  useWhatsappAccountStatus,
  useConnectWhatsapp,
  useOrganization,
  useUpdateOrganization,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/hooks/api/settings';
import {
  useMyOrganizations,
  useCreateOrganization,
  useOrgMembers,
  useInviteMember,
  useRemoveMember,
  usePendingInvites,
  useRevokeInvite,
} from '@/hooks/api/organizations';
import type { Role } from '@/hooks/api/users';

const inputClass =
  'w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30';

export default function SettingsPage() {
  const { data: account } = useWhatsappAccount();
  const { data: liveStatus, isLoading: statusLoading, isError: statusError } = useWhatsappAccountStatus(Boolean(account));
  const connectWhatsapp = useConnectWhatsapp();
  const { data: org } = useOrganization();
  const updateOrg = useUpdateOrganization();
  const { data: apiKeys } = useApiKeys();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();

  const { data: notifSettings } = useNotificationSettings();
  const updateNotifSettings = useUpdateNotificationSettings();
  const [emailForm, setEmailForm] = useState({ smtpHost: '', smtpPort: '587', smtpUser: '', smtpPassword: '', smtpFromAddress: '', notifyEmailTo: '' });
  const [slackForm, setSlackForm] = useState({ slackWebhookUrl: '' });
  const [telegramForm, setTelegramForm] = useState({ telegramBotToken: '', telegramChatId: '' });

  const { data: myOrgs } = useMyOrganizations();
  const createOrganization = useCreateOrganization();
  const [newOrgName, setNewOrgName] = useState('');

  const { data: members } = useOrgMembers();
  const inviteMember = useInviteMember();
  const removeMember = useRemoveMember();
  const { data: pendingInvites } = usePendingInvites();
  const revokeInvite = useRevokeInvite();
  const [inviteForm, setInviteForm] = useState<{ email: string; role: Role }>({ email: '', role: 'VIEWER' });

  const [waForm, setWaForm] = useState({
    businessAccountId: '',
    phoneNumberId: '',
    displayPhoneNumber: '',
    accessToken: '',
  });
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    await connectWhatsapp.mutateAsync(waForm);
    setWaForm({ businessAccountId: '', phoneNumberId: '', displayPhoneNumber: '', accessToken: '' });
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    const result = await createApiKey.mutateAsync(newKeyName);
    setRevealedKey(result.key);
    setNewKeyName('');
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Settings</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Company profile, WhatsApp Business connection, and API access.
        </p>
      </div>

      <GlassCard variant="lite" icon={<Link2 size={18} />} title="WhatsApp Business Account" subtitle="Official Cloud API connection">
        {account ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-emerald">
              <CheckCircle2 size={16} /> Connected — {account.displayPhoneNumber}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-deep-navy/60 dark:text-white/50">
              <p>Business Account ID: {account.businessAccountId}</p>
              <p>Phone Number ID: {account.phoneNumberId}</p>
              <p>API Version: {account.apiVersion}</p>
              <p>Access token: {account.hasAccessToken ? 'stored (encrypted)' : 'missing'}</p>
            </div>

            <div className="rounded-xl bg-black/5 p-3 dark:bg-white/10">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-deep-navy/70 dark:text-white/60">
                <Activity size={13} /> Live status from Meta
              </div>
              {statusLoading && (
                <p className="text-xs text-deep-navy/40 dark:text-white/30">Checking…</p>
              )}
              {statusError && (
                <p className="text-xs text-danger">
                  Couldn&apos;t reach Meta — the access token may be invalid or expired.
                </p>
              )}
              {liveStatus && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p className="text-deep-navy/60 dark:text-white/50">
                    Quality rating:{' '}
                    <span
                      className={`font-medium ${
                        liveStatus.qualityRating === 'GREEN'
                          ? 'text-emerald'
                          : liveStatus.qualityRating === 'YELLOW'
                            ? 'text-amber'
                            : liveStatus.qualityRating === 'RED'
                              ? 'text-danger'
                              : 'text-deep-navy/40 dark:text-white/30'
                      }`}
                    >
                      {liveStatus.qualityRating}
                    </span>
                  </p>
                  <p className="text-deep-navy/60 dark:text-white/50">
                    Messaging tier: <span className="font-medium">{liveStatus.messagingLimitTier}</span>
                  </p>
                  <p className="text-deep-navy/60 dark:text-white/50">
                    Verified name: <span className="font-medium">{liveStatus.verifiedName || '—'}</span>
                  </p>
                  <p className="text-deep-navy/60 dark:text-white/50">
                    Verification: <span className="font-medium">{liveStatus.codeVerificationStatus}</span>
                  </p>
                </div>
              )}
            </div>

            <GlassButton variant="ghost" size="sm" icon={<Unlink size={14} />} className="w-fit">
              Disconnect
            </GlassButton>
          </div>
        ) : (
          <form onSubmit={handleConnect} className="flex flex-col gap-3">
            <p className="text-xs text-deep-navy/60 dark:text-white/50">
              From your Meta App dashboard: developers.facebook.com → WhatsApp → API Setup
            </p>
            <input
              required
              placeholder="Business Account ID"
              value={waForm.businessAccountId}
              onChange={(e) => setWaForm({ ...waForm, businessAccountId: e.target.value })}
              className={inputClass}
            />
            <input
              required
              placeholder="Phone Number ID"
              value={waForm.phoneNumberId}
              onChange={(e) => setWaForm({ ...waForm, phoneNumberId: e.target.value })}
              className={inputClass}
            />
            <input
              required
              placeholder="Display phone number (+1234567890)"
              value={waForm.displayPhoneNumber}
              onChange={(e) => setWaForm({ ...waForm, displayPhoneNumber: e.target.value })}
              className={inputClass}
            />
            <input
              required
              type="password"
              placeholder="Permanent access token"
              value={waForm.accessToken}
              onChange={(e) => setWaForm({ ...waForm, accessToken: e.target.value })}
              className={inputClass}
            />
            <GlassButton type="submit" loading={connectWhatsapp.isPending} className="w-fit">
              Connect Account
            </GlassButton>
          </form>
        )}
      </GlassCard>

      <GlassCard variant="lite" title="Company Profile">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateOrg.mutate({ name: orgName || org?.name });
          }}
          className="flex flex-col gap-3 sm:max-w-sm"
        >
          <input
            placeholder={org?.name ?? 'Organization name'}
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className={inputClass}
          />
          <GlassButton type="submit" size="sm" loading={updateOrg.isPending} className="w-fit">
            Save
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard variant="lite" icon={<Building2 size={18} />} title="Organizations" subtitle="Workspaces you belong to and team members">
        <div className="mb-5 flex flex-col gap-2">
          {myOrgs?.map((o) => (
            <div key={o.organization.id} className="flex items-center justify-between rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
              <span className="text-deep-navy/80 dark:text-white/80">{o.organization.name}</span>
              <span className="text-xs text-deep-navy/40 dark:text-white/30">{o.role}</span>
            </div>
          ))}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await createOrganization.mutateAsync(newOrgName);
            setNewOrgName('');
          }}
          className="mb-6 flex gap-2"
        >
          <input
            required
            placeholder="New organization name"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            className={inputClass}
          />
          <GlassButton type="submit" size="sm" icon={<Plus size={14} />} loading={createOrganization.isPending}>
            Create
          </GlassButton>
        </form>

        <p className="mb-2 text-xs font-semibold text-deep-navy/60 dark:text-white/50">
          Members of this organization
        </p>
        <div className="mb-4 flex flex-col gap-2">
          {members?.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
              <div>
                <p className="text-deep-navy/80 dark:text-white/80">{m.user.firstName} {m.user.lastName}</p>
                <p className="text-xs text-deep-navy/40 dark:text-white/30">{m.user.email} · {m.role}</p>
              </div>
              {m.role !== 'OWNER' && (
                <button onClick={() => removeMember.mutate(m.user.id)} className="text-deep-navy/30 hover:text-danger dark:text-white/30">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {pendingInvites && pendingInvites.length > 0 && (
          <>
            <p className="mb-2 text-xs font-semibold text-deep-navy/60 dark:text-white/50">
              Pending invites
            </p>
            <div className="mb-4 flex flex-col gap-2">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-lg bg-amber/10 px-3 py-2 text-sm">
                  <div>
                    <p className="text-deep-navy/80 dark:text-white/80">{invite.email}</p>
                    <p className="text-xs text-deep-navy/40 dark:text-white/30">
                      Invited as {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button onClick={() => revokeInvite.mutate(invite.id)} className="text-deep-navy/30 hover:text-danger dark:text-white/30">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await inviteMember.mutateAsync(inviteForm);
            setInviteForm({ email: '', role: 'VIEWER' });
          }}
          className="flex gap-2"
        >
          <input
            required
            type="email"
            placeholder="Invite by email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            className={inputClass}
          />
          <GlassSelect
            value={inviteForm.role}
            onChange={(value) => setInviteForm({ ...inviteForm, role: value as Role })}
            options={(['ADMIN', 'MANAGER', 'SUPPORT', 'VIEWER'] as Role[]).map((r) => ({ value: r, label: r }))}
            className="w-32"
          />
          <GlassButton type="submit" size="sm" icon={<UserPlus size={14} />} loading={inviteMember.isPending}>
            Invite
          </GlassButton>
        </form>
      </GlassCard>

      <GlassCard variant="lite" icon={<KeyRound size={18} />} title="API Keys">
        <form onSubmit={handleCreateKey} className="mb-4 flex gap-2">
          <input
            required
            placeholder="Key name (e.g. Zapier integration)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className={inputClass}
          />
          <GlassButton type="submit" size="sm" icon={<Plus size={14} />} loading={createApiKey.isPending}>
            Create
          </GlassButton>
        </form>

        {revealedKey && (
          <p className="mb-4 rounded-lg bg-amber/10 px-3 py-2 text-xs text-amber">
            Copy this now — it won&apos;t be shown again: <code className="font-mono">{revealedKey}</code>
          </p>
        )}

        <div className="flex flex-col gap-2">
          {apiKeys?.length === 0 && (
            <p className="text-sm text-deep-navy/50 dark:text-white/40">No API keys yet.</p>
          )}
          {apiKeys?.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10"
            >
              <span className="text-deep-navy/80 dark:text-white/80">{key.name}</span>
              <button
                type="button"
                onClick={() => revokeApiKey.mutate(key.id)}
                className="text-deep-navy/30 hover:text-danger dark:text-white/30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard variant="lite" title="Notification Channels" subtitle="Deliver alerts to email, Slack, or Telegram in addition to in-app">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-electric" />
              <span className="text-sm font-medium text-deep-navy dark:text-white">Email (SMTP)</span>
              {notifSettings?.emailEnabled && <CheckCircle2 size={14} className="text-emerald" />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="SMTP host" value={emailForm.smtpHost} onChange={(e) => setEmailForm({ ...emailForm, smtpHost: e.target.value })} className={inputClass} />
              <input placeholder="Port (587)" value={emailForm.smtpPort} onChange={(e) => setEmailForm({ ...emailForm, smtpPort: e.target.value })} className={inputClass} />
              <input placeholder="SMTP user" value={emailForm.smtpUser} onChange={(e) => setEmailForm({ ...emailForm, smtpUser: e.target.value })} className={inputClass} />
              <input type="password" placeholder="SMTP password" value={emailForm.smtpPassword} onChange={(e) => setEmailForm({ ...emailForm, smtpPassword: e.target.value })} className={inputClass} />
              <input placeholder="From address" value={emailForm.smtpFromAddress} onChange={(e) => setEmailForm({ ...emailForm, smtpFromAddress: e.target.value })} className={inputClass} />
              <input placeholder="Send alerts to" value={emailForm.notifyEmailTo} onChange={(e) => setEmailForm({ ...emailForm, notifyEmailTo: e.target.value })} className={inputClass} />
            </div>
            <GlassButton
              size="sm"
              className="w-fit"
              loading={updateNotifSettings.isPending}
              onClick={() =>
                updateNotifSettings.mutate({
                  emailEnabled: true,
                  smtpHost: emailForm.smtpHost,
                  smtpPort: Number(emailForm.smtpPort),
                  smtpUser: emailForm.smtpUser,
                  smtpPassword: emailForm.smtpPassword || undefined,
                  smtpFromAddress: emailForm.smtpFromAddress,
                  notifyEmailTo: emailForm.notifyEmailTo,
                })
              }
            >
              Save &amp; Enable Email
            </GlassButton>
          </div>

          <div className="flex flex-col gap-3 border-t border-black/5 pt-4 dark:border-white/10">
            <div className="flex items-center gap-2">
              <SlackIcon size={16} className="text-electric" />
              <span className="text-sm font-medium text-deep-navy dark:text-white">Slack</span>
              {notifSettings?.slackEnabled && <CheckCircle2 size={14} className="text-emerald" />}
            </div>
            <input
              placeholder="Slack incoming webhook URL"
              value={slackForm.slackWebhookUrl}
              onChange={(e) => setSlackForm({ slackWebhookUrl: e.target.value })}
              className={inputClass}
            />
            <GlassButton
              size="sm"
              className="w-fit"
              loading={updateNotifSettings.isPending}
              onClick={() => updateNotifSettings.mutate({ slackEnabled: true, slackWebhookUrl: slackForm.slackWebhookUrl })}
            >
              Save &amp; Enable Slack
            </GlassButton>
          </div>

          <div className="flex flex-col gap-3 border-t border-black/5 pt-4 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Send size={16} className="text-electric" />
              <span className="text-sm font-medium text-deep-navy dark:text-white">Telegram</span>
              {notifSettings?.telegramEnabled && <CheckCircle2 size={14} className="text-emerald" />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                placeholder="Bot token"
                value={telegramForm.telegramBotToken}
                onChange={(e) => setTelegramForm({ ...telegramForm, telegramBotToken: e.target.value })}
                className={inputClass}
              />
              <input
                placeholder="Chat ID"
                value={telegramForm.telegramChatId}
                onChange={(e) => setTelegramForm({ ...telegramForm, telegramChatId: e.target.value })}
                className={inputClass}
              />
            </div>
            <GlassButton
              size="sm"
              className="w-fit"
              loading={updateNotifSettings.isPending}
              onClick={() =>
                updateNotifSettings.mutate({
                  telegramEnabled: true,
                  telegramBotToken: telegramForm.telegramBotToken || undefined,
                  telegramChatId: telegramForm.telegramChatId,
                })
              }
            >
              Save &amp; Enable Telegram
            </GlassButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
