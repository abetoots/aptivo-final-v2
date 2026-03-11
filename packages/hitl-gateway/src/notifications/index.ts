/**
 * HITL-08: Notifications — barrel export
 * @task HITL-08
 */

export { sendApprovalNotification, createSendNotification } from './novu-adapter.js';

export type {
  NovuClient,
  NovuTriggerPayload,
  NovuTriggerResult,
  ApprovalNotificationParams,
  NotificationError,
  NotificationAdapterConfig,
} from './notification-types.js';

export { DEFAULT_NOTIFICATION_CONFIG } from './notification-types.js';
