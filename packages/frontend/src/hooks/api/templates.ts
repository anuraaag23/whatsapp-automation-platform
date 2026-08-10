'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface MessageTemplate {
  id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  bodyText: string;
  footerText: string | null;
  variables: string[];
  waStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED';
  createdAt: string;
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data } = await apiClient.get<MessageTemplate[]>('/templates');
      return data;
    },
  });
}

export interface CreateTemplateInput {
  name: string;
  category: MessageTemplate['category'];
  language: string;
  bodyText: string;
  footerText?: string;
  variables?: string[];
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const { data } = await apiClient.post<MessageTemplate>('/templates', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CreateTemplateInput & { id: string }) => {
      const { data } = await apiClient.patch<MessageTemplate>(`/templates/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/templates/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useSubmitTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/templates/${id}/submit`);
      return data as { submitted: boolean; reason?: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export interface TemplateHistoryEntry {
  id: string;
  status: MessageTemplate['waStatus'];
  note: string | null;
  changedAt: string;
}

export function useTemplateHistory(id: string | null) {
  return useQuery({
    queryKey: ['template-history', id],
    queryFn: async () => {
      const { data } = await apiClient.get<TemplateHistoryEntry[]>(`/templates/${id}/history`);
      return data;
    },
    enabled: Boolean(id),
  });
}
