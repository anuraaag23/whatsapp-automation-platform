'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type RecurrenceType =
  | 'ONE_TIME'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'YEARLY'
  | 'EVERY_X_HOURS'
  | 'EVERY_X_DAYS'
  | 'BUSINESS_DAYS'
  | 'WEEKENDS'
  | 'SPECIFIC_DATES'
  | 'CUSTOM_CRON';

export interface Schedule {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'EXPIRED';
  recurrenceType: RecurrenceType;
  timeOfDay: string | null;
  randomTimeEnabled: boolean;
  randomWindowStart: string | null;
  randomWindowEnd: string | null;
  messagePool: string[];
  audienceType: 'ALL_CONTACTS' | 'SEGMENT' | 'GROUP' | 'TAG' | 'CUSTOM_LIST';
  nextRunAt: string | null;
  lastRunAt: string | null;
  template: { id: string; name: string } | null;
}

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const { data } = await apiClient.get<Schedule[]>('/schedules');
      return data;
    },
  });
}

export interface CreateScheduleInput {
  name: string;
  recurrenceType: RecurrenceType;
  timeOfDay?: string;
  intervalHours?: number;
  intervalDays?: number;
  daysOfWeek?: number[];
  randomTimeEnabled?: boolean;
  randomWindowStart?: string;
  randomWindowEnd?: string;
  messagePool?: string[];
  audienceType: Schedule['audienceType'];
  audienceRef: Record<string, unknown>;
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateScheduleInput) => {
      const { data } = await apiClient.post<Schedule>('/schedules', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CreateScheduleInput & { id: string }) => {
      const { data } = await apiClient.patch<Schedule>(`/schedules/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

function useScheduleAction(action: 'pause' | 'resume' | 'disable' | 'duplicate') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/schedules/${id}/${action}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

export const usePauseSchedule = () => useScheduleAction('pause');
export const useResumeSchedule = () => useScheduleAction('resume');
export const useDisableSchedule = () => useScheduleAction('disable');
export const useDuplicateSchedule = () => useScheduleAction('duplicate');

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/schedules/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

export function useRescheduleSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nextRunAt }: { id: string; nextRunAt: string }) => {
      const { data } = await apiClient.patch(`/schedules/${id}/reschedule`, { nextRunAt });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });
}
