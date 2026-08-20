/**
 * Runtime string arrays mirroring schema.prisma's enums, used with
 * class-validator's @IsIn() instead of @IsEnum(PrismaEnum). See
 * role.constants.ts for the full explanation of why this is necessary.
 * If you change an enum in schema.prisma, update the matching list here.
 */

export const RECURRENCE_TYPES = [
  'ONE_TIME',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
  'EVERY_X_HOURS',
  'EVERY_X_DAYS',
  'BUSINESS_DAYS',
  'WEEKENDS',
  'SPECIFIC_DATES',
  'CUSTOM_CRON',
] as const;

export const AUDIENCE_TYPES = ['ALL_CONTACTS', 'SEGMENT', 'GROUP', 'TAG', 'CUSTOM_LIST'] as const;

export const CAMPAIGN_TYPES = [
  'WELCOME',
  'REMINDER',
  'PROMOTION',
  'NEWSLETTER',
  'FESTIVAL_GREETING',
  'FOLLOW_UP',
  'CUSTOM',
] as const;

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;

export const HEADER_TYPES = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as const;

export const AUTOMATION_TRIGGER_TYPES = [
  'KEYWORD_RECEIVED',
  'CONTACT_CREATED',
  'TAG_ADDED',
  'CAMPAIGN_COMPLETED',
  'WEBHOOK',
  'SCHEDULE',
  'MANUAL',
] as const;

export const THEMES = ['LIGHT', 'DARK', 'AUTO'] as const;

export const MESSAGE_STATUS = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
} as const;

export const MESSAGE_TYPE = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  DOCUMENT: 'DOCUMENT',
  LOCATION: 'LOCATION',
  CONTACT_CARD: 'CONTACT_CARD',
  INTERACTIVE_BUTTONS: 'INTERACTIVE_BUTTONS',
  INTERACTIVE_LIST: 'INTERACTIVE_LIST',
  TEMPLATE: 'TEMPLATE',
} as const;

export const SCHEDULE_STATUS = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  EXPIRED: 'EXPIRED',
} as const;

export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export const AUTOMATION_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
} as const;

export const NOTIFICATION_CHANNEL = {
  DESKTOP: 'DESKTOP',
  EMAIL: 'EMAIL',
  IN_APP: 'IN_APP',
  WEBHOOK: 'WEBHOOK',
  SLACK: 'SLACK',
  TELEGRAM: 'TELEGRAM',
} as const;

export const WEBHOOK_EVENT_STATUS = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const;
