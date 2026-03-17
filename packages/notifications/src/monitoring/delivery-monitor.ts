/**
 * NOTIF2-02: Novu silent-drop monitoring
 * @task NOTIF2-02
 *
 * detects when novu acknowledges a notification but delivery never completes
 * (silent drops). monitors drop rate within a configurable time window and
 * alerts when the rate exceeds a threshold.
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// health metrics
// ---------------------------------------------------------------------------

export interface DeliveryHealthMetrics {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalPending: number; // sent but no delivery confirmation
  dropRate: number; // pending / totalSent (0.0-1.0)
  alertThreshold: number;
  isHealthy: boolean;
}

// ---------------------------------------------------------------------------
// dependencies
// ---------------------------------------------------------------------------

export interface DeliveryMonitorDeps {
  getDeliveryStats: (windowMs: number) => Promise<{ sent: number; delivered: number; failed: number }>;
}

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

export interface DeliveryMonitorConfig {
  windowMs: number; // monitoring window, default 1 hour
  dropRateThreshold: number; // alert when drop rate exceeds this, default 0.05 (5%)
  minSentThreshold: number; // minimum sends before monitoring kicks in, default 10
}

export const DEFAULT_MONITOR_CONFIG: DeliveryMonitorConfig = {
  windowMs: 60 * 60 * 1000,
  dropRateThreshold: 0.05,
  minSentThreshold: 10,
};

// ---------------------------------------------------------------------------
// error type
// ---------------------------------------------------------------------------

export type MonitorError = { readonly _tag: 'MonitorError'; readonly cause: unknown };

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDeliveryMonitor(deps: DeliveryMonitorDeps, config?: Partial<DeliveryMonitorConfig>) {
  const cfg: DeliveryMonitorConfig = { ...DEFAULT_MONITOR_CONFIG, ...config };

  return {
    async checkHealth(): Promise<Result<DeliveryHealthMetrics, MonitorError>> {
      try {
        const stats = await deps.getDeliveryStats(cfg.windowMs);
        const totalPending = stats.sent - stats.delivered - stats.failed;
        const dropRate = stats.sent > 0 ? totalPending / stats.sent : 0;
        const isHealthy = stats.sent < cfg.minSentThreshold || dropRate <= cfg.dropRateThreshold;

        return Result.ok({
          totalSent: stats.sent,
          totalDelivered: stats.delivered,
          totalFailed: stats.failed,
          totalPending: Math.max(0, totalPending),
          dropRate,
          alertThreshold: cfg.dropRateThreshold,
          isHealthy,
        });
      } catch (cause) {
        return Result.err({ _tag: 'MonitorError' as const, cause });
      }
    },
  };
}
