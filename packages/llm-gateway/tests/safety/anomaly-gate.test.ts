/**
 * LLM3-04: Active anomaly blocking — gate tests
 *
 * Verifies the decision layer that sits between the anomaly detector and
 * the LLM gateway. Detector is detection-only; gate produces actionable
 * pass/throttle/block decisions and is responsible for cold-start
 * fail-open, feature-flag bypass, and error fail-open.
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import type { AccessPattern, AnomalyResult, AnomalyError } from '@aptivo/audit';
import {
  createAnomalyGate,
  type AnomalyGateDeps,
  type Logger,
} from '../../src/safety/anomaly-gate.js';

// ---------------------------------------------------------------------------
// test doubles
// ---------------------------------------------------------------------------

function noopLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function fixedPattern(count = 10): AccessPattern {
  return {
    actor: 'user:1',
    resourceType: 'pii_record',
    action: 'read',
    count,
    windowStart: new Date('2026-04-21T00:00:00Z'),
    windowEnd: new Date('2026-04-21T00:10:00Z'),
  };
}

function detectorReturning(result: AnomalyResult | AnomalyError) {
  return {
    evaluate: vi.fn(async () =>
      'isAnomaly' in result ? Result.ok(result) : Result.err(result),
    ),
  };
}

function baseDeps(overrides?: Partial<AnomalyGateDeps>): AnomalyGateDeps {
  return {
    detector: detectorReturning({
      isAnomaly: false,
      score: 0,
      pattern: fixedPattern(),
      baseline: { mean: 5, stdDev: 1, sampleSize: 50 },
    }),
    isEnabled: () => true,
    getAccessPattern: vi.fn(async () => fixedPattern()),
    logger: noopLogger(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// action selection — thresholds
// ---------------------------------------------------------------------------

describe('LLM3-04: createAnomalyGate — action selection', () => {
  // Fixture score values match the real detector's normalization
  // (score = z / (deviationThreshold*2) = z / 6 with default config).
  // Gate defaults: throttleAt=0.7 (real z≈4.2), blockAt=0.9 (real z≈5.4).

  it('returns { action: "block" } when score >= blockAt', async () => {
    const gate = createAnomalyGate(
      baseDeps({
        detector: detectorReturning({
          isAnomaly: true,
          score: 0.95, // ≈ z=5.7 — clearly above block threshold
          reason: 'z=5.70',
          pattern: fixedPattern(50),
          baseline: { mean: 5, stdDev: 1, sampleSize: 50 },
        }),
      }),
    );
    const decision = await gate.evaluate('user:1', 'pii_record');
    expect(decision.action).toBe('block');
    expect(decision.reason).toContain('z=5.70');
  });

  it('returns { action: "throttle", cooldownMs } when throttleAt <= score < blockAt', async () => {
    const gate = createAnomalyGate(
      baseDeps({
        detector: detectorReturning({
          isAnomaly: true,
          score: 0.8, // ≈ z=4.8 — within [0.7, 0.9)
          reason: 'z=4.80',
          pattern: fixedPattern(20),
          baseline: { mean: 5, stdDev: 1, sampleSize: 50 },
        }),
      }),
    );
    const decision = await gate.evaluate('user:1', 'pii_record');
    expect(decision.action).toBe('throttle');
    expect(decision.cooldownMs).toBeGreaterThan(0);
  });

  it('returns { action: "pass" } when score below throttleAt', async () => {
    const gate = createAnomalyGate(
      baseDeps({
        detector: detectorReturning({
          isAnomaly: true,
          score: 0.5, // ≈ z=3.0 — detector flags anomaly but gate lets it pass
          reason: 'z=3.00',
          pattern: fixedPattern(8),
          baseline: { mean: 5, stdDev: 1, sampleSize: 50 },
        }),
      }),
    );
    const decision = await gate.evaluate('user:1', 'pii_record');
    expect(decision.action).toBe('pass');
  });

  it('returns { action: "pass" } when detector says isAnomaly: false regardless of score', async () => {
    const gate = createAnomalyGate(
      baseDeps({
        detector: detectorReturning({
          isAnomaly: false,
          score: 0.95,
          pattern: fixedPattern(),
          baseline: { mean: 5, stdDev: 1, sampleSize: 50 },
        }),
      }),
    );
    const decision = await gate.evaluate('user:1', 'pii_record');
    expect(decision.action).toBe('pass');
  });

  it('honours custom thresholds via deps.thresholds', async () => {
    const gate = createAnomalyGate(
      baseDeps({
        thresholds: { throttleAt: 0.1, blockAt: 0.5 },
        detector: detectorReturning({
          isAnomaly: true,
          score: 0.3,
          pattern: fixedPattern(),
          baseline: { mean: 5, stdDev: 1, sampleSize: 50 },
        }),
      }),
    );
    const decision = await gate.evaluate('user:1', 'pii_record');
    // with throttleAt=0.1, score 0.3 → throttle
    expect(decision.action).toBe('throttle');
  });
});

// ---------------------------------------------------------------------------
// fail-open paths
// ---------------------------------------------------------------------------

describe('LLM3-04: createAnomalyGate — fail-open behaviour', () => {
  it('returns { action: "pass" } when baseline is insufficient (cold start)', async () => {
    const gate = createAnomalyGate(
      baseDeps({
        detector: detectorReturning({
          isAnomaly: false,
          score: 0,
          reason: 'insufficient baseline data',
          pattern: fixedPattern(),
          baseline: { mean: 0, stdDev: 0, sampleSize: 2 },
        }),
      }),
    );
    const decision = await gate.evaluate('user:1', 'pii_record');
    expect(decision.action).toBe('pass');
  });

  it('returns { action: "pass" } when the detector errors (fail-open on infra fault)', async () => {
    const logger = noopLogger();
    const gate = createAnomalyGate(
      baseDeps({
        detector: detectorReturning({ _tag: 'AnomalyError', cause: new Error('baseline query failed') }),
        logger,
      }),
    );
    const decision = await gate.evaluate('user:1', 'pii_record');
    expect(decision.action).toBe('pass');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('anomaly_gate_error'),
      expect.any(Object),
    );
  });

  it('returns { action: "pass" } when getAccessPattern throws (fail-open on infra fault)', async () => {
    const logger = noopLogger();
    const gate = createAnomalyGate(
      baseDeps({
        logger,
        getAccessPattern: async () => { throw new Error('audit store unavailable'); },
      }),
    );
    const decision = await gate.evaluate('user:1', 'pii_record');
    expect(decision.action).toBe('pass');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('anomaly_gate_error'),
      expect.objectContaining({ cause: expect.any(String) }),
    );
  });

  it('returns { action: "pass" } and never invokes the detector when the flag is off', async () => {
    const detector = detectorReturning({
      isAnomaly: true,
      score: 0.95,
      pattern: fixedPattern(),
      baseline: { mean: 5, stdDev: 1, sampleSize: 50 },
    });
    const getAccessPattern = vi.fn(async () => fixedPattern());
    const gate = createAnomalyGate(baseDeps({
      detector,
      getAccessPattern,
      isEnabled: () => false,
    }));
    const decision = await gate.evaluate('user:1', 'pii_record');
    expect(decision.action).toBe('pass');
    expect(detector.evaluate).not.toHaveBeenCalled();
    expect(getAccessPattern).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DI wiring — getAccessPattern is called with the right args
// ---------------------------------------------------------------------------

describe('LLM3-04: createAnomalyGate — access-pattern plumbing', () => {
  it('forwards actor + resourceType to getAccessPattern', async () => {
    const getAccessPattern = vi.fn(async () => fixedPattern());
    const gate = createAnomalyGate(baseDeps({ getAccessPattern }));
    await gate.evaluate('user:42', 'crypto_trade');
    expect(getAccessPattern).toHaveBeenCalledWith('user:42', 'crypto_trade');
  });

  it('feeds the returned AccessPattern into the detector', async () => {
    const pattern = fixedPattern(99);
    const detector = detectorReturning({
      isAnomaly: false,
      score: 0,
      pattern,
      baseline: { mean: 5, stdDev: 1, sampleSize: 50 },
    });
    const gate = createAnomalyGate(baseDeps({
      getAccessPattern: async () => pattern,
      detector,
    }));
    await gate.evaluate('user:1', 'pii_record');
    expect(detector.evaluate).toHaveBeenCalledWith(pattern);
  });
});
