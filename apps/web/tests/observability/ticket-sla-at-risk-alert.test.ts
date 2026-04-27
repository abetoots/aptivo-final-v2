/**
 * S17-CT-2: ticket-sla-at-risk SLO alert tests
 * @task S17-CT-2
 *
 * Verifies the alert fires only when both the rate exceeds the
 * threshold AND the open-ticket sample size is high enough.
 */

import { describe, it, expect } from 'vitest';
import {
  ticketSlaAtRiskAlert,
  SLO_THRESHOLDS,
  type SloMetrics,
} from '../../src/lib/observability/slo-alerts';

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

describe('S17-CT-2: ticketSlaAtRiskAlert', () => {
  it('returns ok when no open tickets in the window', () => {
    const result = ticketSlaAtRiskAlert.evaluate(baseMetrics);
    expect(result.status).toBe('ok');
    expect(result.value).toBe(0);
  });

  it('returns ok when at-risk rate exceeds threshold but sample size is below minimum', () => {
    // 2 of 3 at risk = 66% but only 3 samples (min 5)
    const result = ticketSlaAtRiskAlert.evaluate({
      ...baseMetrics,
      ticketSlaAtRiskCount: 2,
      ticketSlaTotal: 3,
    });
    expect(result.status).toBe('ok');
  });

  it('returns ok when sample size is high but rate is at or below threshold', () => {
    // 20% threshold, exactly 20% rate → does NOT fire (strict >)
    const result = ticketSlaAtRiskAlert.evaluate({
      ...baseMetrics,
      ticketSlaAtRiskCount: 2,
      ticketSlaTotal: 10,
    });
    expect(result.status).toBe('ok');
  });

  it('fires when both rate exceeds threshold AND sample size meets minimum', () => {
    // 4 of 10 = 40% > 20%
    const result = ticketSlaAtRiskAlert.evaluate({
      ...baseMetrics,
      ticketSlaAtRiskCount: 4,
      ticketSlaTotal: 10,
    });
    expect(result.status).toBe('firing');
    if (result.status !== 'firing') return;
    expect(result.value).toBe(0.4);
    expect(result.threshold).toBe(SLO_THRESHOLDS.ticketSlaAtRiskMaxRate);
    expect(result.message).toContain('40.0%');
    expect(result.message).toContain('4 of 10');
  });

  it('alert metadata identifies ticket-sla-at-risk', () => {
    expect(ticketSlaAtRiskAlert.id).toBe('slo-ticket-sla-at-risk');
    expect(ticketSlaAtRiskAlert.warning).toBe('S17-CT-2');
    expect(ticketSlaAtRiskAlert.name).toContain('Ticket SLA');
  });
});
