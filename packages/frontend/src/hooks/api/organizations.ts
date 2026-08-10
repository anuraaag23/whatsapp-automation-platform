'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';
import type { Role } from './users';

export interface MyOrganization {
  organization: { id: string; name: string; slug: string; logoUrl: string | null };
  role: Role;
}

export function useMyOrganizations() {
  return useQuery({
    queryKey: ['my-organizations'],
    queryFn: async () => {
      const { data } = await apiClient.get<MyOrganization[]>('/auth/organizations');
      return data;
    },
  });
}

export function useSwitchOrganization() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data } = await apiClient.post('/auth/switch-organization', { organizationId });
      return data as { accessToken: string };
    },
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      // Every cached query (contacts, campaigns, schedules, ...) belongs to
      // the previous org — a full reload is the simplest correct way to
      // reset all client state rather than trying to selectively invalidate
      // dozens of query keys.
      window.location.href = '/dashboard';
    },
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await apiClient.post('/organizations', { name });
      return data as { id: string; name: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-organizations'] }),
  });
}

export interface OrgMember {
  id: string;
  role: Role;
  isActive: boolean;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export function useOrgMembers() {
  return useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      const { data } = await apiClient.get<OrgMember[]>('/organizations/members');
      return data;
    },
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: Role }) => {
      const { data } = await apiClient.post('/organizations/invite', input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/organizations/members/${userId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org-members'] }),
  });
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
}

export function usePendingInvites() {
  return useQuery({
    queryKey: ['pending-invites'],
    queryFn: async () => {
      const { data } = await apiClient.get<PendingInvite[]>('/organizations/invites');
      return data;
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/organizations/invites/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-invites'] }),
  });
}
