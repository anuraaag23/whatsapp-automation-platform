'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface WhatsappAccountInfo {
  id: string;
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  apiVersion: string;
  status: string;
  hasAccessToken: boolean;
}

export function useWhatsappAccount() {
  return useQuery({
    queryKey: ['whatsapp-account'],
    queryFn: async () => {
      const { data } = await apiClient.get<WhatsappAccountInfo | null>('/settings/whatsapp-account');
      return data;
    },
  });
}

export interface WhatsappAccountStatus {
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string;
  codeVerificationStatus: string;
  messagingLimitTier: string;
}

export function useWhatsappAccountStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['whatsapp-account-status'],
    queryFn: async () => {
      const { data } = await apiClient.get<WhatsappAccountStatus>('/settings/whatsapp-account/status');
      return data;
    },
    enabled,
    retry: false,
  });
}

export interface ConnectWhatsappInput {
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  accessToken: string;
}

export function useConnectWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectWhatsappInput) => {
      const { data } = await apiClient.post('/settings/whatsapp-account', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-account'] }),
  });
}

export function useDisconnectWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete('/settings/whatsapp-account');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-account'] }),
  });
}

export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const { data } = await apiClient.get('/settings/organization');
      return data as { id: string; name: string; timezone: string; language: string; theme: string };
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name?: string; timezone?: string; language?: string }) => {
      const { data } = await apiClient.patch('/settings/organization', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization'] }),
  });
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiKeyInfo[]>('/settings/api-keys');
      return data;
    },
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await apiClient.post('/settings/api-keys', { name });
      return data as { id: string; name: string; key: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/settings/api-keys/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export interface NotificationSettingsInfo {
  emailEnabled: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpFromAddress?: string;
  notifyEmailTo?: string;
  hasSmtpPassword: boolean;
  slackEnabled: boolean;
  slackWebhookUrl?: string;
  telegramEnabled: boolean;
  telegramChatId?: string;
  hasTelegramBotToken: boolean;
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const { data } = await apiClient.get<NotificationSettingsInfo>('/settings/notifications');
      return data;
    },
  });
}

export interface UpdateNotificationSettingsInput {
  emailEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFromAddress?: string;
  notifyEmailTo?: string;
  slackEnabled?: boolean;
  slackWebhookUrl?: string;
  telegramEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateNotificationSettingsInput) => {
      const { data } = await apiClient.patch('/settings/notifications', input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-settings'] }),
  });
}
