/**
 * OBS-05: Anomaly Detection for Bulk Data Access
 * @task OBS-05
 *
 * rule-based anomaly detection on PII read audit trail.
 * uses z-score analysis against historical baseline to detect
 * abnormal access patterns.
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// access pattern
// ---------------------------------------------------------------------------

export interface AccessPattern {
  actor: string;
  resourceType: string;
  action: string;
  count: number;
  windowStart: Date;
  windowEnd: Date;
}

// ---------------------------------------------------------------------------
// baseline stats
// ---------------------------------------------------------------------------

export interface BaselineStats {
  mean: number;
  stdDev: number;
  sampleSize: number;
}

// ---------------------------------------------------------------------------
// anomaly result
// ---------------------------------------------------------------------------

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number; // 0-1, higher = more anomalous
  reason?: string;
  pattern: AccessPattern;
  baseline: BaselineStats;
}

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

export interface AnomalyDetectorConfig {
  deviationThreshold: number; // default: 3.0 (3 standard deviations)
  minBaselineSamples: number; // default: 5
  baselineWindowDays: number; // default: 7
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectorConfig = {
  deviationThreshold: 3.0,
  minBaselineSamples: 5,
  baselineWindowDays: 7,
};

// ---------------------------------------------------------------------------
// error type
// ---------------------------------------------------------------------------

export type AnomalyError = { readonly _tag: 'AnomalyError'; readonly cause: unknown };

// ---------------------------------------------------------------------------
// dependencies
// ---------------------------------------------------------------------------

export interface AnomalyDetectorDeps {
  getBaseline: (actor: string, resourceType: string, windowDays: number) => Promise<BaselineStats>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createAnomalyDetector(deps: AnomalyDetectorDeps, config?: Partial<AnomalyDetectorConfig>) {
  const cfg = { ...DEFAULT_ANOMALY_CONFIG, ...config };

  return {
    async evaluate(pattern: AccessPattern): Promise<Result<AnomalyResult, AnomalyError>> {
      try {
        const baseline = await deps.getBaseline(pattern.actor, pattern.resourceType, cfg.baselineWindowDays);

        // not enough baseline data — suppress anomaly detection
        if (baseline.sampleSize < cfg.minBaselineSamples) {
          return Result.ok({
            isAnomaly: false,
            score: 0,
            reason: 'insufficient baseline data',
            pattern,
            baseline,
          });
        }

        // compute z-score
        const zScore = baseline.stdDev > 0
          ? (pattern.count - baseline.mean) / baseline.stdDev
          : pattern.count > baseline.mean ? Infinity : 0;

        const isAnomaly = zScore >= cfg.deviationThreshold;
        const score = Math.min(1, Math.max(0, zScore / (cfg.deviationThreshold * 2)));

        return Result.ok({
          isAnomaly,
          score,
          reason: isAnomaly
            ? `access count ${pattern.count} exceeds baseline (mean=${baseline.mean.toFixed(1)}, stdDev=${baseline.stdDev.toFixed(1)}, z=${zScore.toFixed(2)})`
            : undefined,
          pattern,
          baseline,
        });
      } catch (cause) {
        return Result.err({ _tag: 'AnomalyError' as const, cause });
      }
    },
  };
}
