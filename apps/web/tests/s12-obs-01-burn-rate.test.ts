/**
 * OBS-01: burn-rate SLO alerting tests
 * @task OBS-01
 *
 * covers:
 * - error budget computation (pure functions)
 * - normalized burn rate calculation
 * - burn rate evaluation (critical / warning / ok / suppressed)
 * - integration with SLO alert system (backward compat)
 */
import { describe, it, expect } from 'vitest';

import {
  computeErrorBudget,
  computeNormalizedBurnRate,
  type ErrorBudget,
} from '../src/lib/observability/error-budget';

import {
  evaluateBurnRate,
  DEFAULT_BURN_RATE_CONFIGS,
  type BurnRateConfig,
  type BurnRateResult,
  type WindowMetrics,
} from '../src/lib/observability/burn-rate';

import {
  ALL_SLO_ALERTS,
  workflowSuccessAlert,
  hitlLatencyAlert,
  mcpSuccessAlert,
  auditIntegrityAlert,
  retentionFailureAlert,
  notificationDeliveryAlert,
  workflowBurnRateAlert,
  mcpBurnRateAlert,
  evaluateAllSlos,
  type SloMetrics,
} from '../src/lib/observability/slo-alerts';

// -- helpers --

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function makeConfig(overrides?: Partial<BurnRateConfig>): BurnRateConfig {
  return {
    name: 'test-burn',
    sloTarget: 0.99,
    fastWindowMs: FIVE_MIN_MS,
    slowWindowMs: ONE_HOUR_MS,
    fastBurnMultiplier: 10,
    slowBurnMultiplier: 2,
    minEventsThreshold: 10,
    ...overrides,
  };
}

const healthyMetrics: SloMetrics = {
  workflowTotal: 1000,
  workflowSuccess: 999,
  hitlDeliveryLatencyP95Ms: 2000,
  mcpCallTotal: 500,
  mcpCallSuccess: 499,
  auditDlqPendingCount: 5,
  retentionFailureCount: 0,
  notificationTotal: 200,
  notificationDelivered: 200,
  // S17-B4
  mlClassifierTimeoutRate: 0,
  mlSafetyVolume: 0,
};

// ---------------------------------------------------------------------------
// error budget computation
// ---------------------------------------------------------------------------

