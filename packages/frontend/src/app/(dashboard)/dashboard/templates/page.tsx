'use client';

import { useState } from 'react';
import { Plus, Send, Trash2, FileText, History, CheckCircle2, XCircle, Clock, Pencil } from 'lucide-react';
import { GlassCard, GlassButton, GlassDialog, GlassSelect } from '@/components/glass';
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useSubmitTemplate,
  useTemplateHistory,
  MessageTemplate,
} from '@/hooks/api/templates';

const inputClass =
  'w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30';

const STATUS_STYLES: Record<MessageTemplate['waStatus'], string> = {
  DRAFT: 'bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/60',
  PENDING: 'bg-amber/10 text-amber',
  APPROVED: 'bg-emerald/10 text-emerald',
  REJECTED: 'bg-danger/10 text-danger',
  PAUSED: 'bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/60',
};

const SAMPLE_DATA = { first_name: 'Alex', last_name: 'Rivera', company: 'Acme Inc', city: 'Varanasi', date: new Date().toLocaleDateString() };

function renderPreview(body: string) {
  return body.replace(/{{\s*(\w+)\s*}}/g, (_m, key) => (SAMPLE_DATA as Record<string, string>)[key] ?? `{{${key}}}`);
}

export default function TemplatesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    category: 'UTILITY' as MessageTemplate['category'],
    language: 'en_US',
    bodyText: '',
    footerText: '',
  });

  const { data: templates, isLoading } = useTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const submitTemplate = useSubmitTemplate();
  const [historyTemplateId, setHistoryTemplateId] = useState<string | null>(null);
  // submitTemplate's mutation always resolves 2xx even when nothing actually
  // happened — the backend deliberately returns { submitted: false, reason }
  // instead of throwing when there's no WhatsApp account connected yet, so
  // that "no account" isn't treated as a hard error. But that also means
  // react-query's onSuccess fires either way, and without reading the body,
  // clicking "Submit for approval" looked like it did nothing at all.
  const [submitFeedback, setSubmitFeedback] = useState<{ id: string; message: string; ok: boolean } | null>(null);
  const { data: history } = useTemplateHistory(historyTemplateId);

  function openCreateDialog() {
    setEditingId(null);
    setForm({ name: '', category: 'UTILITY', language: 'en_US', bodyText: '', footerText: '' });
    setCreateOpen(true);
  }

  function openEditDialog(template: MessageTemplate) {
    setEditingId(template.id);
    setForm({
      name: template.name,
      category: template.category,
      language: template.language,
      bodyText: template.bodyText,
      footerText: template.footerText ?? '',
    });
    setCreateOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const variables = Array.from(form.bodyText.matchAll(/{{\s*(\w+)\s*}}/g)).map((m) => m[1]);
    const payload = { ...form, variables: Array.from(new Set(variables)) };
    if (editingId) {
      await updateTemplate.mutateAsync({ id: editingId, ...payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    setForm({ name: '', category: 'UTILITY', language: 'en_US', bodyText: '', footerText: '' });
    setEditingId(null);
    setCreateOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Templates</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Approved-template messages for the official WhatsApp Business Platform.
          </p>
        </div>
        <GlassButton icon={<Plus size={16} />} onClick={openCreateDialog}>
          New Template
        </GlassButton>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && <GlassCard variant="lite">Loading templates…</GlassCard>}
        {!isLoading && templates?.length === 0 && (
          <GlassCard variant="lite" className="lg:col-span-3">
            No templates yet. Create one — variables like <code>{'{{first_name}}'}</code> render live in the
            preview below.
          </GlassCard>
        )}
        {templates?.map((template) => (
          <GlassCard
            key={template.id}
            variant="lite"
            icon={<FileText size={18} />}
            title={template.name}
            subtitle={`${template.category} · ${template.language}`}
            actions={
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[template.waStatus]}`}>
                {template.waStatus.toLowerCase()}
              </span>
            }
          >
            <p className="mb-3 text-sm text-deep-navy/70 dark:text-white/70">{template.bodyText}</p>
            <div className="mb-4 rounded-lg bg-black/5 p-3 text-xs text-deep-navy/60 dark:bg-white/10 dark:text-white/50">
              <span className="font-medium">Preview: </span>
              {renderPreview(template.bodyText)}
            </div>
            <div className="flex gap-2">
              <GlassButton
                variant="secondary"
                size="sm"
                icon={<Send size={14} />}
                loading={submitTemplate.isPending}
                onClick={() =>
                  submitTemplate.mutate(template.id, {
                    onSuccess: (data) =>
                      setSubmitFeedback({
                        id: template.id,
                        ok: data.submitted,
                        message: data.submitted
                          ? 'Submitted to Meta for approval.'
                          : (data.reason ?? 'Could not submit — connect a WhatsApp Business account in Settings first.'),
                      }),
                    onError: () =>
                      setSubmitFeedback({
                        id: template.id,
                        ok: false,
                        message: 'Something went wrong submitting this template. Try again.',
                      }),
                  })
                }
              >
                Submit for approval
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                icon={<Pencil size={14} />}
                onClick={() => openEditDialog(template)}
              >
                Edit
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                icon={<History size={14} />}
                onClick={() => setHistoryTemplateId(template.id)}
              >
                History
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => deleteTemplate.mutate(template.id)}
              >
                Delete
              </GlassButton>
            </div>
            {submitFeedback?.id === template.id && (
              <p
                className={`mt-2 text-xs ${
                  submitFeedback.ok
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {submitFeedback.message}
              </p>
            )}
          </GlassCard>
        ))}
      </div>

      <GlassDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditingId(null);
        }}
        title={editingId ? 'Edit Message Template' : 'New Message Template'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            required
            placeholder="Template name (e.g. order_confirmation)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <GlassSelect
              value={form.category}
              onChange={(value) => setForm({ ...form, category: value as MessageTemplate['category'] })}
              options={[
                { value: 'UTILITY', label: 'Utility' },
                { value: 'MARKETING', label: 'Marketing' },
                { value: 'AUTHENTICATION', label: 'Authentication' },
              ]}
            />
            <input
              placeholder="Language (en_US)"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className={inputClass}
            />
          </div>
          <textarea
            required
            rows={4}
            placeholder="Hi {{first_name}}, welcome to {{company}}!"
            value={form.bodyText}
            onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
            className={inputClass}
          />
          {form.bodyText && (
            <div className="rounded-lg bg-black/5 p-3 text-xs text-deep-navy/60 dark:bg-white/10 dark:text-white/50">
              <span className="font-medium">Live preview: </span>
              {renderPreview(form.bodyText)}
            </div>
          )}
          <input
            placeholder="Footer text (optional)"
            value={form.footerText}
            onChange={(e) => setForm({ ...form, footerText: e.target.value })}
            className={inputClass}
          />
          <GlassButton
            type="submit"
            loading={createTemplate.isPending || updateTemplate.isPending}
            className="mt-2"
          >
            {editingId ? 'Save Changes' : 'Create Template'}
          </GlassButton>
        </form>
      </GlassDialog>

      <GlassDialog open={Boolean(historyTemplateId)} onClose={() => setHistoryTemplateId(null)} title="Approval History">
        <div className="flex flex-col gap-3">
          {!history || history.length === 0 ? (
            <p className="text-sm text-deep-navy/50 dark:text-white/40">
              No status changes yet — history starts once you submit for approval.
            </p>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 rounded-xl bg-black/5 p-3 dark:bg-white/10">
                {entry.status === 'APPROVED' && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald" />}
                {entry.status === 'REJECTED' && <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />}
                {(entry.status === 'PENDING' || entry.status === 'DRAFT' || entry.status === 'PAUSED') && (
                  <Clock size={16} className="mt-0.5 shrink-0 text-amber" />
                )}
                <div>
                  <p className="text-sm font-medium text-deep-navy dark:text-white">{entry.status}</p>
                  {entry.note && <p className="text-xs text-deep-navy/60 dark:text-white/50">{entry.note}</p>}
                  <p className="text-[11px] text-deep-navy/40 dark:text-white/30">
                    {new Date(entry.changedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </GlassDialog>
    </div>
  );
}
