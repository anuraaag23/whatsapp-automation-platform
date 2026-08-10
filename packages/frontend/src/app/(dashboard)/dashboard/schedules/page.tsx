'use client';

import { useState } from 'react';
import { Plus, Pause, Play, Copy, Trash2, Shuffle, Clock, Pencil } from 'lucide-react';
import { GlassCard, GlassButton, GlassDialog, GlassSelect } from '@/components/glass';
import {
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  usePauseSchedule,
  useResumeSchedule,
  useDuplicateSchedule,
  useDeleteSchedule,
  RecurrenceType,
  Schedule,
} from '@/hooks/api/schedules';

const inputClass =
  'w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30';

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'ONE_TIME', label: 'One Time' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
  { value: 'EVERY_X_HOURS', label: 'Every X Hours' },
  { value: 'EVERY_X_DAYS', label: 'Every X Days' },
  { value: 'BUSINESS_DAYS', label: 'Business Days' },
  { value: 'WEEKENDS', label: 'Weekends' },
];

const STATUS_STYLES: Record<Schedule['status'], string> = {
  ACTIVE: 'bg-emerald/10 text-emerald',
  PAUSED: 'bg-amber/10 text-amber',
  DISABLED: 'bg-black/5 text-deep-navy/60 dark:bg-white/10 dark:text-white/60',
  EXPIRED: 'bg-danger/10 text-danger',
};

export default function SchedulesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('DAILY');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [randomEnabled, setRandomEnabled] = useState(false);
  const [windowStart, setWindowStart] = useState('09:00');
  const [windowEnd, setWindowEnd] = useState('12:00');
  const [messagePoolText, setMessagePoolText] = useState('');

  const { data: schedules, isLoading } = useSchedules();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const pauseSchedule = usePauseSchedule();
  const resumeSchedule = useResumeSchedule();
  const duplicateSchedule = useDuplicateSchedule();
  const deleteSchedule = useDeleteSchedule();

  function resetForm() {
    setName('');
    setRecurrenceType('DAILY');
    setTimeOfDay('09:00');
    setRandomEnabled(false);
    setWindowStart('09:00');
    setWindowEnd('12:00');
    setMessagePoolText('');
    setEditingId(null);
  }

  function openCreateDialog() {
    resetForm();
    setCreateOpen(true);
  }

  function openEditDialog(schedule: Schedule) {
    setEditingId(schedule.id);
    setName(schedule.name);
    setRecurrenceType(schedule.recurrenceType);
    setTimeOfDay(schedule.timeOfDay ?? '09:00');
    setRandomEnabled(schedule.randomTimeEnabled);
    setWindowStart(schedule.randomWindowStart ?? '09:00');
    setWindowEnd(schedule.randomWindowEnd ?? '12:00');
    setMessagePoolText(schedule.messagePool.join('\n'));
    setCreateOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const messagePool = messagePoolText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const payload = {
      name,
      recurrenceType,
      timeOfDay: randomEnabled ? undefined : timeOfDay,
      randomTimeEnabled: randomEnabled,
      randomWindowStart: randomEnabled ? windowStart : undefined,
      randomWindowEnd: randomEnabled ? windowEnd : undefined,
      messagePool: messagePool.length ? messagePool : undefined,
      audienceType: 'ALL_CONTACTS' as const,
      audienceRef: {},
    };

    if (editingId) {
      await updateSchedule.mutateAsync({ id: editingId, ...payload });
    } else {
      await createSchedule.mutateAsync(payload);
    }

    resetForm();
    setCreateOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Schedules</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Recurring sends, random-time windows, and random-message rotation.
          </p>
        </div>
        <GlassButton icon={<Plus size={16} />} onClick={openCreateDialog}>
          New Schedule
        </GlassButton>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isLoading && <GlassCard>Loading schedules…</GlassCard>}
        {!isLoading && schedules?.length === 0 && (
          <GlassCard className="md:col-span-2">
            No schedules yet — the scheduler engine runs every minute in the background once you create one.
          </GlassCard>
        )}
        {schedules?.map((schedule) => (
          <GlassCard
            key={schedule.id}
            variant="lite"
            icon={schedule.randomTimeEnabled ? <Shuffle size={18} /> : <Clock size={18} />}
            title={schedule.name}
            subtitle={schedule.recurrenceType.replace(/_/g, ' ').toLowerCase()}
            actions={
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[schedule.status]}`}>
                {schedule.status.toLowerCase()}
              </span>
            }
          >
            <div className="mb-4 flex flex-col gap-1 text-xs text-deep-navy/60 dark:text-white/50">
              {schedule.randomTimeEnabled ? (
                <span>Random window: {schedule.randomWindowStart}–{schedule.randomWindowEnd}</span>
              ) : (
                <span>Time: {schedule.timeOfDay ?? '—'}</span>
              )}
              {schedule.messagePool.length > 0 && (
                <span>{schedule.messagePool.length} message(s) in rotation pool</span>
              )}
              <span>
                Next run: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : '—'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {schedule.status === 'ACTIVE' ? (
                <GlassButton
                  variant="secondary"
                  size="sm"
                  icon={<Pause size={14} />}
                  onClick={() => pauseSchedule.mutate(schedule.id)}
                >
                  Pause
                </GlassButton>
              ) : (
                <GlassButton
                  variant="secondary"
                  size="sm"
                  icon={<Play size={14} />}
                  onClick={() => resumeSchedule.mutate(schedule.id)}
                >
                  Resume
                </GlassButton>
              )}
              <GlassButton
                variant="secondary"
                size="sm"
                icon={<Pencil size={14} />}
                onClick={() => openEditDialog(schedule)}
              >
                Edit
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                icon={<Copy size={14} />}
                onClick={() => duplicateSchedule.mutate(schedule.id)}
              >
                Duplicate
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => deleteSchedule.mutate(schedule.id)}
              >
                Delete
              </GlassButton>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetForm();
        }}
        title={editingId ? 'Edit Schedule' : 'New Schedule'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            required
            placeholder="Schedule name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">Recurrence</span>
            <GlassSelect
              value={recurrenceType}
              onChange={(v) => setRecurrenceType(v as RecurrenceType)}
              options={RECURRENCE_OPTIONS}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-deep-navy/80 dark:text-white/80">
            <input
              type="checkbox"
              checked={randomEnabled}
              onChange={(e) => setRandomEnabled(e.target.checked)}
              className="h-4 w-4 rounded accent-electric"
            />
            Randomize send time within a window
          </label>

          {randomEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-deep-navy/60 dark:text-white/60">Window start</span>
                <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-deep-navy/60 dark:text-white/60">Window end</span>
                <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className={inputClass} />
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-deep-navy/60 dark:text-white/60">Time of day</span>
              <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={inputClass} />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-deep-navy/70 dark:text-white/70">
              Message pool (one per line — a random one is picked each send)
            </span>
            <textarea
              rows={4}
              placeholder={'Good Morning ☀️\nHave a Great Day ❤️\nStay Positive 💪'}
              value={messagePoolText}
              onChange={(e) => setMessagePoolText(e.target.value)}
              className={inputClass}
            />
          </label>

          <GlassButton
            type="submit"
            loading={createSchedule.isPending || updateSchedule.isPending}
            className="mt-2"
          >
            {editingId ? 'Save Changes' : 'Create Schedule'}
          </GlassButton>
        </form>
      </GlassDialog>
    </div>
  );
}
