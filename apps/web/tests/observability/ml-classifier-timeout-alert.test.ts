/**
 * S17-B4: ml_classifier_timeout SLO alert tests
 * @task S17-B4
 *
 * Verifies the SLO alert fires only when the timeout rate exceeds the
 * threshold AND the in-window sample size is high enough to be
 * meaningful (a 50% rate over 2 calls is noise, not signal).
 */

import { describe, it, expect } from 'vitest';
import {
  mlClassifierTimeoutAlert,
  SLO_THRESHOLDS,
  type SloMetrics,
} from '../../src/lib/observability/slo-alerts.js';

const baseMetrics: SloMetrics = {
  workflowTotal: 0,
  workflowSuccess: 0,
  hitlDeliveryLatencyP95Ms: 0,
  mcpCallTotal: 0,
  mcpCallSuccess: 0,
  auditDlqPendingCount: 0,
  retentionFailureCount: 0,
  notificationTotal: 0,
  notificationDelivered: 0,
  mlClassifierTimeoutRate: 0,
  mlSafetyVolume: 0,
  ticketSlaAtRiskCount: 0,
  ticketSlaTotal: 0,
};

describe('S17-B4: mlClassifierTimeoutAlert', () => {
  it('returns ok when no ML traffic in the window', () => {
    const result = mlClassifierTimeoutAlert.evaluate(baseMetrics);
    expect(result.status).toBe('ok');
    expect(result.value).toBe(0);
  });

  it('returns ok when rate exceeds threshold but sample size is below minimum (noise filter)', () => {
    // 2 calls, both timeouts → 100% rate, but only 2 samples
    const result = mlClassifierTimeoutAlert.evaluate({
      ...baseMetrics,
      mlClassifierTimeoutRate: 1.0,
      mlSafetyVolume: 2,
    });
    expect(result.status).toBe('ok');
  });

  it('returns ok when sample size is high but rate is at or below threshold', () => {
    const result = mlClassifierTimeoutAlert.evaluate({
      ...baseMetrics,
      // 5% is at the threshold (strict >); should NOT fire
      mlClassifierTimeoutRate: SLO_THRESHOLDS.mlClassifierTimeoutMaxRate,
      mlSafetyVolume: 100,
    });
    expect(result.status).toBe('ok');
  });

  it('fires when both rate exceeds threshold AND sample size meets minimum', () => {
    const result = mlClassifierTimeoutAlert.evaluate({
      ...baseMetrics,
      mlClassifierTimeoutRate: 0.10, // 10% > 5%
      mlSafetyVolume: SLO_THRESHOLDS.mlClassifierTimeoutMinSamples,
    });
    expect(result.status).toBe('firing');
    if (result.status !== 'firing') return;
    expect(result.value).toBe(0.10);
    expect(result.threshold).toBe(SLO_THRESHOLDS.mlClassifierTimeoutMaxRate);
    expect(result.message).toContain('10.0%');
    expect(result.message).toContain('Replicate latency');
  });

  it('fires at exactly minSamples and rate just above threshold', () => {
    const result = mlClassifierTimeoutAlert.evaluate({
      ...baseMetrics,
      mlClassifierTimeoutRate: 0.0501,
      mlSafetyVolume: SLO_THRESHOLDS.mlClassifierTimeoutMinSamples,
    });
    expect(result.status).toBe('firing');
  });

  it('alert metadata identifies the classifier + warning ID', () => {
    expect(mlClassifierTimeoutAlert.id).toBe('slo-ml-classifier-timeout');
    expect(mlClassifierTimeoutAlert.warning).toBe('S17-B4');
    expect(mlClassifierTimeoutAlert.name).toContain('ML Injection Classifier');
  });
});
