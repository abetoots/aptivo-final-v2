/**
 * OBS-01: burn-rate alert evaluator
 * @task OBS-01
 *
 * implements multi-window burn-rate alerting following the google SRE
 * approach: a fast window catches sudden spikes, a slow window catches
 * sustained degradation. both are normalized to monthly burn rates.
 */

import type { ErrorBudget } from './error-budget.js';
import {
  computeErrorBudget,
  computeNormalizedBurnRate,
} from './error-budget.js';

// -- types --

export interface BurnRateConfig {
  name: string;
  sloTarget: number; // e.g., 0.99
  fastWindowMs: number; // e.g., 5 * 60 * 1000 (5 min)
  slowWindowMs: number; // e.g., 60 * 60 * 1000 (1 hour)
  fastBurnMultiplier: number; // e.g., 10 (alert if 10x burn rate)
  slowBurnMultiplier: number; // e.g., 2 (alert if 2x burn rate)
  minEventsThreshold: number; // e.g., 10
}

export interface BurnRateResult {
  name: string;
  status: 'ok' | 'warning' | 'critical';
  fastBurnRate: number;
  slowBurnRate: number;
  fastBudget: ErrorBudget;
  slowBudget: ErrorBudget;
  suppressed: boolean; // true if below min events threshold
}

export interface WindowMetrics {
  totalEvents: number;
  failedEvents: number;
}

// -- default configs --

export const DEFAULT_BURN_RATE_CONFIGS: BurnRateConfig[] = [
  {
    name: 'workflow-success-burn',
    sloTarget: 0.99,
    fastWindowMs: 5 * 60 * 1000,
    slowWindowMs: 60 * 60 * 1000,
    fastBurnMultiplier: 10,
    slowBurnMultiplier: 2,
    minEventsThreshold: 10,
  },
  {
    name: 'mcp-success-burn',
    sloTarget: 0.995,
    fastWindowMs: 5 * 60 * 1000,
    slowWindowMs: 60 * 60 * 1000,
    fastBurnMultiplier: 10,
    slowBurnMultiplier: 2,
    minEventsThreshold: 10,
  },
];

// -- evaluator --

/**
 * evaluate burn rate for a given config and windowed metrics.
 */
export function evaluateBurnRate(
  config: BurnRateConfig,
  fastWindow: WindowMetrics,
  slowWindow: WindowMetrics,
): BurnRateResult {
  const monthMs = 30 * 24 * 60 * 60 * 1000;

  // compute budgets
  const fastBudget = computeErrorBudget(
    config.sloTarget,
    fastWindow.totalEvents,
    fastWindow.failedEvents,
  );
  const slowBudget = computeErrorBudget(
    config.sloTarget,
    slowWindow.totalEvents,
    slowWindow.failedEvents,
  );

  // burn rate is already normalized: consumed/totalBudget
  // a burn rate of 2.0 means consuming budget at 2x the sustainable rate
  // compare directly against multiplier thresholds (no additional time normalization)
  const fastBurnRate = fastBudget.burnRate;
  const slowBurnRate = slowBudget.burnRate;

  // suppress if too few events in both windows
  if (
    fastWindow.totalEvents < config.minEventsThreshold &&
    slowWindow.totalEvents < config.minEventsThreshold
  ) {
    return {
      name: config.name,
      status: 'ok',
      fastBurnRate,
      slowBurnRate,
      fastBudget,
      slowBudget,
      suppressed: true,
    };
  }

  // critical if fast burn exceeds multiplier
  if (fastBurnRate >= config.fastBurnMultiplier) {
    return {
      name: config.name,
      status: 'critical',
      fastBurnRate,
      slowBurnRate,
      fastBudget,
      slowBudget,
      suppressed: false,
    };
  }

  // warning if slow burn exceeds multiplier
  if (slowBurnRate >= config.slowBurnMultiplier) {
    return {
      name: config.name,
      status: 'warning',
      fastBurnRate,
      slowBurnRate,
      fastBudget,
      slowBudget,
      suppressed: false,
    };
  }

  // ok
  return {
    name: config.name,
    status: 'ok',
    fastBurnRate,
    slowBurnRate,
    fastBudget,
    slowBudget,
    suppressed: false,
  };
}