describe('OBS-01: computeErrorBudget', () => {
  it('computes budget for 99% SLO with 1000 events and 20 failures', () => {
    const budget = computeErrorBudget(0.99, 1000, 20);
    expect(budget.totalBudget).toBeCloseTo(10); // 1000 * 0.01
    expect(budget.consumed).toBe(20);
    expect(budget.remaining).toBeCloseTo(-10); // 10 - 20
    expect(budget.burnRate).toBeCloseTo(2.0); // 20 / 10
  });

  it('computes budget for 99% SLO with 1000 events and 5 failures', () => {
    const budget = computeErrorBudget(0.99, 1000, 5);
    expect(budget.totalBudget).toBeCloseTo(10);
    expect(budget.consumed).toBe(5);
    expect(budget.remaining).toBeCloseTo(5);
    expect(budget.burnRate).toBeCloseTo(0.5);
  });

  it('computes budget for 99.5% SLO with 100 events and 0 failures', () => {
    const budget = computeErrorBudget(0.995, 100, 0);
    expect(budget.totalBudget).toBeCloseTo(0.5); // 100 * 0.005
    expect(budget.consumed).toBe(0);
    expect(budget.remaining).toBeCloseTo(0.5);
    expect(budget.burnRate).toBe(0);
  });

  it('handles 0 events without division by zero', () => {
    const budget = computeErrorBudget(0.99, 0, 0);
    expect(budget.totalBudget).toBe(0);
    expect(budget.consumed).toBe(0);
    expect(budget.remaining).toBe(0);
    expect(budget.burnRate).toBe(0);
  });

  it('allows negative remaining when over-budget', () => {
    const budget = computeErrorBudget(0.99, 100, 5);
    // totalBudget = 100 * 0.01 = 1, consumed = 5
    expect(budget.remaining).toBeCloseTo(-4);
    expect(budget.burnRate).toBeCloseTo(5.0);
  });

  it('returns burnRate 1.0 when exactly on budget', () => {
    const budget = computeErrorBudget(0.99, 1000, 10);
    expect(budget.burnRate).toBeCloseTo(1.0);
    expect(budget.remaining).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// normalized burn rate
// ---------------------------------------------------------------------------

describe('OBS-01: computeNormalizedBurnRate', () => {
  it('normalizes a 5-minute window with 2.0 burn rate to monthly', () => {
    const normalized = computeNormalizedBurnRate(2.0, FIVE_MIN_MS, MONTH_MS);
    // 2.0 * (30*24*60*60*1000 / 5*60*1000) = 2.0 * 8640
    expect(normalized).toBeCloseTo(2.0 * (MONTH_MS / FIVE_MIN_MS));
  });

  it('normalizes a 1-hour window with 1.0 burn rate to monthly (720x)', () => {
    const normalized = computeNormalizedBurnRate(1.0, ONE_HOUR_MS, MONTH_MS);
    // 30 days = 720 hours
    expect(normalized).toBeCloseTo(720);
  });

  it('returns 0 when window is 0', () => {
    const normalized = computeNormalizedBurnRate(5.0, 0, MONTH_MS);
    expect(normalized).toBe(0);
  });

  it('returns 0 when window is negative', () => {
    const normalized = computeNormalizedBurnRate(5.0, -1000, MONTH_MS);
    expect(normalized).toBe(0);
  });

  it('returns 0 when burn rate is 0', () => {
    const normalized = computeNormalizedBurnRate(0, FIVE_MIN_MS, MONTH_MS);
    expect(normalized).toBe(0);
  });

  it('uses default month of 30 days when not specified', () => {
    const withDefault = computeNormalizedBurnRate(1.0, ONE_HOUR_MS);
    const withExplicit = computeNormalizedBurnRate(1.0, ONE_HOUR_MS, MONTH_MS);
    expect(withDefault).toBeCloseTo(withExplicit);
  });
});

// ---------------------------------------------------------------------------
// burn rate evaluation
// ---------------------------------------------------------------------------

describe('OBS-01: evaluateBurnRate', () => {
  it('returns critical when fast burn rate exceeds multiplier', () => {
    const config = makeConfig();
    // 100 events, 50 failures in 5 min → burnRate = 50/1 = 50
    // normalized = 50 * (month/5min) = huge number, well above 10x
    const fast: WindowMetrics = { totalEvents: 100, failedEvents: 50 };
    const slow: WindowMetrics = { totalEvents: 100, failedEvents: 1 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.status).toBe('critical');
    expect(result.fastBurnRate).toBeGreaterThanOrEqual(10);
    expect(result.suppressed).toBe(false);
  });

  it('returns warning when slow burn exceeds multiplier but fast does not', () => {
    const config = makeConfig();
    // burn rate = consumed / totalBudget = failedEvents / (totalEvents * (1 - sloTarget))
    // for 99% SLO, 1000 events: totalBudget = 10
    // slow window: 25 failures → burnRate = 25/10 = 2.5 (>= 2x slow threshold)
    // fast window: 0 failures → burnRate = 0 (< 10x fast threshold)
    const fast: WindowMetrics = { totalEvents: 1000, failedEvents: 0 };
    const slow: WindowMetrics = { totalEvents: 1000, failedEvents: 25 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.status).toBe('warning');
    expect(result.fastBurnRate).toBeLessThan(config.fastBurnMultiplier);
    expect(result.slowBurnRate).toBeGreaterThanOrEqual(config.slowBurnMultiplier);
    expect(result.suppressed).toBe(false);
  });

  it('returns ok when both burn rates are below thresholds', () => {
    const config = makeConfig();
    // both windows: 1000 events, 0 failures
    const fast: WindowMetrics = { totalEvents: 1000, failedEvents: 0 };
    const slow: WindowMetrics = { totalEvents: 1000, failedEvents: 0 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.status).toBe('ok');
    expect(result.fastBurnRate).toBe(0);
    expect(result.slowBurnRate).toBe(0);
    expect(result.suppressed).toBe(false);
  });

  it('returns suppressed ok when below min events threshold', () => {
    const config = makeConfig({ minEventsThreshold: 10 });
    const fast: WindowMetrics = { totalEvents: 5, failedEvents: 5 };
    const slow: WindowMetrics = { totalEvents: 3, failedEvents: 3 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.status).toBe('ok');
    expect(result.suppressed).toBe(true);
  });

  it('does not suppress when fast window meets min events threshold', () => {
    const config = makeConfig({ minEventsThreshold: 10 });
    // fast has enough events, slow does not — should not suppress
    const fast: WindowMetrics = { totalEvents: 100, failedEvents: 50 };
    const slow: WindowMetrics = { totalEvents: 5, failedEvents: 0 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.suppressed).toBe(false);
  });

  it('does not suppress when slow window meets min events threshold', () => {
    const config = makeConfig({ minEventsThreshold: 10 });
    const fast: WindowMetrics = { totalEvents: 5, failedEvents: 0 };
    const slow: WindowMetrics = { totalEvents: 100, failedEvents: 0 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.suppressed).toBe(false);
  });

  it('populates both budget fields', () => {
    const config = makeConfig();
    const fast: WindowMetrics = { totalEvents: 100, failedEvents: 2 };
    const slow: WindowMetrics = { totalEvents: 500, failedEvents: 3 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.fastBudget).toBeDefined();
    expect(result.slowBudget).toBeDefined();
    expect(result.fastBudget.totalBudget).toBeCloseTo(1); // 100 * 0.01
    expect(result.slowBudget.totalBudget).toBeCloseTo(5); // 500 * 0.01
  });

  it('uses config name in result', () => {
    const config = makeConfig({ name: 'custom-alert' });
    const fast: WindowMetrics = { totalEvents: 100, failedEvents: 0 };
    const slow: WindowMetrics = { totalEvents: 100, failedEvents: 0 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.name).toBe('custom-alert');
  });

  it('works with custom multiplier thresholds', () => {
    // lower thresholds: fastBurnMultiplier=5, slowBurnMultiplier=1
    const config = makeConfig({
      fastBurnMultiplier: 5,
      slowBurnMultiplier: 1,
    });
    // burn rate = consumed / totalBudget
    // for 99% SLO, 1000 events: totalBudget = 10
    // slow window: 15 failures → burnRate = 15/10 = 1.5 (>= 1x threshold)
    // fast window: 0 failures → burnRate = 0 (< 5x threshold)
    const fast: WindowMetrics = { totalEvents: 1000, failedEvents: 0 };
    const slow: WindowMetrics = { totalEvents: 1000, failedEvents: 15 };

    const result = evaluateBurnRate(config, fast, slow);
    expect(result.status).toBe('warning');
  });

  it('prioritizes critical over warning when both thresholds exceeded', () => {
    const config = makeConfig();
    // both windows have high failures
    const fast: WindowMetrics = { totalEvents: 100, failedEvents: 50 };
    const slow: WindowMetrics = { totalEvents: 100, failedEvents: 50 };

    const result = evaluateBurnRate(config, fast, slow);
    // fast burn is checked first — should be critical
    expect(result.status).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_BURN_RATE_CONFIGS
// ---------------------------------------------------------------------------

describe('OBS-01: DEFAULT_BURN_RATE_CONFIGS', () => {
  it('defines workflow-success-burn config', () => {
    const wf = DEFAULT_BURN_RATE_CONFIGS.find(
      (c) => c.name === 'workflow-success-burn',
    );
    expect(wf).toBeDefined();
    expect(wf!.sloTarget).toBe(0.99);
    expect(wf!.fastWindowMs).toBe(FIVE_MIN_MS);
    expect(wf!.slowWindowMs).toBe(ONE_HOUR_MS);
    expect(wf!.fastBurnMultiplier).toBe(10);
    expect(wf!.slowBurnMultiplier).toBe(2);
    expect(wf!.minEventsThreshold).toBe(10);
  });

  it('defines mcp-success-burn config', () => {
    const mcp = DEFAULT_BURN_RATE_CONFIGS.find(
      (c) => c.name === 'mcp-success-burn',
    );
    expect(mcp).toBeDefined();
    expect(mcp!.sloTarget).toBe(0.995);
    expect(mcp!.fastWindowMs).toBe(FIVE_MIN_MS);
    expect(mcp!.slowWindowMs).toBe(ONE_HOUR_MS);
  });

  it('has exactly 2 default configs', () => {
    expect(DEFAULT_BURN_RATE_CONFIGS).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// integration with SLO alert system
// ---------------------------------------------------------------------------

describe('OBS-01: burn-rate alerts in ALL_SLO_ALERTS', () => {
  it('includes all 6 original threshold alerts (backward compat)', () => {
    const ids = ALL_SLO_ALERTS.map((a) => a.id);
    expect(ids).toContain('slo-workflow-success');
    expect(ids).toContain('slo-hitl-latency');
    expect(ids).toContain('slo-mcp-success');
    expect(ids).toContain('slo-audit-integrity');
    expect(ids).toContain('slo-retention-failure');
    expect(ids).toContain('slo-notification-delivery');
  });

  it('includes burn-rate alerts for workflow and mcp', () => {
    const ids = ALL_SLO_ALERTS.map((a) => a.id);
    expect(ids).toContain('slo-burn-workflow-success-burn');
    expect(ids).toContain('slo-burn-mcp-success-burn');
  });

  it('has 9 total alerts (6 threshold + 2 burn-rate + 1 ml-classifier-timeout)', () => {
    expect(ALL_SLO_ALERTS).toHaveLength(9);
  });

  it('workflow burn-rate alert has correct metadata', () => {
    expect(workflowBurnRateAlert.id).toBe('slo-burn-workflow-success-burn');
    expect(workflowBurnRateAlert.warning).toBe('OBS-01');
    expect(workflowBurnRateAlert.description).toContain('workflow-success-burn');
  });

  it('mcp burn-rate alert has correct metadata', () => {
    expect(mcpBurnRateAlert.id).toBe('slo-burn-mcp-success-burn');
    expect(mcpBurnRateAlert.warning).toBe('OBS-01');
    expect(mcpBurnRateAlert.description).toContain('mcp-success-burn');
  });

  it('evaluateAllSlos returns results for all 9 alerts', () => {
    const results = evaluateAllSlos(healthyMetrics);
    expect(results.size).toBe(9);
    expect(results.has('slo-burn-workflow-success-burn')).toBe(true);
    expect(results.has('slo-burn-mcp-success-burn')).toBe(true);
    expect(results.has('slo-ml-classifier-timeout')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// burn-rate alert evaluator (via SloAlert interface)
// ---------------------------------------------------------------------------

describe('OBS-01: workflowBurnRateAlert.evaluate', () => {
  it('returns ok when workflow success rate is perfect', () => {
    // even 1 failure in a 5-minute window normalizes to high monthly burn,
    // so we need perfect success for the burn-rate alert to stay ok
    const result = workflowBurnRateAlert.evaluate({
      ...healthyMetrics,
      workflowTotal: 1000,
      workflowSuccess: 1000,
    });
    expect(result.status).toBe('ok');
  });

  it('fires when workflow failure rate is high', () => {
    // 1000 total, 500 success → 500 failures
    const result = workflowBurnRateAlert.evaluate({
      ...healthyMetrics,
      workflowTotal: 1000,
      workflowSuccess: 500,
    });
    expect(result.status).toBe('firing');
    if (result.status === 'firing') {
      expect(result.message).toContain('workflow-success-burn');
    }
  });

  it('returns ok when no workflow events (suppressed)', () => {
    const result = workflowBurnRateAlert.evaluate({
      ...healthyMetrics,
      workflowTotal: 0,
      workflowSuccess: 0,
    });
    expect(result.status).toBe('ok');
  });
});

describe('OBS-01: mcpBurnRateAlert.evaluate', () => {
  it('returns ok when mcp success rate is perfect', () => {
    // even 1 failure normalizes to high monthly burn rate
    const result = mcpBurnRateAlert.evaluate({
      ...healthyMetrics,
      mcpCallTotal: 500,
      mcpCallSuccess: 500,
    });
    expect(result.status).toBe('ok');
  });

  it('fires when mcp failure rate is high', () => {
    const result = mcpBurnRateAlert.evaluate({
      ...healthyMetrics,
      mcpCallTotal: 1000,
      mcpCallSuccess: 500,
    });
    expect(result.status).toBe('firing');
    if (result.status === 'firing') {
      expect(result.message).toContain('mcp-success-burn');
    }
  });

  it('returns ok when no mcp events (suppressed)', () => {
    const result = mcpBurnRateAlert.evaluate({
      ...healthyMetrics,
      mcpCallTotal: 0,
      mcpCallSuccess: 0,
    });
    expect(result.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// existing threshold alerts still work (backward compat smoke tests)
// ---------------------------------------------------------------------------

describe('OBS-01: backward compatibility — existing threshold alerts', () => {
  it('workflowSuccessAlert still evaluates correctly', () => {
    const ok = workflowSuccessAlert.evaluate(healthyMetrics);
    expect(ok.status).toBe('ok');

    const firing = workflowSuccessAlert.evaluate({
      ...healthyMetrics,
      workflowSuccess: 900, // 90%
    });
    expect(firing.status).toBe('firing');
  });

  it('hitlLatencyAlert still evaluates correctly', () => {
    const ok = hitlLatencyAlert.evaluate(healthyMetrics);
    expect(ok.status).toBe('ok');
  });

  it('mcpSuccessAlert still evaluates correctly', () => {
    const ok = mcpSuccessAlert.evaluate(healthyMetrics);
    expect(ok.status).toBe('ok');
  });

  it('auditIntegrityAlert still evaluates correctly', () => {
    const ok = auditIntegrityAlert.evaluate(healthyMetrics);
    expect(ok.status).toBe('ok');
  });

  it('retentionFailureAlert still evaluates correctly', () => {
    const ok = retentionFailureAlert.evaluate(healthyMetrics);
    expect(ok.status).toBe('ok');
  });

  it('notificationDeliveryAlert still evaluates correctly', () => {
    const ok = notificationDeliveryAlert.evaluate(healthyMetrics);
    expect(ok.status).toBe('ok');
  });
});
