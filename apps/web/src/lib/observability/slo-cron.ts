/**
 * S6-CF-01: SLO cron function — evaluates all SLO alerts every 5 minutes
 * @task S6-CF-01
 * @warning S4-W10, T1-W23
 */

import { inngest } from '../inngest.js';
import { evaluateAllSlos } from './slo-alerts.js';
import type { SloMetrics } from './slo-alerts.js';

// -- types --

export interface SloMetricsDeps {
  getAuditDlqPendingCount: () => Promise<number>;
  getWorkflowCounts: () => Promise<{ total: number; success: number }>;
  getMcpCallCounts: () => Promise<{ total: number; success: number }>;
  getHitlLatencyP95: () => Promise<number>;
  getRetentionFailureCount: () => Promise<number>;
  getNotificationCounts: () => Promise<{ total: number; delivered: number }>;
}

// -- metrics collector --

export async function collectSloMetrics(
  deps: SloMetricsDeps,
): Promise<SloMetrics> {
  const [dlqCount, workflow, mcp, hitlP95, retentionFailures, notifications] =
    await Promise.all([
      deps.getAuditDlqPendingCount(),
      deps.getWorkflowCounts(),
      deps.getMcpCallCounts(),
      deps.getHitlLatencyP95(),
      deps.getRetentionFailureCount(),
      deps.getNotificationCounts(),
    ]);

  return {
    workflowTotal: workflow.total,
    workflowSuccess: workflow.success,
    hitlDeliveryLatencyP95Ms: hitlP95,
    mcpCallTotal: mcp.total,
    mcpCallSuccess: mcp.success,
    auditDlqPendingCount: dlqCount,
    retentionFailureCount: retentionFailures,
    notificationTotal: notifications.total,
    notificationDelivered: notifications.delivered,
  };
}

// -- cron function factory --

export function createSloCronFunction(deps: SloMetricsDeps) {
  return inngest.createFunction(
    { id: 'slo-evaluate', retries: 1 },
    { cron: '*/5 * * * *' },
    async ({ step }) => {
      const metrics = await step.run('collect-metrics', () =>
        collectSloMetrics(deps),
      );

      const results = await step.run('evaluate-slos', () => {
        const resultMap = evaluateAllSlos(metrics);
        // convert map to serializable object for inngest step memoization
        const entries: Record<
          string,
          { status: string; value: number; threshold: number; message?: string }
        > = {};
        for (const [id, result] of resultMap) {
          entries[id] = result;
        }
        return entries;
      });

      // emit events for firing alerts
      const firingAlerts = Object.entries(results).filter(
        ([, r]) => r.status === 'firing',
      );

      if (firingAlerts.length > 0) {
        await step.run('emit-alerts', async () => {
          await inngest.send(
            firingAlerts.map(([id, result]) => ({
              name: 'platform/slo.alert.fired' as const,
              data: {
                alertId: id,
                value: result.value,
                threshold: result.threshold,
                message: result.message ?? '',
                firedAt: new Date().toISOString(),
              },
            })),
          );
        });
      }

      return {
        evaluatedAt: new Date().toISOString(),
        totalAlerts: Object.keys(results).length,
        firingCount: firingAlerts.length,
        results,
      };
    },
  );
}
