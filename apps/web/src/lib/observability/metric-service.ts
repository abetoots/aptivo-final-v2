/**
 * S7-CF-01: shared metric service for SLO cron and dashboard APIs
 * @task S7-CF-01
 *
 * provides real drizzle aggregation queries for all 6 SLO metric providers.
 * both the SLO cron and admin dashboard APIs consume this service.
 */

import type { SloMetricsDeps } from './slo-cron.js';
import type { SafetyInferenceCounter } from '@aptivo/llm-gateway/safety';

// -- types --

export interface MetricServiceDeps {
  /** count pending DLQ entries */
  countDlqPending: () => Promise<number>;
  /** count audit logs by action pattern within window */
  countAuditByAction: (pattern: string, windowMs: number) => Promise<number>;
  /** count HITL requests by status within window */
  countHitlByStatus: (status: string, windowMs: number) => Promise<number>;
  /** get HITL latency P95 from resolved requests within window */
  getHitlP95LatencyMs: (windowMs: number) => Promise<number>;
  /** count notification deliveries by status within window */
  countDeliveriesByStatus: (status: string, windowMs: number) => Promise<number>;
  /** count total notification deliveries within window */
  countDeliveriesTotal: (windowMs: number) => Promise<number>;
  /**
   * S17-B4: ML safety classifier outcome counter. Wired by the
   * composition root to the same counter the ML classifier increments
   * on each call. Used to compute the timeout-rate burn signal.
   */
  safetyInferenceCounter: SafetyInferenceCounter;
}

export interface MetricService extends SloMetricsDeps {
  /** all SloMetricsDeps methods are inherited */
}

// -- default window (5 minutes, matching cron interval) --

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

// -- factory --

export function createMetricService(
  deps: MetricServiceDeps,
  windowMs: number = DEFAULT_WINDOW_MS,
): MetricService {
  return {
    async getAuditDlqPendingCount() {
      return deps.countDlqPending();
    },

    async getWorkflowCounts() {
      const [total, success] = await Promise.all([
        deps.countAuditByAction('workflow.%', windowMs),
        deps.countAuditByAction('workflow.complete%', windowMs),
      ]);
      return { total, success };
    },

    async getMcpCallCounts() {
      const [total, success] = await Promise.all([
        deps.countAuditByAction('mcp.call.%', windowMs),
        deps.countAuditByAction('mcp.call.success%', windowMs),
      ]);
      return { total, success };
    },

    async getHitlLatencyP95() {
      return deps.getHitlP95LatencyMs(windowMs);
    },

    async getRetentionFailureCount() {
      return deps.countAuditByAction('retention.failure%', windowMs);
    },

    async getNotificationCounts() {
      const [total, delivered] = await Promise.all([
        deps.countDeliveriesTotal(windowMs),
        deps.countDeliveriesByStatus('delivered', windowMs),
      ]);
      return { total, delivered };
    },

    // S17-B4: sync read-through to the in-process counter. The cron's
    // collectSloMetrics will Promise.all() everything else and call
    // this synchronously inside the assembled metrics record.
    getMlSafetyMetrics() {
      return {
        timeoutRate: deps.safetyInferenceCounter.timeoutRate(windowMs),
        volume: deps.safetyInferenceCounter.volumeInWindow(windowMs),
      };
    },
  };
}
