/**
 * S6-CF-01: SLO runtime integration tests
 * @task S6-CF-01
 * @warning S4-W10, T1-W23
 *
 * covers:
 * - retention failure evaluator (S4-W10)
 * - notification delivery evaluator (T1-W23)
 * - collectSloMetrics aggregation
 * - slo cron function (inngest integration)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';

// -- direct evaluator imports --

import {
  retentionFailureAlert,
  notificationDeliveryAlert,
  evaluateAllSlos,
  SLO_THRESHOLDS,
  type SloMetrics,
} from '../src/lib/observability/slo-alerts';

// -- mock inngest.send before importing slo-cron --

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/lib/inngest', async () => {
  const { Inngest } = await import('inngest');
  const mockInngest = new Inngest({ id: 'test-slo' });
  mockInngest.send = mockSend as typeof mockInngest.send;
  return { inngest: mockInngest };
});

import {
  collectSloMetrics,
  createSloCronFunction,
  type SloMetricsDeps,
} from '../src/lib/observability/slo-cron';

// -- helpers --

const healthyMetrics: SloMetrics = {
  workflowTotal: 1000,
  workflowSuccess: 1000,
  hitlDeliveryLatencyP95Ms: 2000,
  mcpCallTotal: 500,
  mcpCallSuccess: 500,
  auditDlqPendingCount: 5,
  retentionFailureCount: 0,
  notificationTotal: 200,
  notificationDelivered: 200,
};

function makeDeps(overrides?: Partial<SloMetricsDeps>): SloMetricsDeps {
  return {
    getAuditDlqPendingCount: async () => 5,
    getWorkflowCounts: async () => ({ total: 1000, success: 1000 }),
    getMcpCallCounts: async () => ({ total: 500, success: 500 }),
    getHitlLatencyP95: async () => 2000,
    getRetentionFailureCount: async () => 0,
    getNotificationCounts: async () => ({ total: 200, delivered: 200 }),
    ...overrides,
  };
}

// -- setup --

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// retention failure evaluator (S4-W10)
// ---------------------------------------------------------------------------

describe('S6-CF-01: retention failure evaluator (S4-W10)', () => {
  it('returns ok when failure count is 0', () => {
    const result = retentionFailureAlert.evaluate(healthyMetrics);
    expect(result.status).toBe('ok');
    expect(result.value).toBe(0);
    expect(result.threshold).toBe(SLO_THRESHOLDS.retentionMaxFailures);
  });

  it('fires when failure count > 0', () => {
    const result = retentionFailureAlert.evaluate({
      ...healthyMetrics,
      retentionFailureCount: 3,
    });
    expect(result.status).toBe('firing');
    expect(result.value).toBe(3);
    if (result.status === 'firing') {
      expect(result.message).toContain('3 failed runs');
    }
  });

  it('has correct alert metadata', () => {
    expect(retentionFailureAlert.id).toBe('slo-retention-failure');
    expect(retentionFailureAlert.warning).toBe('S4-W10');
  });
});

// ---------------------------------------------------------------------------
// notification delivery evaluator (T1-W23)
// ---------------------------------------------------------------------------

describe('S6-CF-01: notification delivery evaluator (T1-W23)', () => {
  it('returns ok when delivery rate >= 95%', () => {
    const result = notificationDeliveryAlert.evaluate(healthyMetrics);
    expect(result.status).toBe('ok');
    expect(result.value).toBe(1); // 200/200 = 100%
  });

  it('fires when delivery rate < 95%', () => {
    const result = notificationDeliveryAlert.evaluate({
      ...healthyMetrics,
      notificationTotal: 100,
      notificationDelivered: 90, // 90%
    });
    expect(result.status).toBe('firing');
    expect(result.value).toBeCloseTo(0.9);
    if (result.status === 'firing') {
      expect(result.message).toContain('90.0%');
      expect(result.message).toContain('95%');
    }
  });

  it('returns ok when total is 0 (no data = healthy)', () => {
    const result = notificationDeliveryAlert.evaluate({
      ...healthyMetrics,
      notificationTotal: 0,
      notificationDelivered: 0,
    });
    expect(result.status).toBe('ok');
    expect(result.value).toBe(1); // defaults to 100%
  });

  it('has correct alert metadata', () => {
    expect(notificationDeliveryAlert.id).toBe('slo-notification-delivery');
    expect(notificationDeliveryAlert.warning).toBe('T1-W23');
  });
});

// ---------------------------------------------------------------------------
// collectSloMetrics
// ---------------------------------------------------------------------------

describe('S6-CF-01: collectSloMetrics', () => {
  it('returns complete SloMetrics from deps', async () => {
    const deps = makeDeps();
    const metrics = await collectSloMetrics(deps);

    expect(metrics).toEqual({
      workflowTotal: 1000,
      workflowSuccess: 1000,
      hitlDeliveryLatencyP95Ms: 2000,
      mcpCallTotal: 500,
      mcpCallSuccess: 500,
      auditDlqPendingCount: 5,
      retentionFailureCount: 0,
      notificationTotal: 200,
      notificationDelivered: 200,
    });
  });

  it('calls all dependency functions in parallel', async () => {
    const spies: SloMetricsDeps = {
      getAuditDlqPendingCount: vi.fn().mockResolvedValue(0),
      getWorkflowCounts: vi.fn().mockResolvedValue({ total: 0, success: 0 }),
      getMcpCallCounts: vi.fn().mockResolvedValue({ total: 0, success: 0 }),
      getHitlLatencyP95: vi.fn().mockResolvedValue(0),
      getRetentionFailureCount: vi.fn().mockResolvedValue(0),
      getNotificationCounts: vi.fn().mockResolvedValue({ total: 0, delivered: 0 }),
    };

    await collectSloMetrics(spies);

    expect(spies.getAuditDlqPendingCount).toHaveBeenCalledOnce();
    expect(spies.getWorkflowCounts).toHaveBeenCalledOnce();
    expect(spies.getMcpCallCounts).toHaveBeenCalledOnce();
    expect(spies.getHitlLatencyP95).toHaveBeenCalledOnce();
    expect(spies.getRetentionFailureCount).toHaveBeenCalledOnce();
    expect(spies.getNotificationCounts).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// slo cron function (inngest integration)
// ---------------------------------------------------------------------------

describe('S6-CF-01: SLO cron function', () => {
  it('evaluates all SLOs and returns results when all ok', async () => {
    const deps = makeDeps();
    const fn = createSloCronFunction(deps);
    const engine = new InngestTestEngine({ function: fn });
    const { result } = await engine.execute();

    expect(result).toMatchObject({
      totalAlerts: 8,
      firingCount: 0,
    });
    expect(result.evaluatedAt).toBeDefined();
    expect(result.results).toBeDefined();

    // no alerts fired, so inngest.send should not be called
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('emits alert events when SLOs are firing', async () => {
    const deps = makeDeps({
      getRetentionFailureCount: async () => 5,
      getNotificationCounts: async () => ({ total: 100, delivered: 80 }),
    });
    const fn = createSloCronFunction(deps);
    const engine = new InngestTestEngine({ function: fn });
    const { result } = await engine.execute();

    expect(result.firingCount).toBeGreaterThan(0);

    // inngest.send should be called with firing alert events
    expect(mockSend).toHaveBeenCalledOnce();
    const sentEvents = mockSend.mock.calls[0]![0] as Array<{
      name: string;
      data: { alertId: string };
    }>;
    expect(sentEvents.length).toBe(result.firingCount);

    // verify event shape
    const alertIds = sentEvents.map((e) => e.data.alertId);
    expect(alertIds).toContain('slo-retention-failure');
    expect(alertIds).toContain('slo-notification-delivery');

    for (const event of sentEvents) {
      expect(event.name).toBe('platform/slo.alert.fired');
      expect(event.data.firedAt).toBeDefined();
      expect(typeof event.data.value).toBe('number');
      expect(typeof event.data.threshold).toBe('number');
    }
  });

  it('skips emit step when no alerts are firing', async () => {
    const deps = makeDeps();
    const fn = createSloCronFunction(deps);
    const engine = new InngestTestEngine({ function: fn });
    const { result } = await engine.execute();

    expect(result.firingCount).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
