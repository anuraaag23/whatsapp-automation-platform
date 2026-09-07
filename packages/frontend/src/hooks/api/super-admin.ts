import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SuperAdminOverview {
  organizations: { total: number; active: number; suspended: number };
  users: { total: number; active: number; verified: number };
  whatsappAccounts: { total: number; connected: number };
  automations: { total: number; active: number; runs: { running: number; completed: number; failed: number } };
  messages: {
    last24h: { sent: number; received: number };
    last7d: { sent: number; received: number };
    last30d: { sent: number; received: number };
  };
  queue: { waiting: number; active: number; delayed: number; failed: number };
  health: {
    database: { status: 'healthy' | 'down'; latencyMs: number | null };
    redis: { status: 'healthy' | 'down'; latencyMs: number | null };
  };
}

export function useSuperAdminOverview() {
  return useQuery({
    queryKey: ['super-admin', 'overview'],
    queryFn: async () => (await apiClient.get<SuperAdminOverview>('/super-admin/overview')).data,
    refetchInterval: 30_000,
  });
}

export interface SuperAdminHealth {
  backend: { status: 'healthy' };
  database: { status: 'healthy' | 'down'; latencyMs: number | null };
  redis: { status: 'healthy' | 'down'; latencyMs: number | null };
  queue: { status: 'healthy' | 'degraded'; waiting: number; active: number; delayed: number; failed: number };
  whatsappWebhooks: { lastInboundMessageAt: string | null };
}

export function useSuperAdminHealth() {
  return useQuery({
    queryKey: ['super-admin', 'health'],
    queryFn: async () => (await apiClient.get<SuperAdminHealth>('/super-admin/health')).data,
    refetchInterval: 15_000,
  });
}

export interface SuperAdminOrganization {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  suspendedAt: string | null;
  _count: { users: number; contacts: number; automations: number };
  whatsappAccount: { status: string } | null;
}

export function useSuperAdminOrganizations(params: { search?: string; status?: string; page?: number }) {
  return useQuery({
    queryKey: ['super-admin', 'organizations', params],
    queryFn: async () =>
      (
        await apiClient.get<{ organizations: SuperAdminOrganization[]; total: number; page: number; totalPages: number }>(
          '/super-admin/organizations',
          { params },
        )
      ).data,
  });
}

export function useSuperAdminOrganization(id: string | undefined) {
  return useQuery({
    queryKey: ['super-admin', 'organizations', id],
    queryFn: async () => (await apiClient.get(`/super-admin/organizations/${id}`)).data,
    enabled: !!id,
  });
}

export function useSuspendOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      (await apiClient.post(`/super-admin/organizations/${id}/suspend`, { reason })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'organizations'] }),
  });
}

export function useActivateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/super-admin/organizations/${id}/activate`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'organizations'] }),
  });
}

export interface SuperAdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  organization: { id: string; name: string; slug: string };
}

export function useSuperAdminUsers(params: {
  search?: string;
  organizationId?: string;
  isActive?: boolean;
  page?: number;
}) {
  return useQuery({
    queryKey: ['super-admin', 'users', params],
    queryFn: async () =>
      (
        await apiClient.get<{ users: SuperAdminUser[]; total: number; page: number; totalPages: number }>(
          '/super-admin/users',
          { params },
        )
      ).data,
  });
}

export function useSetUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      (await apiClient.patch(`/super-admin/users/${id}/active`, { isActive })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'users'] }),
  });
}

export function useSuperAdminAudit(params: { organizationId?: string; action?: string; page?: number }) {
  return useQuery({
    queryKey: ['super-admin', 'audit', params],
    queryFn: async () => (await apiClient.get('/super-admin/audit', { params })).data,
  });
}

// ---------------------------------------------------------------------------
// Limits & Quotas
// ---------------------------------------------------------------------------

export const QUOTA_RESOURCE_LABELS: Record<string, string> = {
  users: 'Users',
  contacts: 'Contacts',
  whatsappAccounts: 'WhatsApp accounts',
  messagesPerMonth: 'Messages / month',
  automations: 'Automations',
  automationExecutionsPerMonth: 'Automation executions / month',
  apiRequestsPerMonth: 'API requests / month',
  storageMb: 'Storage (MB)',
};

export interface QuotaOrgListItem {
  id: string;
  name: string;
  slug: string;
  plan: { id: string; key: string; name: string } | null;
  worstStatus: 'ok' | 'warning' | 'exceeded';
}

export function useSuperAdminQuotaOrganizations(params: { search?: string; page?: number }) {
  return useQuery({
    queryKey: ['super-admin', 'quotas', 'organizations', params],
    queryFn: async () =>
      (
        await apiClient.get<{ organizations: QuotaOrgListItem[]; total: number; page: number; totalPages: number }>(
          '/super-admin/quotas',
          { params },
        )
      ).data,
  });
}

export interface QuotaResourceSummary {
  resource: string;
  limit: number | null;
  source: 'override' | 'plan' | 'unlimited';
  usage: number | null;
  remaining: number | null;
  percentUsed: number | null;
  status: 'ok' | 'warning' | 'exceeded' | 'unlimited' | 'untracked';
}

export interface QuotaPlan {
  id: string;
  key: string;
  name: string;
}

export function useSuperAdminOrganizationQuota(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['super-admin', 'quotas', organizationId],
    queryFn: async () =>
      (
        await apiClient.get<{
          organization: { id: string; name: string; slug: string; planId: string | null; plan: QuotaPlan | null };
          summary: QuotaResourceSummary[];
          availablePlans: QuotaPlan[];
        }>(`/super-admin/quotas/${organizationId}`)
      ).data,
    enabled: !!organizationId,
  });
}

export function useSetOrganizationPlan(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string | null) =>
      (await apiClient.patch(`/super-admin/quotas/${organizationId}/plan`, { planId })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'quotas', organizationId] }),
  });
}

export function useSetQuotaOverride(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resource, value }: { resource: string; value: number | null }) =>
      (await apiClient.patch(`/super-admin/quotas/${organizationId}/override`, { resource, value })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'quotas', organizationId] }),
  });
}

export function useResetQuotaOverride(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resource: string) =>
      (await apiClient.post(`/super-admin/quotas/${organizationId}/override/${resource}/reset`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'quotas', organizationId] }),
  });
}
