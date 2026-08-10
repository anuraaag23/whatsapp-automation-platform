'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SearchResult {
  type: 'contact' | 'campaign' | 'template' | 'schedule';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: ['global-search', query],
    queryFn: async () => {
      const { data } = await apiClient.get<SearchResult[]>('/search', { params: { q: query } });
      return data;
    },
    enabled: query.trim().length >= 2,
  });
}
