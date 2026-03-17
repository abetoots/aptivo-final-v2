/**
 * NOTIF-01, NOTIF2-01: Adapters barrel export
 */

export { NovuNotificationAdapter } from './novu-adapter.js';
export type { NovuClient, NovuTriggerPayload, NovuTriggerResult, NovuAdapterConfig } from './novu-adapter.js';

export { createSmtpAdapter, validateSmtpConfig } from './smtp-adapter.js';
export type { MailTransport, MailOptions, MailResult, SmtpConfig } from './smtp-adapter.js';

export { createFailoverAdapter } from './failover-adapter.js';
export type { FailoverPolicy } from './failover-adapter.js';
