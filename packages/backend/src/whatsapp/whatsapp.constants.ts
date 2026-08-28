/** Immediate async processing of freshly-received webhook events — keeps the HTTP request path to a single fast INSERT. */
export const WEBHOOK_EVENT_PROCESS_QUEUE = 'webhook-event-process';
/** Periodic retry of events that failed processing. */
export const WEBHOOK_EVENT_RETRY_QUEUE = 'webhook-event-retry';
