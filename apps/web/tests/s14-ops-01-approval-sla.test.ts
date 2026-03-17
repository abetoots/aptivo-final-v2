/**
 * S14-OPS-01: Approval SLA Metrics + Dashboard tests
 * @task OPS-01
 *
 * verifies the approval sla service computes per-request metrics,
 * aggregate dashboard stats, policy-type grouping, breach rates,
 * and handles edge cases (empty data, pending requests, custom config).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createApprovalSlaService,
  DEFAULT_SLA_CONFIG,
  type ApprovalSlaStoreDeps,
} from '../src/lib/observability/approval-sla-service';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: {
  id?: string;
  policyType?: string;
  createdAt?: Date;
  resolvedAt?: Date | null;
  decisions?: Array<{ approverId: string; decidedAt: Date; decision: string }>;
}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    policyType: overrides.policyType ?? 'single',
    createdAt: overrides.createdAt ?? new Date('2026-03-01T00:00:00Z'),
    // use 'in' check so explicit null is preserved (not replaced by ?? default)
    resolvedAt: 'resolvedAt' in overrides ? (overrides.resolvedAt as Date | null) : new Date('2026-03-01T01:00:00Z'),
    decisions: overrides.decisions ?? [],
  };
}

// 1 hour in ms
const ONE_HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// getMetrics
// ---------------------------------------------------------------------------

describe('ApprovalSlaService.getMetrics', () => {
  it('returns per-request SLA data', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    const resolved = new Date('2026-03-01T02:00:00Z');
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: resolved }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.policyType).toBe('single');
    expect(result.value[0]!.totalLatencyMs).toBe(2 * ONE_HOUR);
    expect(result.value[0]!.slaTarget).toBe(DEFAULT_SLA_CONFIG.slaByPolicyType.single);
  });

  it('marks SLA met when latency < target', async () => {
    // single sla = 24h, latency = 1h => met
    const created = new Date('2026-03-01T00:00:00Z');
    const resolved = new Date('2026-03-01T01:00:00Z');
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: resolved }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.slaMet).toBe(true);
  });

  it('marks SLA breached when latency > target', async () => {
    // quorum sla = 4h, latency = 5h => breached
    const created = new Date('2026-03-01T00:00:00Z');
    const resolved = new Date('2026-03-01T05:00:00Z');
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'quorum', createdAt: created, resolvedAt: resolved }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.slaMet).toBe(false);
    expect(result.value[0]!.totalLatencyMs).toBe(5 * ONE_HOUR);
  });

  it('calculates per-approver latency correctly', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    const resolved = new Date('2026-03-01T03:00:00Z');
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({
          policyType: 'quorum',
          createdAt: created,
          resolvedAt: resolved,
          decisions: [
            { approverId: 'a1', decidedAt: new Date('2026-03-01T01:00:00Z'), decision: 'approved' },
            { approverId: 'a2', decidedAt: new Date('2026-03-01T02:30:00Z'), decision: 'approved' },
          ],
        }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const approvers = result.value[0]!.perApproverLatency;
    expect(approvers).toHaveLength(2);
    expect(approvers[0]!.approverId).toBe('a1');
    expect(approvers[0]!.latencyMs).toBe(1 * ONE_HOUR);
    expect(approvers[0]!.decision).toBe('approved');
    expect(approvers[1]!.approverId).toBe('a2');
    expect(approvers[1]!.latencyMs).toBe(2.5 * ONE_HOUR);
  });

  it('handles pending requests (no resolvedAt)', async () => {
    const created = new Date(Date.now() - 2 * ONE_HOUR);
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: null }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.resolvedAt).toBeNull();
    // latency should be approximately 2 hours (give or take a few ms for test execution)
    expect(result.value[0]!.totalLatencyMs).toBeGreaterThan(1.9 * ONE_HOUR);
    expect(result.value[0]!.totalLatencyMs).toBeLessThan(2.1 * ONE_HOUR);
  });

  it('returns SlaError when deps throw', async () => {
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockRejectedValue(new Error('db down')),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getMetrics();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SlaError');
  });

  it('passes filters through to getRequests', async () => {
    const getRequests = vi.fn().mockResolvedValue([]);
    const deps: ApprovalSlaStoreDeps = { getRequests };
    const svc = createApprovalSlaService(deps);

    const from = new Date('2026-03-01');
    const to = new Date('2026-03-15');
    await svc.getMetrics({ status: 'resolved', from, to });

    expect(getRequests).toHaveBeenCalledWith({ status: 'resolved', from, to });
  });
});

// ---------------------------------------------------------------------------
// getDashboard
// ---------------------------------------------------------------------------

describe('ApprovalSlaService.getDashboard', () => {
  it('returns aggregate stats for resolved requests', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: new Date('2026-03-01T02:00:00Z') }),
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: new Date('2026-03-01T04:00:00Z') }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalRequests).toBe(2);
    expect(result.value.resolvedCount).toBe(2);
    expect(result.value.pendingCount).toBe(0);
  });

  it('calculates average latency correctly', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    // two requests: 2h and 4h => avg = 3h
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: new Date('2026-03-01T02:00:00Z') }),
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: new Date('2026-03-01T04:00:00Z') }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.averageLatencyMs).toBe(3 * ONE_HOUR);
  });

  it('calculates P95 latency correctly', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    // 20 requests with latencies 1h, 2h, ..., 20h
    const requests = Array.from({ length: 20 }, (_, i) =>
      makeRequest({
        policyType: 'single',
        createdAt: created,
        resolvedAt: new Date(created.getTime() + (i + 1) * ONE_HOUR),
      }),
    );
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue(requests),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // sorted latencies: [1h, 2h, ..., 20h]
    // p95 index = floor(20 * 0.95) = 19 => 20h
    expect(result.value.p95LatencyMs).toBe(20 * ONE_HOUR);
  });

  it('calculates breach rate correctly', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    // quorum sla = 4h. two within sla (2h, 3h), one breached (5h)
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'quorum', createdAt: created, resolvedAt: new Date(created.getTime() + 2 * ONE_HOUR) }),
        makeRequest({ policyType: 'quorum', createdAt: created, resolvedAt: new Date(created.getTime() + 3 * ONE_HOUR) }),
        makeRequest({ policyType: 'quorum', createdAt: created, resolvedAt: new Date(created.getTime() + 5 * ONE_HOUR) }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1 breach out of 3 resolved
    expect(result.value.slaBreachRate).toBeCloseTo(1 / 3, 5);
  });

  it('groups stats by policy type', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: new Date(created.getTime() + 2 * ONE_HOUR) }),
        makeRequest({ policyType: 'quorum', createdAt: created, resolvedAt: new Date(created.getTime() + 3 * ONE_HOUR) }),
        makeRequest({ policyType: 'quorum', createdAt: created, resolvedAt: new Date(created.getTime() + 5 * ONE_HOUR) }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.byPolicyType.single).toBeDefined();
    expect(result.value.byPolicyType.single!.count).toBe(1);
    expect(result.value.byPolicyType.single!.avgLatencyMs).toBe(2 * ONE_HOUR);

    expect(result.value.byPolicyType.quorum).toBeDefined();
    expect(result.value.byPolicyType.quorum!.count).toBe(2);
    expect(result.value.byPolicyType.quorum!.avgLatencyMs).toBe(4 * ONE_HOUR);
    // 1 of 2 quorum requests breached (5h > 4h sla)
    expect(result.value.byPolicyType.quorum!.breachRate).toBe(0.5);
  });

  it('returns zeroed dashboard for empty requests', async () => {
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalRequests).toBe(0);
    expect(result.value.resolvedCount).toBe(0);
    expect(result.value.pendingCount).toBe(0);
    expect(result.value.averageLatencyMs).toBe(0);
    expect(result.value.p95LatencyMs).toBe(0);
    expect(result.value.slaBreachRate).toBe(0);
    expect(result.value.byPolicyType).toStrictEqual({});
  });

  it('counts pending requests separately from resolved', async () => {
    const created = new Date(Date.now() - ONE_HOUR);
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: new Date(created.getTime() + ONE_HOUR) }),
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: null }),
        makeRequest({ policyType: 'quorum', createdAt: created, resolvedAt: null }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalRequests).toBe(3);
    expect(result.value.resolvedCount).toBe(1);
    expect(result.value.pendingCount).toBe(2);
  });

  it('propagates SlaError from getMetrics', async () => {
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockRejectedValue(new Error('db fail')),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getDashboard();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SlaError');
  });
});

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

describe('ApprovalSlaService config', () => {
  it('uses custom SLA config when provided', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    // custom: single = 1h. latency = 2h => breached
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: new Date(created.getTime() + 2 * ONE_HOUR) }),
      ]),
    };
    const svc = createApprovalSlaService(deps, {
      slaByPolicyType: { single: 1 * ONE_HOUR },
    });
    const result = await svc.getMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.slaTarget).toBe(1 * ONE_HOUR);
    expect(result.value[0]!.slaMet).toBe(false);
  });

  it('falls back to defaultSlaMs for unknown policy types', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'custom-type', createdAt: created, resolvedAt: new Date(created.getTime() + ONE_HOUR) }),
      ]),
    };
    const svc = createApprovalSlaService(deps);
    const result = await svc.getMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.slaTarget).toBe(DEFAULT_SLA_CONFIG.defaultSlaMs);
  });

  it('DEFAULT_SLA_CONFIG has correct structure', () => {
    expect(DEFAULT_SLA_CONFIG.defaultSlaMs).toBe(24 * 60 * 60 * 1000);
    expect(DEFAULT_SLA_CONFIG.slaByPolicyType.single).toBe(24 * 60 * 60 * 1000);
    expect(DEFAULT_SLA_CONFIG.slaByPolicyType.quorum).toBe(4 * 60 * 60 * 1000);
    expect(DEFAULT_SLA_CONFIG.slaByPolicyType.sequential).toBe(48 * 60 * 60 * 1000);
  });

  it('merges custom config with defaults', async () => {
    const created = new Date('2026-03-01T00:00:00Z');
    // override only quorum, single should keep default
    const deps: ApprovalSlaStoreDeps = {
      getRequests: vi.fn().mockResolvedValue([
        makeRequest({ policyType: 'single', createdAt: created, resolvedAt: new Date(created.getTime() + ONE_HOUR) }),
        makeRequest({ policyType: 'quorum', createdAt: created, resolvedAt: new Date(created.getTime() + ONE_HOUR) }),
      ]),
    };
    const svc = createApprovalSlaService(deps, {
      slaByPolicyType: { quorum: 2 * ONE_HOUR },
    });
    const result = await svc.getMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // single should still use default 24h
    expect(result.value[0]!.slaTarget).toBe(24 * ONE_HOUR);
    // quorum should use custom 2h
    expect(result.value[1]!.slaTarget).toBe(2 * ONE_HOUR);
  });
});

// ---------------------------------------------------------------------------
// api route
// ---------------------------------------------------------------------------

describe('GET /api/admin/approval-sla', () => {
  it('route module exports GET handler', async () => {
    const routeModule = await import('../src/app/api/admin/approval-sla/route');
    expect(typeof routeModule.GET).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// composition root
// ---------------------------------------------------------------------------

describe('composition root', () => {
  it('exports getApprovalSlaService', async () => {
    const services = await import('../src/lib/services');
    expect(typeof services.getApprovalSlaService).toBe('function');
  });
});
