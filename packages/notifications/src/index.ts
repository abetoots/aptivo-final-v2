/**
 * @aptivo/notifications — generalized notification dispatch
 * @task NOTIF-01, NOTIF-02
 * @frd FR-CORE-NOTIF-001
 */

export { createNotificationService } from './notification-service.js';
export { NovuNotificationAdapter } from './adapters/novu-adapter.js';
export { renderTemplate } from './templates/template-renderer.js';
export { createTemplateRegistry } from './templates/template-registry.js';

export type {
  NotificationParams,
  NotificationError,
  NotificationService,
  NotificationServiceDeps,
  NotificationAdapter,
  AdapterSendParams,
  SubscriberData,
  NotificationPreferenceStore,
  DeliveryLogStore,
  DeliveryLogEntry,
  TemplateRecord,
  TemplateRegistry,
} from './types.js';

export type {
  NovuClient,
  NovuTriggerPayload,
  NovuTriggerResult,
  NovuAdapterConfig,
} from './adapters/novu-adapter.js';

export type { TemplateStore } from './templates/template-registry.js';

export { createHitlNotificationShim } from './compat/hitl-shim.js';
export type { HitlNotificationParams } from './compat/hitl-shim.js';
