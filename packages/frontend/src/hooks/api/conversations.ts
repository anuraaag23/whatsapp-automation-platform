'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type ConversationStatus = 'OPEN' | 'RESOLVED' | 'ARCHIVED';

export interface ConversationContact {
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
}

export interface ConversationAssignedUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ConversationItem {
  id: string;
  organizationId: string;
  contactId: string;
  status: ConversationStatus;
  assignedUserId: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  contact: ConversationContact;
  assignedUser?: ConversationAssignedUser | null;
}

export interface ConversationListResponse {
  items: ConversationItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ConversationMessage {
  id: string;
  organizationId: string;
  contactId: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  content: Record<string, any>;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  errorMessage: string | null;
  waMessageId: string | null;
  providerTimestamp: string | null;
  createdAt: string;
}

export interface ConversationMessagesResponse {
  items: ConversationMessage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ConversationListFilters {
  status?: string;
  assignedUserId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Polls the conversation list every 4000ms so new inbound messages or status changes
 * appear automatically without manual page refreshing.
 */
export function useConversations(filters: ConversationListFilters = {}) {
  return useQuery({
    queryKey: ['conversations', filters.status, filters.assignedUserId, filters.search, filters.page, filters.pageSize],
    queryFn: async () => {
      const { data } = await apiClient.get<ConversationListResponse>('/conversations', {
        params: {
          status: filters.status && filters.status !== 'ALL' ? filters.status : undefined,
          assignedUserId: filters.assignedUserId || undefined,
          search: filters.search || undefined,
          page: filters.page,
          pageSize: filters.pageSize ?? 50,
        },
      });
      return data;
    },
    refetchInterval: 4000,
  });
}

/**
 * Single conversation details query.
 */
export function useConversation(id: string | null | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await apiClient.get<ConversationItem>(`/conversations/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

/**
 * Polls the active conversation's message stream every 3000ms so newly received
 * replies appear promptly in the thread.
 */
export function useConversationMessages(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['conversation-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return { items: [], total: 0, page: 1, pageSize: 100, totalPages: 0 };
      const { data } = await apiClient.get<ConversationMessagesResponse>(`/conversations/${conversationId}/messages`, {
        params: { pageSize: 100 },
      });
      return data;
    },
    enabled: Boolean(conversationId),
    refetchInterval: 3000,
  });
}

/**
 * Marks conversation as read (clears unread counter).
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/conversations/${id}/read`);
      return data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });
}

/**
 * Updates conversation status (OPEN / RESOLVED / ARCHIVED).
 */
export function useUpdateConversationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ConversationStatus }) => {
      const { data } = await apiClient.patch(`/conversations/${id}/status`, { status });
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });
}

/**
 * Assigns conversation to an agent / team member.
 */
export function useAssignConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string | null }) => {
      const { data } = await apiClient.patch(`/conversations/${id}/assign`, { userId });
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });
}

export interface SendConversationReplyInput {
  contactId: string;
  type: 'TEXT' | 'IMAGE';
  body?: string;
  imageUrl?: string;
  caption?: string;
}

/**
 * Sends an outbound reply to the contact using the existing Messages pipeline (POST /api/v1/messages).
 */
export function useSendConversationReply(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendConversationReplyInput) => {
      const { data } = await apiClient.post('/messages', input);
      return data;
    },
    onSuccess: () => {
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}
