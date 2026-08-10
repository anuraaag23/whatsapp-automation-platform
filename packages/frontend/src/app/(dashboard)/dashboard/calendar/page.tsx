'use client';

import { useMemo, useState } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  setHours,
  setMinutes,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Shuffle, Move } from 'lucide-react';
import { GlassCard, GlassButton } from '@/components/glass';
import { useSchedules, useRescheduleSchedule, Schedule } from '@/hooks/api/schedules';

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dragScheduleId, setDragScheduleId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const { data: schedules } = useSchedules();
  const reschedule = useRescheduleSchedule();

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const schedulesByDay = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const schedule of schedules ?? []) {
      if (!schedule.nextRunAt) continue;
      const key = format(new Date(schedule.nextRunAt), 'yyyy-MM-dd');
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, schedule]);
    }
    return map;
  }, [schedules]);

  const selectedDaySchedules = selectedDay
    ? schedulesByDay.get(format(selectedDay, 'yyyy-MM-dd')) ?? []
    : [];

  function handleDrop(day: Date) {
    if (!dragScheduleId) return;
    const dragged = schedules?.find((s) => s.id === dragScheduleId);
    if (!dragged?.nextRunAt) {
      setDragScheduleId(null);
      setDropTargetKey(null);
      return;
    }
    const original = new Date(dragged.nextRunAt);
    const newDate = setMinutes(setHours(day, original.getHours()), original.getMinutes());
    reschedule.mutate({ id: dragScheduleId, nextRunAt: newDate.toISOString() });
    setDragScheduleId(null);
    setDropTargetKey(null);
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Calendar</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Upcoming scheduled sends — drag a chip to a new day to reschedule it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GlassButton variant="ghost" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))}>
            <ChevronLeft size={16} />
          </GlassButton>
          <span className="w-32 text-center text-sm font-medium text-deep-navy dark:text-white">
            {format(cursor, 'MMMM yyyy')}
          </span>
          <GlassButton variant="ghost" size="sm" onClick={() => setCursor((c) => addMonths(c, 1))}>
            <ChevronRight size={16} />
          </GlassButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <GlassCard variant="lite" padded className="lg:col-span-3">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-deep-navy/50 dark:text-white/40">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="pb-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const daySchedules = schedulesByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const selected = selectedDay && isSameDay(day, selectedDay);
              const isDropTarget = dropTargetKey === key;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(day)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTargetKey(key);
                  }}
                  onDragLeave={() => setDropTargetKey((k) => (k === key ? null : k))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(day);
                  }}
                  className={`flex min-h-[72px] flex-col items-start gap-1 rounded-xl border p-1.5 text-left text-xs transition-colors ${
                    selected
                      ? 'border-electric bg-electric/10'
                      : isDropTarget
                        ? 'border-emerald bg-emerald/10'
                        : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                  } ${!inMonth ? 'opacity-30' : ''}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      isToday(day) ? 'bg-electric text-white' : 'text-deep-navy/70 dark:text-white/60'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  {daySchedules.slice(0, 2).map((s) => (
                    <span
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDragScheduleId(s.id);
                      }}
                      onDragEnd={() => {
                        setDragScheduleId(null);
                        setDropTargetKey(null);
                      }}
                      className="flex w-full cursor-grab items-center gap-1 truncate rounded bg-electric/10 px-1 py-0.5 text-[10px] text-electric active:cursor-grabbing"
                      title="Drag to a new day to reschedule"
                    >
                      <Move size={9} />
                      {s.name}
                    </span>
                  ))}
                  {daySchedules.length > 2 && (
                    <span className="text-[10px] text-deep-navy/40 dark:text-white/30">
                      +{daySchedules.length - 2} more
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard variant="lite" title={selectedDay ? format(selectedDay, 'EEEE, MMM d') : 'Select a day'}>
          {!selectedDay || selectedDaySchedules.length === 0 ? (
            <p className="text-sm text-deep-navy/50 dark:text-white/40">
              {selectedDay ? 'Nothing scheduled this day.' : 'Click a day to see what\u2019s scheduled.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {selectedDaySchedules.map((s) => (
                <div key={s.id} className="rounded-xl bg-black/5 p-3 dark:bg-white/10">
                  <div className="flex items-center gap-2 text-sm font-medium text-deep-navy dark:text-white">
                    {s.randomTimeEnabled ? <Shuffle size={14} /> : <Clock size={14} />}
                    {s.name}
                  </div>
                  <p className="mt-1 text-xs text-deep-navy/50 dark:text-white/40">
                    {new Date(s.nextRunAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
