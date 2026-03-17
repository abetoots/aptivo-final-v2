/**
 * NOTIF2-03: Priority Routing + Quiet Hours tests
 * @task NOTIF2-03
 *
 * verifies routing decisions based on notification priority and
 * quiet hours configuration.
 */

import { describe, it, expect } from 'vitest';
import {
  createPriorityRouter,
  DEFAULT_PRIORITY_CONFIG,
} from '@aptivo/notifications';
import type {
  NotificationPriority,
  PriorityRoutingConfig,
  RoutingDecision,
} from '@aptivo/notifications';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// creates a Date at a specific UTC hour (day doesn't matter for quiet hours)
function utcDate(hour: number, minute = 0): Date {
  const d = new Date('2026-03-17T00:00:00Z');
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// default config structure
// ---------------------------------------------------------------------------

describe('DEFAULT_PRIORITY_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_PRIORITY_CONFIG.defaultPriority).toBe('normal');
    expect(DEFAULT_PRIORITY_CONFIG.quietHours.startHour).toBe(22);
    expect(DEFAULT_PRIORITY_CONFIG.quietHours.endHour).toBe(7);
    expect(DEFAULT_PRIORITY_CONFIG.quietHours.timezone).toBe('UTC');
    expect(DEFAULT_PRIORITY_CONFIG.bypassQuietHours).toEqual(['critical', 'high']);
  });

  it('bypassQuietHours contains critical and high', () => {
    expect(DEFAULT_PRIORITY_CONFIG.bypassQuietHours).toContain('critical');
    expect(DEFAULT_PRIORITY_CONFIG.bypassQuietHours).toContain('high');
    expect(DEFAULT_PRIORITY_CONFIG.bypassQuietHours).not.toContain('normal');
    expect(DEFAULT_PRIORITY_CONFIG.bypassQuietHours).not.toContain('low');
  });
});

// ---------------------------------------------------------------------------
// outside quiet hours — all priorities send
// ---------------------------------------------------------------------------

