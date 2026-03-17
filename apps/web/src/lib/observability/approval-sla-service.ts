/**
 * OPS-01: Approval SLA Metrics + Dashboard Service
 * @task OPS-01
 *
 * computes per-request SLA metrics and aggregate dashboard stats
 * for HITL approval workflows. uses factory function pattern with
 * explicit deps interface for testability.
 */

import { Result } from '@aptivo/types';

// -- types --

export interface ApprovalSlaMetrics {
  requestId: string;
  policyType: string;
  totalLatencyMs: number;
  perApproverLatency: Array<{ approverId: string; latencyMs: number; decision: string }>;
  slaTarget: number; // target latency in ms
  slaMet: boolean;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface ApprovalSlaDashboard {
  totalRequests: number;
  resolvedCount: number;
  pendingCount: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  slaBreachRate: number; // 0-1
  byPolicyType: Record<string, { count: number; avgLatencyMs: number; breachRate: number }>;
}

export interface ApprovalSlaConfig {
  defaultSlaMs: number; // default 24h
  slaByPolicyType: Record<string, number>; // e.g., { quorum: 4h, sequential: 48h }
}

export const DEFAULT_SLA_CONFIG: ApprovalSlaConfig = {
  defaultSlaMs: 24 * 60 * 60 * 1000,
  slaByPolicyType: {
    single: 24 * 60 * 60 * 1000,
    quorum: 4 * 60 * 60 * 1000,
    sequential: 48 * 60 * 60 * 1000,
  },
};

export interface ApprovalSlaStoreDeps {
  getRequests: (filters: { status?: string; from?: Date; to?: Date }) => Promise<Array<{
    id: string;
    policyType: string;
    createdAt: Date;
    resolvedAt: Date | null;
    decisions: Array<{ approverId: string; decidedAt: Date; decision: string }>;
  }>>;
}

// -- factory --

export function createApprovalSlaService(deps: ApprovalSlaStoreDeps, config?: Partial<ApprovalSlaConfig>) {
  const cfg: ApprovalSlaConfig = {
    defaultSlaMs: config?.defaultSlaMs ?? DEFAULT_SLA_CONFIG.defaultSlaMs,
    slaByPolicyType: {
      ...DEFAULT_SLA_CONFIG.slaByPolicyType,
      ...config?.slaByPolicyType,
    },
  };

  // resolve the sla target for a given policy type
  function getSlaTarget(policyType: string): number {
    return cfg.slaByPolicyType[policyType] ?? cfg.defaultSlaMs;
  }

  return {
    async getMetrics(
      filters?: { status?: string; from?: Date; to?: Date },
    ): Promise<Result<ApprovalSlaMetrics[], { _tag: 'SlaError'; cause: unknown }>> {
      try {
        const requests = await deps.getRequests(filters ?? {});
        return Result.ok(
          requests.map((r) => {
            const slaTarget = getSlaTarget(r.policyType);
            const totalLatencyMs = r.resolvedAt
              ? r.resolvedAt.getTime() - r.createdAt.getTime()
              : Date.now() - r.createdAt.getTime();
            return {
              requestId: r.id,
              policyType: r.policyType,
              totalLatencyMs,
              perApproverLatency: r.decisions.map((d) => ({
                approverId: d.approverId,
                latencyMs: d.decidedAt.getTime() - r.createdAt.getTime(),
                decision: d.decision,
              })),
              slaTarget,
              slaMet: totalLatencyMs <= slaTarget,
              createdAt: r.createdAt,
              resolvedAt: r.resolvedAt,
            };
          }),
        );
      } catch (cause) {
        return Result.err({ _tag: 'SlaError' as const, cause });
      }
    },

    async getDashboard(
      filters?: { from?: Date; to?: Date },
    ): Promise<Result<ApprovalSlaDashboard, { _tag: 'SlaError'; cause: unknown }>> {
      const metricsResult = await this.getMetrics(filters);
      if (!metricsResult.ok) return metricsResult;

      const metrics = metricsResult.value;
      const resolved = metrics.filter((m) => m.resolvedAt !== null);
      const pending = metrics.filter((m) => m.resolvedAt === null);
      const latencies = resolved.map((m) => m.totalLatencyMs).sort((a, b) => a - b);
      const breaches = resolved.filter((m) => !m.slaMet);

      // group by policy type
      const byPolicyType: Record<string, { count: number; avgLatencyMs: number; breachRate: number }> = {};
      for (const m of resolved) {
        if (!byPolicyType[m.policyType]) {
          byPolicyType[m.policyType] = { count: 0, avgLatencyMs: 0, breachRate: 0 };
        }
        byPolicyType[m.policyType]!.count++;
      }
      for (const [type, entry] of Object.entries(byPolicyType)) {
        const typeMetrics = resolved.filter((m) => m.policyType === type);
        entry.avgLatencyMs =
          typeMetrics.reduce((sum, m) => sum + m.totalLatencyMs, 0) / typeMetrics.length;
        entry.breachRate =
          typeMetrics.filter((m) => !m.slaMet).length / typeMetrics.length;
      }

      return Result.ok({
        totalRequests: metrics.length,
        resolvedCount: resolved.length,
        pendingCount: pending.length,
        averageLatencyMs:
          latencies.length > 0
            ? latencies.reduce((a, b) => a + b, 0) / latencies.length
            : 0,
        p95LatencyMs:
          latencies.length > 0
            ? latencies[Math.floor(latencies.length * 0.95)] ?? latencies[latencies.length - 1]!
            : 0,
        slaBreachRate:
          resolved.length > 0 ? breaches.length / resolved.length : 0,
        byPolicyType,
      });
    },
  };
}
