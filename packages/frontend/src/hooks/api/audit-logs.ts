'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  device: string | null;
  ipAddress: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<AuditLogResponse>('/audit-logs', {
        params: {
          action: filters.action || undefined,
          entityType: filters.entityType || undefined,
          userId: filters.userId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page ?? 1,
        },
      });
      return data;
    },
  });
}

export function useAuditLogFilterOptions() {
  return useQuery({
    queryKey: ['audit-logs', 'filter-options'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ actions: string[]; entityTypes: string[] }>(
        '/audit-logs/filter-options',
      );
      return data;
    },
  });
}
