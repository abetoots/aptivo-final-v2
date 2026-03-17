/**
 * @aptivo/notifications — generalized notification dispatch
 * @task NOTIF-01, NOTIF-02
 * @frd FR-CORE-NOTIF-001
 */

export { createNotificationService } from './notification-service.js';
export { NovuNotificationAdapter } from './adapters/novu-adapter.js';
export { createSmtpAdapter, validateSmtpConfig } from './adapters/smtp-adapter.js';
export { createFailoverAdapter } from './adapters/failover-adapter.js';
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

export type {
  MailTransport,
  MailOptions,
  MailResult,
  SmtpConfig,
} from './adapters/smtp-adapter.js';

export type { FailoverPolicy } from './adapters/failover-adapter.js';

export type { TemplateStore } from './templates/template-registry.js';

export { createHitlNotificationShim } from './compat/hitl-shim.js';
export type { HitlNotificationParams } from './compat/hitl-shim.js';

// priority routing (NOTIF2-03)
export { createPriorityRouter, DEFAULT_PRIORITY_CONFIG } from './routing/priority-router.js';
export type {
  NotificationPriority,
  QuietHoursConfig,
  PriorityRoutingConfig,
  RoutingDecision,
} from './routing/priority-router.js';

// delivery monitoring (NOTIF2-02)
export { createDeliveryMonitor, DEFAULT_MONITOR_CONFIG } from './monitoring/delivery-monitor.js';
export type {
  DeliveryHealthMetrics,
  DeliveryMonitorDeps,
  DeliveryMonitorConfig,
  MonitorError,
} from './monitoring/delivery-monitor.js';
