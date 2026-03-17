/**
 * NOTIF2-02: monitoring barrel export
 * @task NOTIF2-02
 */

export {
  createDeliveryMonitor,
  DEFAULT_MONITOR_CONFIG,
} from './delivery-monitor.js';

export type {
  DeliveryHealthMetrics,
  DeliveryMonitorDeps,
  DeliveryMonitorConfig,
  MonitorError,
} from './delivery-monitor.js';
