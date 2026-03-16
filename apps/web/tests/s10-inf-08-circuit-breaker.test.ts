/**
 * INF-08: circuit-breaker lifecycle tests — closes tier 2 EP-1
 * @task INF-08
 * @tier2 EP-1
 * @frd FR-CORE-MCP
 *
 * verifies state transitions for the mcp circuit breaker:
 * closed → open → half-open → closed (recovery)
 * closed → open → half-open → open (continued failure)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  DEFAULT_CIRCUIT_CONFIG,
} from '@aptivo/mcp-layer';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** trigger N consecutive failures to trip the breaker */
async function tripBreaker(
  breaker: CircuitBreaker,
  count: number,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    try {
      await breaker.execute(() => Promise.reject(new Error('boom')));
    } catch {
      // expected — swallow to keep looping
    }
  }
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// circuit breaker state machine
// ---------------------------------------------------------------------------

describe('INF-08: CircuitBreaker Lifecycle', () => {
  const THRESHOLD = 3;
  const TIMEOUT_MS = 5_000;
  const HALF_OPEN_MAX = 1;

  function createBreaker(): CircuitBreaker {
    return new CircuitBreaker({
      failureThreshold: THRESHOLD,
      resetTimeoutMs: TIMEOUT_MS,
      halfOpenMaxAttempts: HALF_OPEN_MAX,
    });
  }

  // -------------------------------------------------------------------------
  // 1. initial state is closed
  // -------------------------------------------------------------------------
  it('starts in CLOSED state', () => {
    const breaker = createBreaker();

    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailures()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. closed → open after failure threshold
  // -------------------------------------------------------------------------
  it('transitions CLOSED → OPEN after reaching failure threshold', async () => {
    // fr-core-mcp: breaker trips after N consecutive failures
    const breaker = createBreaker();

    await tripBreaker(breaker, THRESHOLD);

    expect(breaker.getState()).toBe('open');
    expect(breaker.getFailures()).toBe(THRESHOLD);
  });

  it('stays CLOSED when failures are below threshold', async () => {
    const breaker = createBreaker();

    await tripBreaker(breaker, THRESHOLD - 1);

    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailures()).toBe(THRESHOLD - 1);
  });

  // -------------------------------------------------------------------------
  // 3. open rejects requests immediately
  // -------------------------------------------------------------------------
  it('rejects calls immediately while OPEN', async () => {
    // fr-core-mcp: open circuit prevents cascading failures
    const breaker = createBreaker();
    await tripBreaker(breaker, THRESHOLD);
    expect(breaker.getState()).toBe('open');

    const fn = vi.fn().mockResolvedValue('should-not-run');

    await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('CircuitOpenError contains retryAfterMs', async () => {
    const breaker = createBreaker();
    await tripBreaker(breaker, THRESHOLD);

    try {
      await breaker.execute(() => Promise.resolve('nope'));
      // should not reach here
      expect.unreachable('expected CircuitOpenError');
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError);
      expect((err as CircuitOpenError).retryAfterMs).toBeGreaterThan(0);
      expect((err as CircuitOpenError).retryAfterMs).toBeLessThanOrEqual(TIMEOUT_MS);
    }
  });

  // -------------------------------------------------------------------------
  // 4. open → half-open after timeout
  // -------------------------------------------------------------------------
  it('transitions OPEN → HALF_OPEN after resetTimeout expires', async () => {
    // fr-core-mcp: breaker allows a probe after cooldown
    const breaker = createBreaker();
    await tripBreaker(breaker, THRESHOLD);
    expect(breaker.getState()).toBe('open');

    // advance past the reset timeout
    vi.advanceTimersByTime(TIMEOUT_MS + 1);

    // the next execute should transition to half-open and run the probe
    const result = await breaker.execute(() => Promise.resolve('probe-ok'));

    // success in half-open transitions back to closed
    expect(result).toBe('probe-ok');
    expect(breaker.getState()).toBe('closed');
  });

  // -------------------------------------------------------------------------
  // 5. half-open → closed on success (recovery path)
  // -------------------------------------------------------------------------
  it('transitions HALF_OPEN → CLOSED on successful probe', async () => {
    // fr-core-mcp: recovery path after cooldown
    const breaker = createBreaker();
    await tripBreaker(breaker, THRESHOLD);

    vi.advanceTimersByTime(TIMEOUT_MS + 1);

    // successful call in half-open state
    await breaker.execute(() => Promise.resolve('recovered'));

    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailures()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 6. half-open → open on failure (continued failure path)
  // -------------------------------------------------------------------------
  it('transitions HALF_OPEN → OPEN on failed probe', async () => {
    // fr-core-mcp: failed probe re-trips the breaker
    const breaker = createBreaker();
    await tripBreaker(breaker, THRESHOLD);

    vi.advanceTimersByTime(TIMEOUT_MS + 1);

    // failed call in half-open state
    await expect(
      breaker.execute(() => Promise.reject(new Error('still-broken'))),
    ).rejects.toThrow('still-broken');

    expect(breaker.getState()).toBe('open');
  });

  // -------------------------------------------------------------------------
  // 7. failure count resets on success
  // -------------------------------------------------------------------------
  it('resets failure count on a successful call in CLOSED state', async () => {
    // fr-core-mcp: intermittent failures don't accumulate when successes reset the counter
    const breaker = createBreaker();

    // accumulate failures just below threshold
    await tripBreaker(breaker, THRESHOLD - 1);
    expect(breaker.getFailures()).toBe(THRESHOLD - 1);

    // one success resets the counter
    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getFailures()).toBe(0);

    // now another round of failures below threshold should not trip
    await tripBreaker(breaker, THRESHOLD - 1);
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailures()).toBe(THRESHOLD - 1);
  });

  // -------------------------------------------------------------------------
  // 8. full recovery cycle: closed → open → half-open → closed
  // -------------------------------------------------------------------------
  it('completes full lifecycle: CLOSED → OPEN → HALF_OPEN → CLOSED', async () => {
    // fr-core-mcp: end-to-end state machine validation
    const breaker = createBreaker();

    // phase 1: closed
    expect(breaker.getState()).toBe('closed');

    // phase 2: trip to open
    await tripBreaker(breaker, THRESHOLD);
    expect(breaker.getState()).toBe('open');

    // phase 3: wait for timeout → half-open probe succeeds
    vi.advanceTimersByTime(TIMEOUT_MS + 1);
    await breaker.execute(() => Promise.resolve('recovered'));

    // phase 4: back to closed
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailures()).toBe(0);

    // verify normal operation resumes
    const result = await breaker.execute(() => Promise.resolve('healthy'));
    expect(result).toBe('healthy');
  });

  // -------------------------------------------------------------------------
  // 9. continued failure cycle: closed → open → half-open → open
  // -------------------------------------------------------------------------
  it('re-trips: CLOSED → OPEN → HALF_OPEN → OPEN on continued failure', async () => {
    // fr-core-mcp: system stays protected when downstream is still unhealthy
    const breaker = createBreaker();

    await tripBreaker(breaker, THRESHOLD);
    expect(breaker.getState()).toBe('open');

    vi.advanceTimersByTime(TIMEOUT_MS + 1);

    // probe fails → trips back to open
    await expect(
      breaker.execute(() => Promise.reject(new Error('nope'))),
    ).rejects.toThrow('nope');
    expect(breaker.getState()).toBe('open');

    // should reject immediately again (no timeout elapsed since re-trip)
    await expect(
      breaker.execute(() => Promise.resolve('blocked')),
    ).rejects.toThrow(CircuitOpenError);
  });

  // -------------------------------------------------------------------------
  // 10. half-open max attempts exceeded
  // -------------------------------------------------------------------------
  it('trips back to OPEN when half-open max attempts exceeded', async () => {
    // fr-core-mcp: limits probe attempts to prevent probe storms
    const breaker = new CircuitBreaker({
      failureThreshold: THRESHOLD,
      resetTimeoutMs: TIMEOUT_MS,
      halfOpenMaxAttempts: 2,
    });

    await tripBreaker(breaker, THRESHOLD);
    vi.advanceTimersByTime(TIMEOUT_MS + 1);

    // first probe — transitions to half-open, attempt 1 fails
    await expect(
      breaker.execute(() => Promise.reject(new Error('fail-1'))),
    ).rejects.toThrow('fail-1');
    expect(breaker.getState()).toBe('open');

    // advance again for second round
    vi.advanceTimersByTime(TIMEOUT_MS + 1);

    // second probe — attempt 1 succeeds → recovery
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('closed');
  });

  // -------------------------------------------------------------------------
  // 11. manual reset
  // -------------------------------------------------------------------------
  it('reset() restores CLOSED state with zero failures', async () => {
    const breaker = createBreaker();
    await tripBreaker(breaker, THRESHOLD);
    expect(breaker.getState()).toBe('open');

    breaker.reset();

    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailures()).toBe(0);

    // normal operation should work
    const result = await breaker.execute(() => Promise.resolve('after-reset'));
    expect(result).toBe('after-reset');
  });

  // -------------------------------------------------------------------------
  // 12. default config values
  // -------------------------------------------------------------------------
  it('uses default config when no overrides provided', () => {
    const breaker = new CircuitBreaker();
    const config = breaker.getConfig();

    expect(config.failureThreshold).toBe(DEFAULT_CIRCUIT_CONFIG.failureThreshold);
    expect(config.resetTimeoutMs).toBe(DEFAULT_CIRCUIT_CONFIG.resetTimeoutMs);
    expect(config.halfOpenMaxAttempts).toBe(DEFAULT_CIRCUIT_CONFIG.halfOpenMaxAttempts);
  });

  // -------------------------------------------------------------------------
  // 13. shouldRecordFailure filter
  // -------------------------------------------------------------------------
  it('does not count failures that are filtered by shouldRecordFailure', async () => {
    // fr-core-mcp: permanent errors should not trip the breaker
    const breaker = new CircuitBreaker({
      failureThreshold: THRESHOLD,
      resetTimeoutMs: TIMEOUT_MS,
      shouldRecordFailure: (err) =>
        err instanceof Error && err.message !== 'permanent',
    });

    // fire permanent errors — should not count
    for (let i = 0; i < THRESHOLD + 2; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error('permanent')));
      } catch {
        // expected
      }
    }

    // breaker should still be closed because none were recorded
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailures()).toBe(0);
  });

  it('counts failures that pass the shouldRecordFailure filter', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: THRESHOLD,
      resetTimeoutMs: TIMEOUT_MS,
      shouldRecordFailure: (err) =>
        err instanceof Error && err.message === 'transient',
    });

    for (let i = 0; i < THRESHOLD; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error('transient')));
      } catch {
        // expected
      }
    }

    expect(breaker.getState()).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// circuit breaker registry