describe('outside quiet hours', () => {
  const router = createPriorityRouter();

  it('critical sends outside quiet hours', () => {
    const decision = router.route('critical', utcDate(12));
    expect(decision.shouldSend).toBe(true);
    expect(decision.priority).toBe('critical');
    expect(decision.delayed).toBe(false);
    expect(decision.reason).toBe('outside quiet hours');
  });

  it('high sends outside quiet hours', () => {
    const decision = router.route('high', utcDate(14));
    expect(decision.shouldSend).toBe(true);
    expect(decision.priority).toBe('high');
    expect(decision.delayed).toBe(false);
  });

  it('normal sends outside quiet hours', () => {
    const decision = router.route('normal', utcDate(10));
    expect(decision.shouldSend).toBe(true);
    expect(decision.priority).toBe('normal');
    expect(decision.delayed).toBe(false);
  });

  it('low sends outside quiet hours', () => {
    const decision = router.route('low', utcDate(8));
    expect(decision.shouldSend).toBe(true);
    expect(decision.priority).toBe('low');
    expect(decision.delayed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// during quiet hours — bypass or delay
// ---------------------------------------------------------------------------

describe('during quiet hours (22:00-07:00 UTC)', () => {
  const router = createPriorityRouter();

  it('critical always sends (bypasses quiet hours)', () => {
    const decision = router.route('critical', utcDate(23));
    expect(decision.shouldSend).toBe(true);
    expect(decision.priority).toBe('critical');
    expect(decision.delayed).toBe(false);
    expect(decision.reason).toBe('critical bypasses quiet hours');
  });

  it('high sends during quiet hours (bypass)', () => {
    const decision = router.route('high', utcDate(1));
    expect(decision.shouldSend).toBe(true);
    expect(decision.priority).toBe('high');
    expect(decision.delayed).toBe(false);
    expect(decision.reason).toBe('high bypasses quiet hours');
  });

  it('normal blocked during quiet hours (delayed)', () => {
    const decision = router.route('normal', utcDate(23));
    expect(decision.shouldSend).toBe(false);
    expect(decision.priority).toBe('normal');
    expect(decision.delayed).toBe(true);
    expect(decision.reason).toBe('quiet hours active');
  });

  it('low blocked during quiet hours (delayed)', () => {
    const decision = router.route('low', utcDate(3));
    expect(decision.shouldSend).toBe(false);
    expect(decision.priority).toBe('low');
    expect(decision.delayed).toBe(true);
    expect(decision.reason).toBe('quiet hours active');
  });

  it('normal blocked at exact start hour (22:00)', () => {
    const decision = router.route('normal', utcDate(22));
    expect(decision.shouldSend).toBe(false);
    expect(decision.delayed).toBe(true);
  });

  it('normal allowed at exact end hour (07:00)', () => {
    // 07:00 is outside quiet hours (endHour is exclusive upper bound)
    const decision = router.route('normal', utcDate(7));
    expect(decision.shouldSend).toBe(true);
    expect(decision.delayed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// midnight wrapping (22:00-07:00)
// ---------------------------------------------------------------------------

describe('midnight wrapping', () => {
  const router = createPriorityRouter();

  it('midnight (00:00) is within quiet hours', () => {
    expect(router.isQuietHours(utcDate(0))).toBe(true);
  });

  it('06:59 is within quiet hours', () => {
    expect(router.isQuietHours(utcDate(6, 59))).toBe(true);
  });

  it('07:00 is outside quiet hours', () => {
    expect(router.isQuietHours(utcDate(7))).toBe(false);
  });

  it('21:59 is outside quiet hours', () => {
    expect(router.isQuietHours(utcDate(21, 59))).toBe(false);
  });

  it('22:00 is within quiet hours', () => {
    expect(router.isQuietHours(utcDate(22))).toBe(true);
  });

  it('23:59 is within quiet hours', () => {
    expect(router.isQuietHours(utcDate(23, 59))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// custom quiet hours config
// ---------------------------------------------------------------------------

describe('custom quiet hours config', () => {
  it('supports non-wrapping hours (e.g. 13:00-15:00)', () => {
    const router = createPriorityRouter({
      quietHours: { startHour: 13, endHour: 15, timezone: 'UTC' },
    });

    expect(router.isQuietHours(utcDate(12))).toBe(false);
    expect(router.isQuietHours(utcDate(13))).toBe(true);
    expect(router.isQuietHours(utcDate(14))).toBe(true);
    expect(router.isQuietHours(utcDate(15))).toBe(false);
    expect(router.isQuietHours(utcDate(22))).toBe(false);
  });

  it('custom bypass list — only critical bypasses', () => {
    const router = createPriorityRouter({
      bypassQuietHours: ['critical'],
    });

    // high is NOT in bypass list — should be delayed during quiet hours
    const highDecision = router.route('high', utcDate(23));
    expect(highDecision.shouldSend).toBe(false);
    expect(highDecision.delayed).toBe(true);

    // critical still bypasses
    const criticalDecision = router.route('critical', utcDate(23));
    expect(criticalDecision.shouldSend).toBe(true);
  });

  it('empty bypass list — all priorities delayed during quiet hours', () => {
    const router = createPriorityRouter({
      bypassQuietHours: [],
    });

    const decision = router.route('critical', utcDate(23));
    expect(decision.shouldSend).toBe(false);
    expect(decision.delayed).toBe(true);
  });

  it('uses default when no config provided', () => {
    const router = createPriorityRouter();
    // should use 22-7 window
    expect(router.isQuietHours(utcDate(23))).toBe(true);
    expect(router.isQuietHours(utcDate(12))).toBe(false);
  });

  it('partial config merges with defaults', () => {
    const router = createPriorityRouter({
      defaultPriority: 'low',
    });
    // quiet hours should still be 22-7 from defaults
    expect(router.isQuietHours(utcDate(23))).toBe(true);
    expect(router.isQuietHours(utcDate(12))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// routing decision shape
// ---------------------------------------------------------------------------

describe('routing decision structure', () => {
  const router = createPriorityRouter();

  it('returns all required fields in decision', () => {
    const decision = router.route('normal', utcDate(12));
    expect(decision).toHaveProperty('shouldSend');
    expect(decision).toHaveProperty('reason');
    expect(decision).toHaveProperty('priority');
    expect(decision).toHaveProperty('delayed');
  });

  it('uses current time when no time argument provided', () => {
    // should not throw when called without a time argument
    const decision = router.route('normal');
    expect(decision).toHaveProperty('shouldSend');
    expect(typeof decision.shouldSend).toBe('boolean');
  });
});
