/**
 * @testcase SP-15-COMP-001 through SP-15-COMP-025
 * @requirements FR-CORE-RES-001
 * @warnings S7-W23, S7-W2, S7-W5, S7-W12, S7-W15
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-15
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SP_15_CONFIG,
  DependencyMonitor,
  ResilientCaller,
  RetryBudget,
  RateLimitSimulator,
  CascadeDetector,
  type DependencyConfig,
  type CallerError,
} from '../src/sp-15-third-party-degradation.js';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// SP-15-COMP-001: spike configuration
// ---------------------------------------------------------------------------

describe('SP-15: Third-Party Degradation', () => {
  it('has correct spike configuration', () => {
    expect(SP_15_CONFIG.name).toBe('SP-15: Third-Party Degradation');
    expect(SP_15_CONFIG.risk).toBe('HIGH');
    expect(SP_15_CONFIG.validations).toHaveLength(6);
  });

  // -------------------------------------------------------------------------
  // dependency monitor
  // -------------------------------------------------------------------------

  describe('DependencyMonitor', () => {
    let monitor: DependencyMonitor;

    const inngestConfig: DependencyConfig = {
      name: 'inngest',
      policy: 'fail-closed',
      timeoutMs: 5000,
      maxRetries: 3,
    };

    const supabaseConfig: DependencyConfig = {
      name: 'supabase',
      policy: 'fail-open',
      timeoutMs: 3000,
      maxRetries: 2,
    };

    beforeEach(() => {
      monitor = new DependencyMonitor();
    });

    it('registers a dependency with healthy status', () => {
      monitor.register(inngestConfig);
      expect(monitor.getStatus('inngest')).toBe('healthy');
    });

    it('returns undefined for unregistered dependencies', () => {
      expect(monitor.getStatus('unknown')).toBeUndefined();
    });

    it('tracks multiple dependencies via getAll', () => {
      monitor.register(inngestConfig);
      monitor.register(supabaseConfig);
      const all = monitor.getAll();
      expect(all).toHaveLength(2);
      expect(all).toEqual(
        expect.arrayContaining([
          { name: 'inngest', status: 'healthy' },
          { name: 'supabase', status: 'healthy' },
        ]),
      );
    });

    it('stays healthy after a few failures below threshold', () => {
      monitor.register(inngestConfig);
      monitor.recordFailure('inngest');
      monitor.recordFailure('inngest');
      // 2 failures < 3 (degraded threshold)
      expect(monitor.getStatus('inngest')).toBe('healthy');
    });

    it('transitions to degraded after 3 consecutive failures', () => {
      monitor.register(inngestConfig);
      for (let i = 0; i < 3; i++) monitor.recordFailure('inngest');
      expect(monitor.getStatus('inngest')).toBe('degraded');
    });

    it('transitions to unavailable after 5 consecutive failures', () => {
      monitor.register(inngestConfig);
      for (let i = 0; i < 5; i++) monitor.recordFailure('inngest');
      expect(monitor.getStatus('inngest')).toBe('unavailable');
    });

    it('recovers to healthy after a success', () => {
      monitor.register(inngestConfig);
      for (let i = 0; i < 5; i++) monitor.recordFailure('inngest');
      expect(monitor.getStatus('inngest')).toBe('unavailable');

      monitor.recordSuccess('inngest');
      expect(monitor.getStatus('inngest')).toBe('healthy');
    });
  });

  // -------------------------------------------------------------------------
  // resilient caller — fail-closed policy
  // -------------------------------------------------------------------------

  describe('ResilientCaller (fail-closed)', () => {
    let monitor: DependencyMonitor;
    let caller: ResilientCaller;

    beforeEach(() => {
      monitor = new DependencyMonitor();
      caller = new ResilientCaller(monitor);
      monitor.register({
        name: 'inngest',
        policy: 'fail-closed',
        timeoutMs: 1000,
        maxRetries: 3,
      });
    });

    it('returns ok when primary call succeeds', async () => {
      const result = await caller.call('inngest', async () => 42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });

    it('returns error immediately when dependency is unavailable', async () => {
      // push to unavailable
      for (let i = 0; i < 5; i++) monitor.recordFailure('inngest');
      expect(monitor.getStatus('inngest')).toBe('unavailable');

      const result = await caller.call('inngest', async () => 'should-not-run');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.reason).toBe('dependency-unavailable');
        expect(result.error.dependency).toBe('inngest');
      }
    });

    it('returns error for unknown dependency', async () => {
      const result = await caller.call('nonexistent', async () => 'x');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.reason).toBe('unknown-dependency');
    });

    it('records failure in monitor when call throws', async () => {
      await caller.call('inngest', async () => {
        throw new Error('boom');
      });
      // 1 failure — still healthy
      expect(monitor.getStatus('inngest')).toBe('healthy');

      // cause 2 more failures to hit degraded
      await caller.call('inngest', async () => { throw new Error('boom'); });
      await caller.call('inngest', async () => { throw new Error('boom'); });
      expect(monitor.getStatus('inngest')).toBe('degraded');
    });
  });

  // -------------------------------------------------------------------------
  // resilient caller — fail-open policy
  // -------------------------------------------------------------------------

  describe('ResilientCaller (fail-open)', () => {
    let monitor: DependencyMonitor;
    let caller: ResilientCaller;

    beforeEach(() => {
      monitor = new DependencyMonitor();
      caller = new ResilientCaller(monitor);
      monitor.register({
        name: 'supabase',
        policy: 'fail-open',
        timeoutMs: 1000,
        maxRetries: 2,
        fallbackFn: async () => Result.ok({ cached: true }),
      });
    });

    it('returns fallback value when dependency is unavailable', async () => {
      for (let i = 0; i < 5; i++) monitor.recordFailure('supabase');

      const result = await caller.call('supabase', async () => ({ live: true }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ cached: true });
    });

    it('returns primary value when dependency is healthy', async () => {
      const result = await caller.call('supabase', async () => ({ live: true }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ live: true });
    });
  });

  // -------------------------------------------------------------------------
  // resilient caller — fallback policy (S7-W12)
  // -------------------------------------------------------------------------

  describe('ResilientCaller (fallback — S7-W12)', () => {
    let monitor: DependencyMonitor;
    let caller: ResilientCaller;

    beforeEach(() => {
      monitor = new DependencyMonitor();
      caller = new ResilientCaller(monitor);
      monitor.register({
        name: 'llm-provider',
        policy: 'fallback',
        timeoutMs: 2000,
        maxRetries: 1,
        fallbackFn: async () => Result.ok('fallback-response'),
      });
    });

    it('uses fallback when primary call fails', async () => {
      const result = await caller.call('llm-provider', async () => {
        throw new Error('LLM timeout');
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('fallback-response');
    });

    it('uses primary result when it succeeds', async () => {
      const result = await caller.call('llm-provider', async () => 'primary-response');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('primary-response');
    });

    it('returns error when both primary and fallback fail', async () => {
      monitor.register({
        name: 'bad-provider',
        policy: 'fallback',
        timeoutMs: 2000,
        maxRetries: 1,
        fallbackFn: async () => Result.err(new Error('fallback also broke')),
      });

      const result = await caller.call('bad-provider', async () => {
        throw new Error('primary broke');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.reason).toBe('fallback-failed');
    });
  });

  // -------------------------------------------------------------------------
  // timeout handling
  // -------------------------------------------------------------------------

  describe('ResilientCaller (timeout)', () => {
    let monitor: DependencyMonitor;
    let caller: ResilientCaller;

    beforeEach(() => {
      monitor = new DependencyMonitor();
      caller = new ResilientCaller(monitor);
      monitor.register({
        name: 'slow-service',
        policy: 'fail-closed',
        timeoutMs: 50,
        maxRetries: 0,
      });
    });

    it('returns timeout error when call exceeds timeout', async () => {
      const result = await caller.call('slow-service', () =>
        new Promise((resolve) => setTimeout(() => resolve('late'), 200)),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.reason).toBe('timeout');
        expect(result.error.dependency).toBe('slow-service');
      }
    });

    it('succeeds when call completes within timeout', async () => {
      const result = await caller.call('slow-service', () =>
        new Promise((resolve) => setTimeout(() => resolve('on-time'), 10)),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('on-time');
    });
  });

  // -------------------------------------------------------------------------
  // retry budget (S7-W5)
  // -------------------------------------------------------------------------

  describe('RetryBudget (S7-W5)', () => {
    it('succeeds on first attempt without retries', async () => {
      const budget = new RetryBudget(3, 1);
      const result = await budget.attempt(async () => 'first-try');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('first-try');
      expect(budget.isExhausted()).toBe(false);
    });

    it('retries and succeeds on later attempt', async () => {
      const budget = new RetryBudget(3, 1);
      let callCount = 0;
      const result = await budget.attempt(async () => {
        callCount += 1;
        if (callCount < 3) throw new Error('not yet');
        return 'third-try';
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('third-try');
      expect(callCount).toBe(3);
    });

    it('returns retries-exhausted when budget is spent', async () => {
      const budget = new RetryBudget(2, 1);
      const result = await budget.attempt(async () => {
        throw new Error('always fails');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.reason).toBe('retries-exhausted');
      }
      expect(budget.isExhausted()).toBe(true);
    });

    it('applies exponential backoff between retries', async () => {
      const budget = new RetryBudget(2, 10);
      const timestamps: number[] = [];
      await budget.attempt(async () => {
        timestamps.push(Date.now());
        throw new Error('fail');
      });
      // 3 attempts total (initial + 2 retries)
      expect(timestamps.length).toBe(3);
      // second gap should be roughly 2x the first gap
      const gap1 = timestamps[1]! - timestamps[0]!;
      const gap2 = timestamps[2]! - timestamps[1]!;
      // backoff: 10ms, 20ms — gap2 should be >= gap1
      expect(gap2).toBeGreaterThanOrEqual(gap1);
    });
  });

  // -------------------------------------------------------------------------
  // rate limit simulator (S7-W15)
  // -------------------------------------------------------------------------

  describe('RateLimitSimulator (S7-W15)', () => {
    let limiter: RateLimitSimulator;

    beforeEach(() => {
      limiter = new RateLimitSimulator();
    });

    it('allows requests within the limit', () => {
      const result = limiter.checkLimit(50, 100);
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it('allows the 100th request at the boundary', () => {
      const result = limiter.checkLimit(100, 100);
      expect(result.allowed).toBe(true);
    });

    it('rejects the 101st request with retryAfterMs', () => {
      const result = limiter.checkLimit(101, 100);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(60_000);
    });

    it('rejects well above the limit', () => {
      const result = limiter.checkLimit(500, 100);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // cascade detector
  // -------------------------------------------------------------------------

  describe('CascadeDetector', () => {
    let detector: CascadeDetector;

    beforeEach(() => {
      detector = new CascadeDetector();
    });

    it('reports no cascade when no failures recorded', () => {
      expect(detector.isCascading()).toBe(false);
      expect(detector.getFailingDependencies()).toEqual([]);
    });

    it('reports no cascade for a single failing dependency', () => {
      detector.recordFailure('inngest');
      expect(detector.isCascading()).toBe(false);
      expect(detector.getFailingDependencies()).toEqual(['inngest']);
    });

    it('detects cascade when multiple dependencies fail simultaneously', () => {
      detector.recordFailure('inngest');
      detector.recordFailure('supabase');
      expect(detector.isCascading()).toBe(true);
      expect(detector.getFailingDependencies()).toHaveLength(2);
      expect(detector.getFailingDependencies()).toContain('inngest');
      expect(detector.getFailingDependencies()).toContain('supabase');
    });

    it('detects cascade with three failing dependencies', () => {
      detector.recordFailure('inngest');
      detector.recordFailure('supabase');
      detector.recordFailure('novu');
      expect(detector.isCascading()).toBe(true);
      expect(detector.getFailingDependencies()).toHaveLength(3);
    });

    it('stops reporting cascade after time window expires', () => {
      // use fake timers to control the cascade window
      vi.useFakeTimers();
      try {
        detector.recordFailure('inngest');
        detector.recordFailure('supabase');
        expect(detector.isCascading()).toBe(true);

        // advance past the 5s cascade window
        vi.advanceTimersByTime(6_000);
        expect(detector.isCascading()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // -------------------------------------------------------------------------
  // integration: recovery scenario
  // -------------------------------------------------------------------------

  describe('recovery scenario', () => {
    it('dependency recovers from unavailable to healthy after success', async () => {
      const monitor = new DependencyMonitor();
      const caller = new ResilientCaller(monitor);
      monitor.register({
        name: 'novu',
        policy: 'fail-closed',
        timeoutMs: 1000,
        maxRetries: 2,
      });

      // drive to unavailable
      for (let i = 0; i < 5; i++) monitor.recordFailure('novu');
      expect(monitor.getStatus('novu')).toBe('unavailable');

      // cannot call while unavailable (fail-closed)
      const blocked = await caller.call('novu', async () => 'msg');
      expect(blocked.ok).toBe(false);

      // external recovery — record success (e.g. health check passed)
      monitor.recordSuccess('novu');
      expect(monitor.getStatus('novu')).toBe('healthy');

      // now calls succeed again
      const recovered = await caller.call('novu', async () => 'delivered');
      expect(recovered.ok).toBe(true);
      if (recovered.ok) expect(recovered.value).toBe('delivered');
    });
  });
});
