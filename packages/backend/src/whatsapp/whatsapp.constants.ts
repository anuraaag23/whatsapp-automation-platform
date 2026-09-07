/** Immediate async processing of freshly-received webhook events — keeps the HTTP request path to a single fast INSERT. */
export const WEBHOOK_EVENT_PROCESS_QUEUE = 'webhook-event-process';
/** Periodic retry of events that failed processing. */
export const WEBHOOK_EVENT_RETRY_QUEUE = 'webhook-event-retry';
/** Periodic retry of outbound WhatsApp sends that failed with a transient/retryable error — see message-retry.service.ts. */
export const MESSAGE_RETRY_QUEUE = 'message-retry';

/** After this many failed send attempts, a message is left FAILED permanently — the durable, queryable "dead letter" record (status=FAILED, retryCount >= this) rather than a second queue system. */
export const MAX_MESSAGE_RETRY_ATTEMPTS = 5;

/**
 * WhatsApp Cloud API error codes (and raw transport-level error codes) that
 * represent a transient condition worth retrying — rate limiting, temporary
 * service unavailability, or a failure to even reach Meta's API. Everything
 * else (invalid parameter, template rejected, recipient not on WhatsApp,
 * outside the 24h customer-service window, account/registration problems,
 * etc.) is a permanent failure: retrying it would just fail again the same
 * way while burning quota, so those are left FAILED after the first attempt
 * for a human to act on (see CampaignsService.retryFailed for the manual
 * path) rather than being retried automatically.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export const RETRYABLE_WHATSAPP_ERROR_CODES = new Set<string>([
  '1', // Generic/unknown API error — Meta's own guidance is to retry these
  '2', // API service temporarily unavailable
  '4', // Too many API calls
  '80007', // Rate limit hit (WhatsApp Business Account scoped)
  '130429', // Rate limit hit (per user/pair)
  '131048', // Spam rate limit hit
  '131056', // Pair rate limit hit
  // Raw Node/axios transport-level error codes — no structured WA error was
  // ever returned because the request didn't get a response at all.
  'ECONNRESET',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/**
 * Decides whether a failed send is worth an automatic retry. No errorCode
 * at all (a raw network-level failure with nothing else to classify it by)
 * defaults to retryable, on the theory that Meta's API never actually got a
 * chance to reject the request. An HTTP 429 or 5xx is always retryable
 * regardless of the specific WA error code, since those are transport/
 * capacity signals from Meta's edge rather than a statement about the
 * message itself.
 */
export function isRetryableWhatsappError(errorCode?: string | null, httpStatus?: number | null): boolean {
  if (httpStatus === 429 || (httpStatus && httpStatus >= 500)) return true;
  if (!errorCode) return true;
  return RETRYABLE_WHATSAPP_ERROR_CODES.has(errorCode);
}
