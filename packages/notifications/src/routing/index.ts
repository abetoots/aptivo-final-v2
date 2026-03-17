/**
 * NOTIF2-03: routing barrel export
 * @task NOTIF2-03
 */

export {
  createPriorityRouter,
  DEFAULT_PRIORITY_CONFIG,
} from './priority-router.js';

export type {
  NotificationPriority,
  QuietHoursConfig,
  PriorityRoutingConfig,
  RoutingDecision,
} from './priority-router.js';
