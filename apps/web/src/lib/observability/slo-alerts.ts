/**
 * INT-04: core SLO alert definitions
 * @task INT-04, S6-CF-01, OBS-01
 * @warning S5-W13, S5-W14, S5-W15, S5-W16, S4-W10, T1-W23
 */

import {
  evaluateBurnRate,
  DEFAULT_BURN_RATE_CONFIGS,
  type WindowMetrics,
} from './burn-rate.js';

// -- types --

export interface SloAlert {
  id: string;
  name: string;
  description: string;
  warning: string; // WARNING register ID
  evaluate: (metrics: SloMetrics) => SloAlertResult;
}

export interface SloMetrics {
  // workflow metrics (S5-W13)
  workflowTotal: number;
  workflowSuccess: number;
  // hitl metrics (S5-W14)
  hitlDeliveryLatencyP95Ms: number;
  // mcp metrics (S5-W15)
  mcpCallTotal: number;
  mcpCallSuccess: number;
  // audit metrics (S5-W16)
  auditDlqPendingCount: number;
  // retention metrics (S4-W10)
  retentionFailureCount: number;
  // notification metrics (T1-W23)
  notificationTotal: number;
  notificationDelivered: number;
}

export type SloAlertResult =
  | { status: 'ok'; value: number; threshold: number }
  | { status: 'firing'; value: number; threshold: number; message: string };

// -- thresholds --

export const SLO_THRESHOLDS = {
  workflowSuccessRate: 0.99, // 99%
  hitlDeliveryLatencyP95Ms: 10_000, // 10 seconds
  mcpSuccessRate: 0.995, // 99.5%
  auditDlqMaxPending: 100, // alert if >100 pending DLQ entries
  retentionMaxFailures: 0, // any failure fires alert
  notificationDeliveryRate: 0.95, // 95%
} as const;

// -- alert definitions --

export const workflowSuccessAlert: SloAlert = {
  id: 'slo-workflow-success',
  name: 'Workflow Success Rate',
  description:
    'Fires when workflow success rate drops below 99% over 5-minute window',
  warning: 'S5-W13',
  evaluate: (metrics) => {
    const rate =
      metrics.workflowTotal > 0
        ? metrics.workflowSuccess / metrics.workflowTotal
        : 1;
    if (rate < SLO_THRESHOLDS.workflowSuccessRate) {
      return {
        status: 'firing',
        value: rate,
        threshold: SLO_THRESHOLDS.workflowSuccessRate,
        message: `Workflow success rate ${(rate * 100).toFixed(1)}% is below ${SLO_THRESHOLDS.workflowSuccessRate * 100}% SLO`,
      };
    }
    return {
      status: 'ok',
      value: rate,
      threshold: SLO_THRESHOLDS.workflowSuccessRate,
    };
  },
};

export const hitlLatencyAlert: SloAlert = {
  id: 'slo-hitl-latency',
  name: 'HITL Delivery Latency',
  description: 'Fires when HITL delivery P95 latency exceeds 10 seconds',
  warning: 'S5-W14',
  evaluate: (metrics) => {
    const p95 = metrics.hitlDeliveryLatencyP95Ms;
    if (p95 > SLO_THRESHOLDS.hitlDeliveryLatencyP95Ms) {
      return {
        status: 'firing',
        value: p95,
        threshold: SLO_THRESHOLDS.hitlDeliveryLatencyP95Ms,
        message: `HITL P95 latency ${p95}ms exceeds ${SLO_THRESHOLDS.hitlDeliveryLatencyP95Ms}ms SLO`,
      };
    }
    return {
      status: 'ok',
      value: p95,
      threshold: SLO_THRESHOLDS.hitlDeliveryLatencyP95Ms,
    };
  },
};

export const mcpSuccessAlert: SloAlert = {
  id: 'slo-mcp-success',
  name: 'MCP Success Rate',
  description:
    'Fires when MCP tool call success rate drops below 99.5%',
  warning: 'S5-W15',
  evaluate: (metrics) => {
    const rate =
      metrics.mcpCallTotal > 0
        ? metrics.mcpCallSuccess / metrics.mcpCallTotal
        : 1;
    if (rate < SLO_THRESHOLDS.mcpSuccessRate) {
      return {
        status: 'firing',
        value: rate,
        threshold: SLO_THRESHOLDS.mcpSuccessRate,
        message: `MCP success rate ${(rate * 100).toFixed(1)}% is below ${SLO_THRESHOLDS.mcpSuccessRate * 100}% SLO`,
      };
    }
    return {
      status: 'ok',
      value: rate,
      threshold: SLO_THRESHOLDS.mcpSuccessRate,
    };
  },
};

export const auditIntegrityAlert: SloAlert = {
  id: 'slo-audit-integrity',
  name: 'Audit Integrity',
  description: 'Fires when pending audit DLQ entries exceed threshold',
  warning: 'S5-W16',
  evaluate: (metrics) => {
    const count = metrics.auditDlqPendingCount;
    if (count > SLO_THRESHOLDS.auditDlqMaxPending) {
      return {
        status: 'firing',
        value: count,
        threshold: SLO_THRESHOLDS.auditDlqMaxPending,
        message: `Audit DLQ has ${count} pending entries (threshold: ${SLO_THRESHOLDS.auditDlqMaxPending})`,
      };
    }
    return {
      status: 'ok',
      value: count,
      threshold: SLO_THRESHOLDS.auditDlqMaxPending,
    };
  },
};

