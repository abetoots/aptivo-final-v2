/**
 * S7-CF-01: real SLO metric provider tests
 * @task S7-CF-01
 *
 * verifies MetricService bridges between drizzle aggregation queries
 * and the SloMetricsDeps interface consumed by the SLO cron.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMetricService,
  type MetricServiceDeps,
} from '../src/lib/observability/metric-service';

// ---------------------------------------------------------------------------
// mock deps
// ---------------------------------------------------------------------------

function makeMockDeps(overrides?: Partial<MetricServiceDeps>): MetricServiceDeps {
  return {
    countDlqPending: vi.fn().mockResolvedValue(5),
    countAuditByAction: vi.fn().mockImplementation(async (pattern: string) => {
      if (pattern === 'workflow.%') return 100;
      if (pattern === 'workflow.complete%') return 98;
      if (pattern === 'mcp.call.%') return 200;
      if (pattern === 'mcp.call.success%') return 199;
      if (pattern === 'retention.failure%') return 0;
      return 0;
    }),
    countHitlByStatus: vi.fn().mockResolvedValue(10),
    getHitlP95LatencyMs: vi.fn().mockResolvedValue(2500),
    countDeliveriesByStatus: vi.fn().mockResolvedValue(90),
    countDeliveriesTotal: vi.fn().mockResolvedValue(100),
    // S17-B4: stub the in-process safety counter so the metric
    // service constructor doesn't crash on missing deps.
    safetyInferenceCounter: {
      record: vi.fn(),
      timeoutRate: vi.fn().mockReturnValue(0),
      volumeInWindow: vi.fn().mockReturnValue(0),
      reset: vi.fn(),
    },
    // S17-CT-2: stub ticket SLA service. summarizeOpenTickets is the
    // single query the metric layer uses (post-Codex review fix);
    // returns empty so the at-risk evaluator stays at 'ok'.
    ticketSlaService: {
      computeSla: vi.fn().mockResolvedValue(null),
      listAtRisk: vi.fn().mockResolvedValue([]),
      summarizeOpenTickets: vi.fn().mockResolvedValue({
        total: 0,
        atRiskCount: 0,
        breachedCount: 0,
        atRisk: [],
        truncated: false,
      }),
      refreshConfigs: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// MetricService
// ---------------------------------------------------------------------------

describe('S7-CF-01: MetricService', () => {
  describe('getAuditDlqPendingCount', () => {
    it('returns pending count from dlq store', async () => {
      const deps = makeMockDeps();
      const service = createMetricService(deps);
      const count = await service.getAuditDlqPendingCount();
      expect(count).toBe(5);
      expect(deps.countDlqPending).toHaveBeenCalledOnce();
    });
  });

  describe('getWorkflowCounts', () => {
    it('returns total and success counts from audit store', async () => {
      const deps = makeMockDeps();
      const service = createMetricService(deps);
      const counts = await service.getWorkflowCounts();
      expect(counts).toEqual({ total: 100, success: 98 });
      expect(deps.countAuditByAction).toHaveBeenCalledWith('workflow.%', expect.any(Number));
      expect(deps.countAuditByAction).toHaveBeenCalledWith('workflow.complete%', expect.any(Number));
    });
  });

  describe('getMcpCallCounts', () => {
    it('returns total and success counts from audit store', async () => {
      const deps = makeMockDeps();
      const service = createMetricService(deps);
      const counts = await service.getMcpCallCounts();
      expect(counts).toEqual({ total: 200, success: 199 });
      expect(deps.countAuditByAction).toHaveBeenCalledWith('mcp.call.%', expect.any(Number));
      expect(deps.countAuditByAction).toHaveBeenCalledWith('mcp.call.success%', expect.any(Number));
    });
  });

  describe('getHitlLatencyP95', () => {
    it('returns p95 latency from hitl request store', async () => {
      const deps = makeMockDeps();
      const service = createMetricService(deps);
      const p95 = await service.getHitlLatencyP95();
      expect(p95).toBe(2500);
      expect(deps.getHitlP95LatencyMs).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe('getRetentionFailureCount', () => {
    it('returns retention failure count from audit store', async () => {
      const deps = makeMockDeps();
      const service = createMetricService(deps);
      const count = await service.getRetentionFailureCount();
      expect(count).toBe(0);
      expect(deps.countAuditByAction).toHaveBeenCalledWith('retention.failure%', expect.any(Number));
    });
  });

  describe('getNotificationCounts', () => {
    it('returns total and delivered counts from delivery store', async () => {
      const deps = makeMockDeps();
      const service = createMetricService(deps);
      const counts = await service.getNotificationCounts();
      expect(counts).toEqual({ total: 100, delivered: 90 });
      expect(deps.countDeliveriesTotal).toHaveBeenCalledWith(expect.any(Number));
      expect(deps.countDeliveriesByStatus).toHaveBeenCalledWith('delivered', expect.any(Number));
    });
  });

  describe('custom window', () => {
    it('passes custom window to all queries', async () => {
      const deps = makeMockDeps();
      const customWindow = 10 * 60 * 1000; // 10 minutes
      const service = createMetricService(deps, customWindow);

      await service.getWorkflowCounts();
      expect(deps.countAuditByAction).toHaveBeenCalledWith('workflow.%', customWindow);

      await service.getHitlLatencyP95();
      expect(deps.getHitlP95LatencyMs).toHaveBeenCalledWith(customWindow);

      await service.getNotificationCounts();
      expect(deps.countDeliveriesTotal).toHaveBeenCalledWith(customWindow);
    });
  });

  describe('SloMetricsDeps compatibility', () => {
    it('fulfills the SloMetricsDeps interface for SLO cron', async () => {
      const deps = makeMockDeps();
      const service = createMetricService(deps);

      // verify all 6 SloMetricsDeps methods exist and return correct types
      const dlqCount = await service.getAuditDlqPendingCount();
      expect(typeof dlqCount).toBe('number');

      const workflow = await service.getWorkflowCounts();
      expect(typeof workflow.total).toBe('number');
      expect(typeof workflow.success).toBe('number');

      const mcp = await service.getMcpCallCounts();
      expect(typeof mcp.total).toBe('number');
      expect(typeof mcp.success).toBe('number');

      const p95 = await service.getHitlLatencyP95();
      expect(typeof p95).toBe('number');

      const retention = await service.getRetentionFailureCount();
      expect(typeof retention).toBe('number');

      const notifications = await service.getNotificationCounts();
      expect(typeof notifications.total).toBe('number');
      expect(typeof notifications.delivered).toBe('number');
    });
  });
});
