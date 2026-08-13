'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageSquare, Plus, Image as ImageIcon, Type } from 'lucide-react';
import { GlassCard, GlassButton, GlassDialog, GlassSelect } from '@/components/glass';
import { useMessages, useSendMessage } from '@/hooks/api/messages';
import { useContacts } from '@/hooks/api/contacts';

const STATUS_STYLES: Record<string, string> = {
  QUEUED: 'bg-amber/10 text-amber',
  SENT: 'bg-electric/10 text-electric',
  DELIVERED: 'bg-emerald/10 text-emerald',
  READ: 'bg-emerald/10 text-emerald',
  FAILED: 'bg-danger/10 text-danger',
};

const FILTERS = [
  { label: 'All', value: undefined },
  { label: 'Sent', value: 'SENT' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Read', value: 'READ' },
  { label: 'Failed', value: 'FAILED' },
];

export default function MessagesPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { data, isLoading } = useMessages(status);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    contactId: string;
    type: 'TEXT' | 'IMAGE';
    body: string;
    imageUrl: string;
    caption: string;
  }>({ contactId: '', type: 'TEXT', body: '', imageUrl: '', caption: '' });

  const { data: contactsData } = useContacts('');
  const sendMessage = useSendMessage();

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setComposeError(null);
    try {
      await sendMessage.mutateAsync({
        contactId: form.contactId,
        type: form.type,
        body: form.type === 'TEXT' ? form.body : undefined,
        imageUrl: form.type === 'IMAGE' ? form.imageUrl : undefined,
        caption: form.type === 'IMAGE' ? form.caption || undefined : undefined,
      });
      setForm({ contactId: '', type: 'TEXT', body: '', imageUrl: '', caption: '' });
      setComposeOpen(false);
    } catch (err: any) {
      setComposeError(err?.response?.data?.message ?? 'Could not send that message. Try again.');
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Messages</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Every message sent and received through your connected WhatsApp account.
          </p>
        </div>
        <GlassButton size="sm" icon={<Plus size={14} />} onClick={() => setComposeOpen(true)}>
          Send Message
        </GlassButton>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatus(f.value)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
              status === f.value
                ? 'bg-electric text-white'
                : 'bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <GlassCard variant="lite" padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-deep-navy/50 dark:border-white/10 dark:text-white/40">
                <th className="px-4 py-3 font-medium" />
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/40">
                    Loading messages…
                  </td>
                </tr>
              )}
              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-deep-navy/40 dark:text-white/40">
                    <MessageSquare className="mx-auto mb-2 opacity-30" size={24} />
                    No messages yet — they&apos;ll show up here once campaigns, schedules, or automations send something.
                  </td>
                </tr>
              )}
              {data?.items.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">
                    {m.direction === 'OUTBOUND' ? (
                      <ArrowUpRight size={14} className="text-electric" />
                    ) : (
                      <ArrowDownLeft size={14} className="text-emerald" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-deep-navy dark:text-white">
                    {m.contact.firstName || m.contact.lastName
                      ? `${m.contact.firstName ?? ''} ${m.contact.lastName ?? ''}`.trim()
                      : m.contact.phoneNumber}
                  </td>
                  <td className="px-4 py-3 text-deep-navy/60 dark:text-white/50">{m.type}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[m.status]}`}>
                      {m.status.toLowerCase()}
                    </span>
                    {m.errorMessage && (
                      <p className="mt-0.5 text-[11px] text-danger">{m.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-deep-navy/40 dark:text-white/30">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassDialog open={composeOpen} onClose={() => setComposeOpen(false)} title="Send Message">
        <form onSubmit={handleSend} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">To</span>
            <GlassSelect
              value={form.contactId}
              onChange={(contactId) => setForm({ ...form, contactId })}
              placeholder="Select a contact…"
              options={(contactsData?.items ?? []).map((c) => ({
                value: c.id,
                label: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.phoneNumber,
              }))}
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, type: 'TEXT' })}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium ${
                form.type === 'TEXT'
                  ? 'bg-electric text-white'
                  : 'bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/50'
              }`}
            >
              <Type size={13} /> Text
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, type: 'IMAGE' })}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium ${
                form.type === 'IMAGE'
                  ? 'bg-electric text-white'
                  : 'bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/50'
              }`}
            >
              <ImageIcon size={13} /> Image
            </button>
          </div>

          {form.type === 'TEXT' ? (
            <textarea
              required
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Type your message…"
              className="w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30"
            />
          ) : (
            <>
              <input
                required
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="Image URL (must be a public link)"
                className="w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30"
              />
              <input
                value={form.caption}
                onChange={(e) => setForm({ ...form, caption: e.target.value })}
                placeholder="Caption (optional)"
                className="w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30"
              />
              <p className="text-[11px] text-deep-navy/40 dark:text-white/30">
                WhatsApp needs a publicly accessible image link — not a file from your device. Upload it
                somewhere first (e.g. your own site, an image host) and paste the link here.
              </p>
            </>
          )}

          {composeError && <p className="text-xs text-danger">{composeError}</p>}

          <GlassButton
            type="submit"
            loading={sendMessage.isPending}
            disabled={!form.contactId}
            className="mt-2"
          >
            Send
          </GlassButton>
        </form>
      </GlassDialog>
    </div>
  );
}
