/**
 * OBS-05: Anomaly Detection for Bulk Data Access tests
 * @task OBS-05
 *
 * verifies z-score analysis, baseline handling, threshold configuration,
 * score clamping, and error handling for the anomaly detector.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createAnomalyDetector,
  DEFAULT_ANOMALY_CONFIG,
} from '@aptivo/audit/anomaly';
import type {
  AnomalyDetectorDeps,
  AnomalyDetectorConfig,
  AccessPattern,
  BaselineStats,
} from '@aptivo/audit/anomaly';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makePattern(overrides?: Partial<AccessPattern>): AccessPattern {
  return {
    actor: 'user-1',
    resourceType: 'candidate',
    action: 'read',
    count: 10,
    windowStart: new Date('2026-03-10T00:00:00Z'),
    windowEnd: new Date('2026-03-17T00:00:00Z'),
    ...overrides,
  };
}

function makeBaseline(overrides?: Partial<BaselineStats>): BaselineStats {
  return {
    mean: 10,
    stdDev: 2,
    sampleSize: 30,
    ...overrides,
  };
}

function makeDeps(baseline: BaselineStats): AnomalyDetectorDeps {
  return {
    getBaseline: vi.fn().mockResolvedValue(baseline),
  };
}

function makeFailingDeps(error: Error): AnomalyDetectorDeps {
  return {
    getBaseline: vi.fn().mockRejectedValue(error),
  };
}

// ---------------------------------------------------------------------------
// DEFAULT_ANOMALY_CONFIG structure
// ---------------------------------------------------------------------------

describe('DEFAULT_ANOMALY_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_ANOMALY_CONFIG.deviationThreshold).toBe(3.0);
    expect(DEFAULT_ANOMALY_CONFIG.minBaselineSamples).toBe(5);
    expect(DEFAULT_ANOMALY_CONFIG.baselineWindowDays).toBe(7);
  });

  it('has correct types for all fields', () => {
    expect(typeof DEFAULT_ANOMALY_CONFIG.deviationThreshold).toBe('number');
    expect(typeof DEFAULT_ANOMALY_CONFIG.minBaselineSamples).toBe('number');
    expect(typeof DEFAULT_ANOMALY_CONFIG.baselineWindowDays).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// normal access (within baseline)
// ---------------------------------------------------------------------------

describe('normal access — within baseline', () => {
  it('reports not anomaly when count equals mean', async () => {
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 10 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
    expect(result.value.reason).toBeUndefined();
    expect(result.value.score).toBe(0);
  });

  it('reports not anomaly when count is 2 std devs above mean', async () => {
    // z = (14 - 10) / 2 = 2.0 < 3.0 threshold
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 14 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
    expect(result.value.reason).toBeUndefined();
  });

  it('reports not anomaly when count is below mean', async () => {
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 5 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
    expect(result.value.score).toBe(0); // negative z-score clamped to 0
  });
});

// ---------------------------------------------------------------------------
// excessive access (>3 sigma)
// ---------------------------------------------------------------------------

describe('excessive access — anomaly detected', () => {
  it('reports anomaly when count exceeds 3 sigma', async () => {
    // z = (20 - 10) / 2 = 5.0 >= 3.0 threshold
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 20 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(true);
    expect(result.value.reason).toContain('access count 20');
    expect(result.value.reason).toContain('mean=10.0');
    expect(result.value.reason).toContain('stdDev=2.0');
  });

  it('reports anomaly at exactly 3 sigma', async () => {
    // z = (16 - 10) / 2 = 3.0 >= 3.0
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 16 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(true);
  });

  it('includes z-score in the reason', async () => {
    // z = (16 - 10) / 2 = 3.0
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 16 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reason).toContain('z=3.00');
  });
});

// ---------------------------------------------------------------------------
// insufficient baseline
// ---------------------------------------------------------------------------

describe('insufficient baseline data', () => {
  it('reports not anomaly with reason when sample size below threshold', async () => {
    const deps = makeDeps(makeBaseline({ mean: 5, stdDev: 1, sampleSize: 3 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 100 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
    expect(result.value.score).toBe(0);
    expect(result.value.reason).toBe('insufficient baseline data');
  });

  it('reports not anomaly at sampleSize of exactly minBaselineSamples - 1', async () => {
    const deps = makeDeps(makeBaseline({ mean: 5, stdDev: 1, sampleSize: 4 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 500 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
    expect(result.value.reason).toBe('insufficient baseline data');
  });

  it('evaluates normally at exactly minBaselineSamples', async () => {
    // sampleSize = 5 = minBaselineSamples → should evaluate normally
    const deps = makeDeps(makeBaseline({ mean: 5, stdDev: 1, sampleSize: 5 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 5 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // count == mean → no anomaly but evaluates normally
    expect(result.value.reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// zero stdDev edge case
// ---------------------------------------------------------------------------

describe('zero stdDev edge case', () => {
  it('reports anomaly when count exceeds mean with zero stdDev', async () => {
    // zero stdDev → z = Infinity when count > mean
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 0, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 11 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(true);
  });

  it('reports not anomaly when count equals mean with zero stdDev', async () => {
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 0, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 10 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
    expect(result.value.score).toBe(0);
  });

  it('reports not anomaly when count is below mean with zero stdDev', async () => {
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 0, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 5 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// z-score calculation
// ---------------------------------------------------------------------------

describe('z-score calculation', () => {
  it('calculates z-score correctly', async () => {
    // z = (18 - 10) / 4 = 2.0
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 4, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 18 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // z=2.0, threshold=3.0 → not anomaly
    expect(result.value.isAnomaly).toBe(false);
    // score = 2.0 / 6.0 = 0.333...
    expect(result.value.score).toBeCloseTo(1 / 3, 5);
  });
});

// ---------------------------------------------------------------------------
// score clamped to 0-1
// ---------------------------------------------------------------------------

describe('score clamped to 0-1', () => {
  it('score is clamped to 1 for extreme anomalies', async () => {
    // z = (1000 - 10) / 2 = 495 → score = 495/6 → clamped to 1
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 1000 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.score).toBe(1);
  });

  it('score is clamped to 0 for below-mean access', async () => {
    // z = (5 - 10) / 2 = -2.5 → clamped to 0
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 5 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.score).toBe(0);
  });

  it('score at midpoint is 0.5', async () => {
    // z = threshold → score = threshold / (threshold * 2) = 0.5
    // z = (16 - 10) / 2 = 3.0, score = 3.0 / 6.0 = 0.5
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern({ count: 16 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.score).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// custom threshold config
// ---------------------------------------------------------------------------

describe('custom threshold config', () => {
  it('uses custom deviationThreshold', async () => {
    // with threshold 2.0: z = (14-10)/2 = 2.0 >= 2.0 → anomaly
    const deps = makeDeps(makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 }));
    const detector = createAnomalyDetector(deps, { deviationThreshold: 2.0 });
    const result = await detector.evaluate(makePattern({ count: 14 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAnomaly).toBe(true);
  });

  it('uses custom minBaselineSamples', async () => {
    // sampleSize 3 with minBaseline 3 → evaluates normally
    const deps = makeDeps(makeBaseline({ mean: 5, stdDev: 1, sampleSize: 3 }));
    const detector = createAnomalyDetector(deps, { minBaselineSamples: 3 });
    const result = await detector.evaluate(makePattern({ count: 5 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // should evaluate normally, not return 'insufficient baseline data'
    expect(result.value.reason).toBeUndefined();
  });

  it('uses custom baselineWindowDays', async () => {
    const getBaseline = vi.fn().mockResolvedValue(makeBaseline());
    const deps: AnomalyDetectorDeps = { getBaseline };
    const detector = createAnomalyDetector(deps, { baselineWindowDays: 14 });

    await detector.evaluate(makePattern());

    expect(getBaseline).toHaveBeenCalledWith('user-1', 'candidate', 14);
  });

  it('partial config merges with defaults', async () => {
    const getBaseline = vi.fn().mockResolvedValue(makeBaseline());
    const deps: AnomalyDetectorDeps = { getBaseline };
    const detector = createAnomalyDetector(deps, { deviationThreshold: 5.0 });

    await detector.evaluate(makePattern());

    // should use default baselineWindowDays (7)
    expect(getBaseline).toHaveBeenCalledWith('user-1', 'candidate', 7);
  });
});

// ---------------------------------------------------------------------------
// baseline error handling
// ---------------------------------------------------------------------------

describe('baseline error → AnomalyError', () => {
  it('returns AnomalyError when getBaseline rejects', async () => {
    const deps = makeFailingDeps(new Error('db connection lost'));
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('AnomalyError');
    expect(result.error.cause).toBeInstanceOf(Error);
    expect((result.error.cause as Error).message).toBe('db connection lost');
  });

  it('returns AnomalyError for non-Error thrown values', async () => {
    const deps: AnomalyDetectorDeps = {
      getBaseline: vi.fn().mockRejectedValue('string error'),
    };
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('AnomalyError');
    expect(result.error.cause).toBe('string error');
  });
});

// ---------------------------------------------------------------------------
// result shape
// ---------------------------------------------------------------------------

describe('result shape', () => {
  it('includes pattern and baseline in result', async () => {
    const baseline = makeBaseline({ mean: 10, stdDev: 2, sampleSize: 30 });
    const deps = makeDeps(baseline);
    const detector = createAnomalyDetector(deps);
    const pattern = makePattern({ count: 10 });
    const result = await detector.evaluate(pattern);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pattern).toEqual(pattern);
    expect(result.value.baseline).toEqual(baseline);
  });

  it('returns all required fields', async () => {
    const deps = makeDeps(makeBaseline());
    const detector = createAnomalyDetector(deps);
    const result = await detector.evaluate(makePattern());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveProperty('isAnomaly');
    expect(result.value).toHaveProperty('score');
    expect(result.value).toHaveProperty('pattern');
    expect(result.value).toHaveProperty('baseline');
    expect(typeof result.value.isAnomaly).toBe('boolean');
    expect(typeof result.value.score).toBe('number');
  });
});
