'use client';

import { useState } from 'react';
import { Plus, Rocket, Trash2, Megaphone, Check, Pencil } from 'lucide-react';
import { GlassCard, GlassButton, GlassDialog, GlassSelect } from '@/components/glass';
import { useTemplates } from '@/hooks/api/templates';
import { useTags } from '@/hooks/api/contacts';
import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useLaunchCampaign,
  useDeleteCampaign,
  CampaignType,
  Campaign,
} from '@/hooks/api/campaigns';

const inputClass =
  'w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30';

const CAMPAIGN_TYPES: CampaignType[] = [
  'WELCOME',
  'REMINDER',
  'PROMOTION',
  'NEWSLETTER',
  'FESTIVAL_GREETING',
  'FOLLOW_UP',
  'CUSTOM',
];

const STATUS_STYLES: Record<Campaign['status'], string> = {
  DRAFT: 'bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/60',
  SCHEDULED: 'bg-amber/10 text-amber',
  RUNNING: 'bg-electric/10 text-electric',
  PAUSED: 'bg-amber/10 text-amber',
  COMPLETED: 'bg-emerald/10 text-emerald',
  CANCELLED: 'bg-danger/10 text-danger',
};

const STEPS = ['Recipients', 'Template', 'Review'] as const;

export default function CampaignsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState<CampaignType>('PROMOTION');
  const [audienceType, setAudienceType] = useState<'ALL_CONTACTS' | 'TAG'>('ALL_CONTACTS');
  const [tagId, setTagId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [launchError, setLaunchError] = useState<{ id: string; message: string } | null>(null);

  const { data: campaigns, isLoading } = useCampaigns();
  const { data: templates } = useTemplates();
  const { data: tags } = useTags();
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const launchCampaign = useLaunchCampaign();
  const deleteCampaign = useDeleteCampaign();

  function resetWizard() {
    setStep(0);
    setName('');
    setType('PROMOTION');
    setAudienceType('ALL_CONTACTS');
    setTagId('');
    setTemplateId('');
    setEditingId(null);
  }

  function openCreateWizard() {
    resetWizard();
    setWizardOpen(true);
  }

  function openEditWizard(campaign: Campaign) {
    setEditingId(campaign.id);
    setStep(0);
    setName(campaign.name);
    setType(campaign.type);
    // Audience details aren't returned on the list endpoint beyond count,
    // so editing keeps whatever audience type was already set rather than
    // guessing — the person can still change it explicitly if they want to.
    setAudienceType('ALL_CONTACTS');
    setTemplateId(campaign.template?.id ?? '');
    setWizardOpen(true);
  }

  async function handleCreateAndClose() {
    const payload = {
      name,
      type,
      templateId: templateId || undefined,
      audienceType,
      audienceRef: audienceType === 'TAG' ? { tagId } : {},
    };
    if (editingId) {
      await updateCampaign.mutateAsync({ id: editingId, ...payload });
    } else {
      await createCampaign.mutateAsync(payload);
    }
    resetWizard();
    setWizardOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Campaigns</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Build, review, and launch bulk sends to your audience.
          </p>
        </div>
        <GlassButton icon={<Plus size={16} />} onClick={openCreateWizard}>
          New Campaign
        </GlassButton>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && <GlassCard>Loading campaigns…</GlassCard>}
        {!isLoading && campaigns?.length === 0 && (
          <GlassCard className="lg:col-span-3">No campaigns yet — build your first one with the wizard.</GlassCard>
        )}
        {campaigns?.map((campaign) => (
          <GlassCard
            key={campaign.id}
            variant="lite"
            icon={<Megaphone size={18} />}
            title={campaign.name}
            subtitle={`${campaign.type.replace('_', ' ')} · ${campaign._count.recipients} recipients`}
            actions={
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[campaign.status]}`}>
                {campaign.status.toLowerCase()}
              </span>
            }
          >
            <div className="mb-4 grid grid-cols-4 gap-2 text-center text-xs">
              {(['sent', 'delivered', 'read', 'failed'] as const).map((key) => (
                <div key={key} className="rounded-lg bg-black/5 py-2 dark:bg-white/10">
                  <p className="text-sm font-semibold text-deep-navy dark:text-white">{campaign.stats[key]}</p>
                  <p className="text-deep-navy/50 dark:text-white/40">{key}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                  <GlassButton
                    size="sm"
                    icon={<Rocket size={14} />}
                    loading={launchCampaign.isPending}
                    onClick={() => {
                      setLaunchError(null);
                      launchCampaign.mutate(campaign.id, {
                        onError: (err: any) => {
                          setLaunchError({
                            id: campaign.id,
                            message:
                              err?.response?.data?.message ?? 'Launch failed — please try again.',
                          });
                        },
                      });
                    }}
                  >
                    Launch
                  </GlassButton>
                )}
                {campaign.status === 'DRAFT' && (
                  <GlassButton
                    variant="secondary"
                    size="sm"
                    icon={<Pencil size={14} />}
                    onClick={() => openEditWizard(campaign)}
                  >
                    Edit
                  </GlassButton>
                )}
                {campaign.status !== 'RUNNING' && (
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={() => deleteCampaign.mutate(campaign.id)}
                  >
                    Delete
                  </GlassButton>
                )}
              </div>
              {launchError?.id === campaign.id && (
                <p className="text-xs text-danger">{launchError.message}</p>
              )}
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassDialog
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          resetWizard();
        }}
        title={editingId ? 'Edit Campaign' : 'New Campaign'}
        maxWidthClassName="max-w-xl"
      >
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((label, idx) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  idx <= step ? 'bg-electric text-white' : 'bg-black/5 text-deep-navy/40 dark:bg-white/10 dark:text-white/40'
                }`}
              >
                {idx < step ? <Check size={14} /> : idx + 1}
              </div>
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/60">{label}</span>
              {idx < STEPS.length - 1 && <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-3">
            <input
              required
              placeholder="Campaign name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">Campaign type</span>
              <GlassSelect
                value={type}
                onChange={(v) => setType(v as CampaignType)}
                options={CAMPAIGN_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">Audience</span>
              <GlassSelect
                value={audienceType}
                onChange={(v) => {
                  setAudienceType(v as 'ALL_CONTACTS' | 'TAG');
                  if (v !== 'TAG') setTagId('');
                }}
                options={[
                  { value: 'ALL_CONTACTS', label: 'All opted-in contacts' },
                  { value: 'TAG', label: 'Contacts with a specific tag' },
                ]}
              />
            </label>
            {audienceType === 'TAG' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">Which tag?</span>
                <GlassSelect
                  value={tagId}
                  onChange={setTagId}
                  placeholder="Choose a tag"
                  options={tags?.map((t) => ({ value: t.id, label: t.name })) ?? []}
                />
                {tags?.length === 0 && (
                  <p className="text-xs text-amber">
                    No tags exist yet — create one from a contact first, or choose “All opted-in contacts” instead.
                  </p>
                )}
              </label>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">Message template</span>
              <GlassSelect
                value={templateId}
                onChange={setTemplateId}
                placeholder="No template — plain text"
                options={[
                  { value: '', label: 'No template — plain text' },
                  ...(templates?.map((t) => ({ value: t.id, label: t.name })) ?? []),
                ]}
              />
            </label>
            {templates?.length === 0 && (
              <p className="text-xs text-deep-navy/50 dark:text-white/40">
                No templates yet — create one on the Templates page first, or continue without one.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2 text-sm text-deep-navy/80 dark:text-white/80">
            <p>
              <span className="font-medium">Name:</span> {name || '—'}
            </p>
            <p>
              <span className="font-medium">Type:</span> {type.replace('_', ' ')}
            </p>
            <p>
              <span className="font-medium">Audience:</span>{' '}
              {audienceType === 'ALL_CONTACTS' ? 'All opted-in contacts' : 'Tagged contacts'}
            </p>
            <p>
              <span className="font-medium">Template:</span>{' '}
              {templates?.find((t) => t.id === templateId)?.name ?? 'Plain text'}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <GlassButton
            variant="secondary"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </GlassButton>
          {step < STEPS.length - 1 ? (
            <GlassButton
              disabled={(step === 0 && !name) || (step === 0 && audienceType === 'TAG' && !tagId)}
              onClick={() => setStep((s) => s + 1)}
            >
              Next
            </GlassButton>
          ) : (
            <GlassButton
              loading={createCampaign.isPending || updateCampaign.isPending}
              onClick={handleCreateAndClose}
            >
              {editingId ? 'Save Changes' : 'Create Campaign'}
            </GlassButton>
          )}
        </div>
      </GlassDialog>
    </div>
  );
}
