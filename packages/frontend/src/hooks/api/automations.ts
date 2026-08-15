'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type AutomationNodeType =
  | 'trigger'
  | 'condition'
  | 'delay'
  | 'send_message'
  | 'ai'
  | 'wait'
  | 'branch'
  | 'webhook'
  | 'add_tag'
  | 'add_to_group'
  | 'update_contact'
  | 'finish';

export interface AutomationGraphNode {
  id: string;
  type: AutomationNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface AutomationGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED';
  triggerType: string;
  graph: { nodes: AutomationGraphNode[]; edges: AutomationGraphEdge[] };
  runsCount: number;
  lastRunAt: string | null;
}

export function useAutomations() {
  return useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const { data } = await apiClient.get<Automation[]>('/automations');
      return data;
    },
  });
}

export function useAutomation(id: string | null) {
  return useQuery({
    queryKey: ['automation', id],
    queryFn: async () => {
      const { data } = await apiClient.get<Automation>(`/automations/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  triggerType: Automation['triggerType'];
  graph: { nodes: AutomationGraphNode[]; edges: AutomationGraphEdge[] };
}

export function useCreateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAutomationInput) => {
      const { data } = await apiClient.post<Automation>('/automations', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
  });
}

export function useUpdateAutomationGraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, graph }: { id: string; graph: CreateAutomationInput['graph'] }) => {
      const { data } = await apiClient.patch<Automation>(`/automations/${id}`, { graph });
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation', vars.id] });
    },
  });
}

function useAutomationAction(action: 'activate' | 'pause') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/automations/${id}/${action}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
  });
}

export const useActivateAutomation = () => useAutomationAction('activate');
export const usePauseAutomation = () => useAutomationAction('pause');

export function useDeleteAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/automations/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
  });
}

export function useRunAutomation() {
  return useMutation({
    mutationFn: async ({ id, contactId }: { id: string; contactId: string }) => {
      const { data } = await apiClient.post(`/automations/${id}/run`, { contactId });
      return data;
    },
  });
}

export interface AutomationRunStep {
  nodeId: string;
  nodeType: string;
  at: string;
  outcome?: string;
}

export interface AutomationRun {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  steps: AutomationRunStep[];
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function useAutomationRuns(id: string | null) {
  return useQuery({
    queryKey: ['automation-runs', id],
    queryFn: async () => {
      const { data } = await apiClient.get<AutomationRun[]>(`/automations/${id}/runs`);
      return data;
    },
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
}
