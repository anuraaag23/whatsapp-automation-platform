'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Contact {
  id: string;
  phoneNumber: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
  optInStatus: 'PENDING' | 'OPTED_IN' | 'OPTED_OUT';
  isFavorite: boolean;
  isArchived: boolean;
  tags: { tag: Tag }[];
  createdAt: string;
}

interface ContactListResponse {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useContacts(search: string) {
  return useQuery({
    queryKey: ['contacts', search],
    queryFn: async () => {
      const { data } = await apiClient.get<ContactListResponse>('/contacts', {
        params: { search: search || undefined },
      });
      return data;
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['contact-tags'],
    queryFn: async () => {
      const { data } = await apiClient.get<Tag[]>('/contacts/tags');
      return data;
    },
  });
}

export interface CreateContactInput {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  city?: string;
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateContactInput) => {
      const { data } = await apiClient.post<Contact>('/contacts', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateContactInput> & { id: string }) => {
      const { data } = await apiClient.patch<Contact>(`/contacts/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useImportContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (csv: string) => {
      const { data } = await apiClient.post('/contacts/import', { csv });
      return data as { created: number; updated: number; failed: number; totalRows: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useSetOptIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, optedIn }: { id: string; optedIn: boolean }) => {
      const { data } = await apiClient.patch(`/contacts/${id}/opt-in`, { optedIn });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/contacts/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useBulkAddTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactIds, tagId }: { contactIds: string[]; tagId: string }) => {
      const { data } = await apiClient.post('/contacts/bulk/tag', { contactIds, tagId });
      return data as { updated: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useBulkArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactIds, isArchived }: { contactIds: string[]; isArchived: boolean }) => {
      const { data } = await apiClient.post('/contacts/bulk/archive', { contactIds, isArchived });
      return data as { updated: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useBulkDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactIds: string[]) => {
      const { data } = await apiClient.post('/contacts/bulk/delete', { contactIds });
      return data as { deleted: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}