export const retentionFailureAlert: SloAlert = {
  id: 'slo-retention-failure',
  name: 'Data Retention Failure',
  description: 'Fires when any data retention workflow reports failure',
  warning: 'S4-W10',
  evaluate: (metrics) => {
    const count = metrics.retentionFailureCount;
    if (count > SLO_THRESHOLDS.retentionMaxFailures) {
      return {
        status: 'firing',
        value: count,
        threshold: SLO_THRESHOLDS.retentionMaxFailures,
        message: `Data retention has ${count} failed runs (threshold: ${SLO_THRESHOLDS.retentionMaxFailures})`,
      };
    }
    return {
      status: 'ok',
      value: count,
      threshold: SLO_THRESHOLDS.retentionMaxFailures,
    };
  },
};

export const notificationDeliveryAlert: SloAlert = {
  id: 'slo-notification-delivery',
  name: 'Notification Delivery Rate',
  description: 'Fires when notification delivery rate drops below 95%',
  warning: 'T1-W23',
  evaluate: (metrics) => {
    const rate =
      metrics.notificationTotal > 0
        ? metrics.notificationDelivered / metrics.notificationTotal
        : 1;
    if (rate < SLO_THRESHOLDS.notificationDeliveryRate) {
      return {
        status: 'firing',
        value: rate,
        threshold: SLO_THRESHOLDS.notificationDeliveryRate,
        message: `Notification delivery rate ${(rate * 100).toFixed(1)}% is below ${SLO_THRESHOLDS.notificationDeliveryRate * 100}% SLO`,
      };
    }
    return {
      status: 'ok',
      value: rate,
      threshold: SLO_THRESHOLDS.notificationDeliveryRate,
    };
  },
};

// -- burn-rate alert helpers (OBS-01) --

/**
 * create an SloAlert adapter that wraps burn-rate evaluation into
 * the existing SloAlertResult interface. the fast window metrics are
 * derived from the standard SloMetrics snapshot (5-minute window).
 * the slow window uses the same snapshot scaled — in production the
 * slow window would come from a longer aggregation, but for the alert
 * interface we use the same metrics and flag it accordingly.
 */
function createBurnRateAlert(configIndex: number): SloAlert {
  const config = DEFAULT_BURN_RATE_CONFIGS[configIndex]!;

  // derive window metrics from the SloMetrics snapshot
  const deriveWindows = (
    metrics: SloMetrics,
  ): { fast: WindowMetrics; slow: WindowMetrics } => {
    if (config.name === 'workflow-success-burn') {
      const total = metrics.workflowTotal;
      const failed = total - metrics.workflowSuccess;
      return {
        fast: { totalEvents: total, failedEvents: failed },
        slow: { totalEvents: total, failedEvents: failed },
      };
    }
    // mcp-success-burn
    const total = metrics.mcpCallTotal;
    const failed = total - metrics.mcpCallSuccess;
    return {
      fast: { totalEvents: total, failedEvents: failed },
      slow: { totalEvents: total, failedEvents: failed },
    };
  };

  return {
    id: `slo-burn-${config.name}`,
    name: `Burn Rate: ${config.name}`,
    description: `Fires when ${config.name} burn rate exceeds ${config.fastBurnMultiplier}x (critical) or ${config.slowBurnMultiplier}x (warning)`,
    warning: 'OBS-01',
    evaluate: (metrics) => {
      const { fast, slow } = deriveWindows(metrics);
      const result = evaluateBurnRate(config, fast, slow);

      if (result.status === 'critical') {
        return {
          status: 'firing',
          value: result.fastBurnRate,
          threshold: config.fastBurnMultiplier,
          message: `${config.name} fast burn rate ${result.fastBurnRate.toFixed(1)}x exceeds ${config.fastBurnMultiplier}x threshold (critical)`,
        };
      }

      if (result.status === 'warning') {
        return {
          status: 'firing',
          value: result.slowBurnRate,
          threshold: config.slowBurnMultiplier,
          message: `${config.name} slow burn rate ${result.slowBurnRate.toFixed(1)}x exceeds ${config.slowBurnMultiplier}x threshold (warning)`,
        };
      }

      // ok or suppressed
      return {
        status: 'ok',
        value: result.fastBurnRate,
        threshold: config.fastBurnMultiplier,
      };
    },
  };
}

export const workflowBurnRateAlert: SloAlert = createBurnRateAlert(0);
export const mcpBurnRateAlert: SloAlert = createBurnRateAlert(1);

// -- aggregate evaluator --

export const ALL_SLO_ALERTS: SloAlert[] = [
  workflowSuccessAlert,
  hitlLatencyAlert,
  mcpSuccessAlert,
  auditIntegrityAlert,
  retentionFailureAlert,
  notificationDeliveryAlert,
  workflowBurnRateAlert,
  mcpBurnRateAlert,
];

export function evaluateAllSlos(
  metrics: SloMetrics,
): Map<string, SloAlertResult> {
  const results = new Map<string, SloAlertResult>();
  for (const alert of ALL_SLO_ALERTS) {
    results.set(alert.id, alert.evaluate(metrics));
  }
  return results;
}
