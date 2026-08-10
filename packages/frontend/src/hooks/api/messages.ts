'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface LogMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  errorMessage: string | null;
  createdAt: string;
  contact: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string };
}

interface MessageListResponse {
  items: LogMessage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useMessages(status?: string) {
  return useQuery({
    queryKey: ['messages', status],
    queryFn: async () => {
      const { data } = await apiClient.get<MessageListResponse>('/messages', {
        params: status ? { status } : undefined,
      });
      return data;
    },
  });
}
