/**
 * S7-INT-02: admin overview API
 * @task S7-INT-02
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '../../../../lib/security/rbac-middleware';
import { getAdminStore, getMetricService } from '../../../../lib/services';

const ACTIVE_WORKFLOW_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
  // rbac check
  const forbidden = await checkPermission('platform/admin.view')(request);
  if (forbidden) return forbidden;

  const adminStore = getAdminStore();
  const metricService = getMetricService();

  const [pendingHitlCount, recentAudit, sloHealth, activeWorkflowCount] =
    await Promise.all([
      adminStore.getPendingHitlCount(),
      adminStore.getRecentAuditLogs(50),
      collectSloHealth(metricService),
      adminStore.getActiveWorkflowCount(ACTIVE_WORKFLOW_WINDOW_MS),
    ]);

  return NextResponse.json({
    pendingHitlCount,
    activeWorkflowCount,
    recentAuditEvents: recentAudit,
    sloHealth,
  });
}

// -- helpers --

async function collectSloHealth(metricService: ReturnType<typeof getMetricService>) {
  const [workflow, mcp, hitlP95, dlqCount] = await Promise.all([
    metricService.getWorkflowCounts(),
    metricService.getMcpCallCounts(),
    metricService.getHitlLatencyP95(),
    metricService.getAuditDlqPendingCount(),
  ]);

  const workflowRate = workflow.total > 0 ? workflow.success / workflow.total : 1;
  const mcpRate = mcp.total > 0 ? mcp.success / mcp.total : 1;

  return {
    workflowSuccessRate: workflowRate,
    mcpSuccessRate: mcpRate,
    hitlLatencyP95Ms: hitlP95,
    auditDlqPending: dlqCount,
    status: workflowRate >= 0.99 && mcpRate >= 0.995 && dlqCount <= 100 ? 'healthy' : 'degraded',
  };
}
