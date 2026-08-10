'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type CampaignType =
  | 'WELCOME'
  | 'REMINDER'
  | 'PROMOTION'
  | 'NEWSLETTER'
  | 'FESTIVAL_GREETING'
  | 'FOLLOW_UP'
  | 'CUSTOM';

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  template: { id: string; name: string } | null;
  stats: { sent: number; delivered: number; read: number; failed: number };
  _count: { recipients: number };
  createdAt: string;
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data } = await apiClient.get<Campaign[]>('/campaigns');
      return data;
    },
  });
}

export interface CreateCampaignInput {
  name: string;
  type: CampaignType;
  templateId?: string;
  audienceType: 'ALL_CONTACTS' | 'SEGMENT' | 'GROUP' | 'TAG' | 'CUSTOM_LIST';
  audienceRef: Record<string, unknown>;
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => {
      const { data } = await apiClient.post<Campaign>('/campaigns', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CreateCampaignInput & { id: string }) => {
      const { data } = await apiClient.patch<Campaign>(`/campaigns/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useLaunchCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/campaigns/${id}/launch`);
      return data as { launched: boolean; recipientCount: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/campaigns/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}
