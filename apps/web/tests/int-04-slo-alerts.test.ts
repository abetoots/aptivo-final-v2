/**
 * INT-04: SLO alert tests
 * @task INT-04
 */
import { describe, it, expect } from 'vitest';
import {
  workflowSuccessAlert,
  hitlLatencyAlert,
  mcpSuccessAlert,
  auditIntegrityAlert,
  evaluateAllSlos,
  SLO_THRESHOLDS,
  type SloMetrics,
} from '../src/lib/observability/slo-alerts';

// helper for healthy baseline metrics (zero failures for burn-rate compat)
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

describe('INT-04: SLO Alerts', () => {
  describe('workflow success rate (S5-W13)', () => {
    it('returns ok when above threshold', () => {
      const result = workflowSuccessAlert.evaluate(healthyMetrics);
      expect(result.status).toBe('ok');
    });

    it('fires when below 99%', () => {
      const result = workflowSuccessAlert.evaluate({
        ...healthyMetrics,
        workflowSuccess: 980, // 98%
      });
      expect(result.status).toBe('firing');
      expect(result.value).toBeLessThan(SLO_THRESHOLDS.workflowSuccessRate);
    });

    it('returns ok for zero total (no data)', () => {
      const result = workflowSuccessAlert.evaluate({
        ...healthyMetrics,
        workflowTotal: 0,
        workflowSuccess: 0,
      });
      expect(result.status).toBe('ok');
    });
  });

  describe('HITL delivery latency (S5-W14)', () => {
    it('returns ok when P95 under 10s', () => {
      const result = hitlLatencyAlert.evaluate(healthyMetrics);
      expect(result.status).toBe('ok');
    });

    it('fires when P95 exceeds 10s', () => {
      const result = hitlLatencyAlert.evaluate({
        ...healthyMetrics,
        hitlDeliveryLatencyP95Ms: 15_000,
      });
      expect(result.status).toBe('firing');
    });
  });

  describe('MCP success rate (S5-W15)', () => {
    it('returns ok when above 99.5%', () => {
      const result = mcpSuccessAlert.evaluate(healthyMetrics);
      expect(result.status).toBe('ok');
    });

    it('fires when below 99.5%', () => {
      const result = mcpSuccessAlert.evaluate({
        ...healthyMetrics,
        mcpCallSuccess: 490, // 98%
      });
      expect(result.status).toBe('firing');
    });
  });

  describe('audit integrity (S5-W16)', () => {
    it('returns ok when DLQ count within threshold', () => {
      const result = auditIntegrityAlert.evaluate(healthyMetrics);
      expect(result.status).toBe('ok');
    });

    it('fires when DLQ count exceeds threshold', () => {
      const result = auditIntegrityAlert.evaluate({
        ...healthyMetrics,
        auditDlqPendingCount: 150,
      });
      expect(result.status).toBe('firing');
    });
  });

  describe('evaluateAllSlos', () => {
    it('evaluates all 8 alerts (6 threshold + 2 burn-rate)', () => {
      const results = evaluateAllSlos(healthyMetrics);
      expect(results.size).toBe(8);
    });

    it('all ok with healthy metrics', () => {
      const results = evaluateAllSlos(healthyMetrics);
      for (const [, result] of results) {
        expect(result.status).toBe('ok');
      }
    });

    it('reports multiple firing alerts', () => {
      const badMetrics: SloMetrics = {
        workflowTotal: 100,
        workflowSuccess: 90, // 90% — fires
        hitlDeliveryLatencyP95Ms: 15_000, // fires
        mcpCallTotal: 100,
        mcpCallSuccess: 90, // 90% — fires
        auditDlqPendingCount: 200, // fires
        retentionFailureCount: 3, // fires
        notificationTotal: 100,
        notificationDelivered: 80, // 80% — fires
      };
      const results = evaluateAllSlos(badMetrics);
      let firingCount = 0;
      for (const [, result] of results) {
        if (result.status === 'firing') firingCount++;
      }
      expect(firingCount).toBe(8);
    });
  });
});
