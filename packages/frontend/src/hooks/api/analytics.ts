'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface MessageVolumePoint {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export function useMessageVolume(days = 14) {
  return useQuery({
    queryKey: ['analytics-message-volume', days],
    queryFn: async () => {
      const { data } = await apiClient.get<MessageVolumePoint[]>('/analytics/message-volume', {
        params: { days },
      });
      return data;
    },
  });
}

export interface CampaignPerformance {
  id: string;
  name: string;
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
}

export function useCampaignPerformance() {
  return useQuery({
    queryKey: ['analytics-campaign-performance'],
    queryFn: async () => {
      const { data } = await apiClient.get<CampaignPerformance[]>('/analytics/campaign-performance');
      return data;
    },
  });
}

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ['analytics-overview'],
    queryFn: async () => {
      const { data } = await apiClient.get('/analytics/overview');
      return data as { totalContacts: number; optedIn: number; totalMessages: number; totalCampaigns: number };
    },
  });
}