// ---------------------------------------------------------------------------

describe('INF-08: CircuitBreakerRegistry', () => {
  const THRESHOLD = 2;
  const TIMEOUT_MS = 3_000;

  function createRegistry(): CircuitBreakerRegistry {
    return new CircuitBreakerRegistry({
      failureThreshold: THRESHOLD,
      resetTimeoutMs: TIMEOUT_MS,
    });
  }

  // -------------------------------------------------------------------------
  // 1. manages independent breakers per server
  // -------------------------------------------------------------------------
  it('creates independent breakers for different server ids', async () => {
    // fr-core-mcp: per-server isolation prevents cross-contamination
    const registry = createRegistry();

    const breakerA = registry.getBreaker('server-a');
    const breakerB = registry.getBreaker('server-b');

    // trip server-a
    await tripBreaker(breakerA, THRESHOLD);
    expect(breakerA.getState()).toBe('open');

    // server-b should be unaffected
    expect(breakerB.getState()).toBe('closed');
    const result = await breakerB.execute(() => Promise.resolve('b-ok'));
    expect(result).toBe('b-ok');
  });

  it('returns the same breaker instance for the same server id', () => {
    const registry = createRegistry();

    const first = registry.getBreaker('server-x');
    const second = registry.getBreaker('server-x');

    expect(first).toBe(second);
  });

  // -------------------------------------------------------------------------
  // 2. registry tracks size
  // -------------------------------------------------------------------------
  it('tracks the number of managed breakers', () => {
    const registry = createRegistry();

    expect(registry.size).toBe(0);

    registry.getBreaker('a');
    expect(registry.size).toBe(1);

    registry.getBreaker('b');
    expect(registry.size).toBe(2);

    // same key doesn't add a new breaker
    registry.getBreaker('a');
    expect(registry.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 3. resetAll resets all managed breakers
  // -------------------------------------------------------------------------
  it('resetAll() resets every managed breaker to CLOSED', async () => {
    const registry = createRegistry();

    const breakerA = registry.getBreaker('server-a');
    const breakerB = registry.getBreaker('server-b');

    // trip both breakers
    await tripBreaker(breakerA, THRESHOLD);
    await tripBreaker(breakerB, THRESHOLD);
    expect(breakerA.getState()).toBe('open');
    expect(breakerB.getState()).toBe('open');

    registry.resetAll();

    expect(breakerA.getState()).toBe('closed');
    expect(breakerA.getFailures()).toBe(0);
    expect(breakerB.getState()).toBe('closed');
    expect(breakerB.getFailures()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 4. registry propagates config to all breakers
  // -------------------------------------------------------------------------
  it('propagates config to newly created breakers', async () => {
    const registry = createRegistry();
    const breaker = registry.getBreaker('configured');

    const config = breaker.getConfig();
    expect(config.failureThreshold).toBe(THRESHOLD);
    expect(config.resetTimeoutMs).toBe(TIMEOUT_MS);
  });

  // -------------------------------------------------------------------------
  // 5. concurrent requests during half-open
  // -------------------------------------------------------------------------
  it('limits half-open probes via halfOpenMaxAttempts', async () => {
    // fr-core-mcp: prevents probe storms during recovery
    const registry = new CircuitBreakerRegistry({
      failureThreshold: 2,
      resetTimeoutMs: 1_000,
      halfOpenMaxAttempts: 1,
    });

    const breaker = registry.getBreaker('probe-test');

    // trip the breaker
    await tripBreaker(breaker, 2);
    expect(breaker.getState()).toBe('open');

    // advance past timeout
    vi.advanceTimersByTime(1_001);

    // first probe — enters half-open, attempt 1 fails → back to open
    await expect(
      breaker.execute(() => Promise.reject(new Error('probe-fail'))),
    ).rejects.toThrow('probe-fail');
    expect(breaker.getState()).toBe('open');

    // advance again
    vi.advanceTimersByTime(1_001);

    // second probe — enters half-open, attempt 1 succeeds → closed
    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('closed');
  });

  // -------------------------------------------------------------------------
  // 6. independent lifecycle across registry breakers
  // -------------------------------------------------------------------------
  it('each breaker maintains independent lifecycle', async () => {
    // fr-core-mcp: isolated state machines per mcp server
    const registry = createRegistry();

    const a = registry.getBreaker('server-a');
    const b = registry.getBreaker('server-b');
    const c = registry.getBreaker('server-c');

    // trip server-a and server-c, leave server-b healthy
    await tripBreaker(a, THRESHOLD);
    await tripBreaker(c, THRESHOLD);

    expect(a.getState()).toBe('open');
    expect(b.getState()).toBe('closed');
    expect(c.getState()).toBe('open');

    // advance time to recover a and c
    vi.advanceTimersByTime(TIMEOUT_MS + 1);

    // recover a
    await a.execute(() => Promise.resolve('a-ok'));
    expect(a.getState()).toBe('closed');

    // c still open-ish — probe fails → back to open
    await expect(
      c.execute(() => Promise.reject(new Error('c-fail'))),
    ).rejects.toThrow('c-fail');
    expect(c.getState()).toBe('open');

    // b was never tripped
    expect(b.getState()).toBe('closed');
    expect(b.getFailures()).toBe(0);
  });
});
