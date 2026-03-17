/**
 * NOTIF2-02: Novu Silent-Drop Monitoring tests
 * @task NOTIF2-02
 *
 * verifies delivery health monitoring logic: drop rate calculation,
 * threshold alerting, edge cases, and error handling.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createDeliveryMonitor,
  DEFAULT_MONITOR_CONFIG,
} from '@aptivo/notifications';
import type {
  DeliveryMonitorDeps,
  DeliveryMonitorConfig,
  DeliveryHealthMetrics,
} from '@aptivo/notifications';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeDeps(stats: { sent: number; delivered: number; failed: number }): DeliveryMonitorDeps {
  return {
    getDeliveryStats: vi.fn().mockResolvedValue(stats),
  };
}

function makeFailing(error: Error): DeliveryMonitorDeps {
  return {
    getDeliveryStats: vi.fn().mockRejectedValue(error),
  };
}

// ---------------------------------------------------------------------------
// DEFAULT_MONITOR_CONFIG structure
// ---------------------------------------------------------------------------

describe('DEFAULT_MONITOR_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_MONITOR_CONFIG.windowMs).toBe(60 * 60 * 1000);
    expect(DEFAULT_MONITOR_CONFIG.dropRateThreshold).toBe(0.05);
    expect(DEFAULT_MONITOR_CONFIG.minSentThreshold).toBe(10);
  });

  it('has correct types for all fields', () => {
    expect(typeof DEFAULT_MONITOR_CONFIG.windowMs).toBe('number');
    expect(typeof DEFAULT_MONITOR_CONFIG.dropRateThreshold).toBe('number');
    expect(typeof DEFAULT_MONITOR_CONFIG.minSentThreshold).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// healthy scenarios
// ---------------------------------------------------------------------------

describe('healthy scenarios', () => {
  it('reports healthy when all notifications delivered', async () => {
    const deps = makeDeps({ sent: 100, delivered: 100, failed: 0 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.totalPending).toBe(0);
    expect(result.value.dropRate).toBe(0);
    expect(result.value.totalSent).toBe(100);
    expect(result.value.totalDelivered).toBe(100);
    expect(result.value.totalFailed).toBe(0);
  });

  it('reports healthy when drop rate is below threshold', async () => {
    // 2 pending out of 100 = 2% < 5% default threshold
    const deps = makeDeps({ sent: 100, delivered: 95, failed: 3 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.totalPending).toBe(2);
    expect(result.value.dropRate).toBe(0.02);
  });

  it('reports healthy when drop rate equals threshold', async () => {
    // 5 pending out of 100 = exactly 5%
    const deps = makeDeps({ sent: 100, delivered: 90, failed: 5 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.dropRate).toBe(0.05);
  });

  it('reports healthy when zero sends', async () => {
    const deps = makeDeps({ sent: 0, delivered: 0, failed: 0 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.dropRate).toBe(0);
    expect(result.value.totalPending).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// suppressed when below min sent threshold
// ---------------------------------------------------------------------------

describe('below minSentThreshold — suppressed (always healthy)', () => {
  it('reports healthy even with 100% drop rate when below threshold', async () => {
    // only 5 sent (< 10 default), all pending
    const deps = makeDeps({ sent: 5, delivered: 0, failed: 0 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.dropRate).toBe(1.0);
    expect(result.value.totalPending).toBe(5);
  });

  it('reports healthy at exactly minSentThreshold - 1', async () => {
    const deps = makeDeps({ sent: 9, delivered: 0, failed: 0 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// unhealthy scenarios
// ---------------------------------------------------------------------------

describe('unhealthy scenarios', () => {
  it('reports unhealthy when drop rate exceeds threshold', async () => {
    // 10 pending out of 100 = 10% > 5% default threshold
    const deps = makeDeps({ sent: 100, delivered: 80, failed: 10 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(false);
    expect(result.value.totalPending).toBe(10);
    expect(result.value.dropRate).toBe(0.1);
    expect(result.value.alertThreshold).toBe(0.05);
  });

  it('reports unhealthy when all notifications are pending', async () => {
    const deps = makeDeps({ sent: 50, delivered: 0, failed: 0 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(false);
    expect(result.value.dropRate).toBe(1.0);
    expect(result.value.totalPending).toBe(50);
  });

  it('reports unhealthy at minSentThreshold with high drop rate', async () => {
    // exactly at threshold (10 sent), 50% drop rate
    const deps = makeDeps({ sent: 10, delivered: 5, failed: 0 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(false);
    expect(result.value.dropRate).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// drop rate calculation
// ---------------------------------------------------------------------------

describe('drop rate calculation', () => {
  it('calculates pending as sent - delivered - failed', async () => {
    const deps = makeDeps({ sent: 200, delivered: 150, failed: 30 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalPending).toBe(20);
    expect(result.value.dropRate).toBe(20 / 200);
  });

  it('clamps pending to zero when delivered + failed > sent', async () => {
    // edge case: stats can be slightly inconsistent due to timing
    const deps = makeDeps({ sent: 100, delivered: 90, failed: 15 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalPending).toBe(0);
  });

  it('returns drop rate 0 when zero sends', async () => {
    const deps = makeDeps({ sent: 0, delivered: 0, failed: 0 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.dropRate).toBe(0);
  });

  it('includes alertThreshold in metrics', async () => {
    const deps = makeDeps({ sent: 50, delivered: 50, failed: 0 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.alertThreshold).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------
// error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('returns MonitorError when stats fetch fails', async () => {
    const deps = makeFailing(new Error('db connection lost'));
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('MonitorError');
    expect(result.error.cause).toBeInstanceOf(Error);
    expect((result.error.cause as Error).message).toBe('db connection lost');
  });

  it('returns MonitorError for non-Error thrown values', async () => {
    const deps: DeliveryMonitorDeps = {
      getDeliveryStats: vi.fn().mockRejectedValue('string error'),
    };
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('MonitorError');
    expect(result.error.cause).toBe('string error');
  });
});

// ---------------------------------------------------------------------------
// custom config
// ---------------------------------------------------------------------------

describe('custom config', () => {
  it('uses custom windowMs when calling getDeliveryStats', async () => {
    const deps = makeDeps({ sent: 10, delivered: 10, failed: 0 });
    const monitor = createDeliveryMonitor(deps, { windowMs: 30_000 });
    await monitor.checkHealth();

    expect(deps.getDeliveryStats).toHaveBeenCalledWith(30_000);
  });

  it('uses custom dropRateThreshold', async () => {
    // 3% drop rate with 10% threshold = healthy
    const deps = makeDeps({ sent: 100, delivered: 95, failed: 2 });
    const monitor = createDeliveryMonitor(deps, { dropRateThreshold: 0.10 });
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.alertThreshold).toBe(0.10);
  });

  it('uses custom minSentThreshold', async () => {
    // 3 sent with threshold 5 = suppressed (healthy)
    const deps = makeDeps({ sent: 3, delivered: 0, failed: 0 });
    const monitor = createDeliveryMonitor(deps, { minSentThreshold: 5 });
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isHealthy).toBe(true);
  });

  it('partial config merges with defaults', async () => {
    const deps = makeDeps({ sent: 0, delivered: 0, failed: 0 });
    const monitor = createDeliveryMonitor(deps, { dropRateThreshold: 0.01 });
    await monitor.checkHealth();

    // should still use default windowMs
    expect(deps.getDeliveryStats).toHaveBeenCalledWith(60 * 60 * 1000);
  });

  it('uses all custom values together', async () => {
    const deps = makeDeps({ sent: 20, delivered: 18, failed: 0 });
    const monitor = createDeliveryMonitor(deps, {
      windowMs: 120_000,
      dropRateThreshold: 0.15,
      minSentThreshold: 5,
    });
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2/20 = 10% < 15% threshold = healthy
    expect(result.value.isHealthy).toBe(true);
    expect(result.value.alertThreshold).toBe(0.15);
    expect(deps.getDeliveryStats).toHaveBeenCalledWith(120_000);
  });
});

// ---------------------------------------------------------------------------
// metrics shape
// ---------------------------------------------------------------------------

describe('metrics shape', () => {
  it('returns all required fields', async () => {
    const deps = makeDeps({ sent: 50, delivered: 40, failed: 5 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveProperty('totalSent');
    expect(result.value).toHaveProperty('totalDelivered');
    expect(result.value).toHaveProperty('totalFailed');
    expect(result.value).toHaveProperty('totalPending');
    expect(result.value).toHaveProperty('dropRate');
    expect(result.value).toHaveProperty('alertThreshold');
    expect(result.value).toHaveProperty('isHealthy');
  });

  it('all numeric fields are numbers', async () => {
    const deps = makeDeps({ sent: 10, delivered: 8, failed: 1 });
    const monitor = createDeliveryMonitor(deps);
    const result = await monitor.checkHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value.totalSent).toBe('number');
    expect(typeof result.value.totalDelivered).toBe('number');
    expect(typeof result.value.totalFailed).toBe('number');
    expect(typeof result.value.totalPending).toBe('number');
    expect(typeof result.value.dropRate).toBe('number');
    expect(typeof result.value.alertThreshold).toBe('number');
    expect(typeof result.value.isHealthy).toBe('boolean');
  });
});
