/**
 * @testcase SP-10-COMP-001
 * @requirements FR-CORE-MCP-002, FR-CORE-MCP-003
 * @warnings S7-W2, S7-W13, S7-W23
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-10
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  DEFAULT_CIRCUIT_CONFIG,
} from '../src/resilience/circuit-breaker.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const succeed = () => Promise.resolve('ok');
const fail = () => Promise.reject(new Error('downstream failure'));

/** trip the breaker to open state by exhausting the failure threshold */
async function tripToOpen(
  cb: CircuitBreaker,
  threshold = DEFAULT_CIRCUIT_CONFIG.failureThreshold,
): Promise<void> {
  for (let i = 0; i < threshold; i++) {
    await cb.execute(fail).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------
describe('SP-10: Circuit Breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- original 4 passing tests (preserved) ----

  it('initializes in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
  });

  it('uses default config when none provided', () => {
    const cb = new CircuitBreaker();
    expect(cb.getConfig()).toEqual(DEFAULT_CIRCUIT_CONFIG);
  });

  it('accepts partial config overrides', () => {
    const cb = new CircuitBreaker({ failureThreshold: 10 });
    expect(cb.getConfig().failureThreshold).toBe(10);
    expect(cb.getConfig().resetTimeoutMs).toBe(DEFAULT_CIRCUIT_CONFIG.resetTimeoutMs);
  });

  it('starts with zero failures', () => {
    const cb = new CircuitBreaker();
    expect(cb.getFailures()).toBe(0);
  });

  // ---- execute: closed state ----

  describe('closed state', () => {
    it('returns the result of a successful call', async () => {
      const cb = new CircuitBreaker();
      const result = await cb.execute(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('resets failure count on success', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });
      // accumulate some failures without tripping
      for (let i = 0; i < 3; i++) {
        await cb.execute(fail).catch(() => {});
      }
      expect(cb.getFailures()).toBe(3);

      await cb.execute(succeed);
      expect(cb.getFailures()).toBe(0);
      expect(cb.getState()).toBe('closed');
    });

    it('propagates the underlying error on failure', async () => {
      const cb = new CircuitBreaker();
      await expect(cb.execute(fail)).rejects.toThrow('downstream failure');
    });

    it('increments failures on each failed call', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 10 });
      await cb.execute(fail).catch(() => {});
      await cb.execute(fail).catch(() => {});
      expect(cb.getFailures()).toBe(2);
    });
  });

  // ---- state transition: closed -> open (S7-W2) ----

  describe('closed -> open transition (S7-W2)', () => {
    it('transitions to open after failure threshold is reached', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      await tripToOpen(cb, 3);
      expect(cb.getState()).toBe('open');
    });

    it('stays closed when failures are below threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });
      for (let i = 0; i < 4; i++) {
        await cb.execute(fail).catch(() => {});
      }
      expect(cb.getState()).toBe('closed');
      expect(cb.getFailures()).toBe(4);
    });
  });

  // ---- open state ----

  describe('open state', () => {
    it('throws CircuitOpenError immediately', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      await tripToOpen(cb, 2);

      await expect(cb.execute(succeed)).rejects.toThrow(CircuitOpenError);
    });

    it('includes retryAfterMs in CircuitOpenError', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });
      await tripToOpen(cb, 2);

      // advance 3s so 7s remain
      vi.advanceTimersByTime(3_000);

      try {
        await cb.execute(succeed);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CircuitOpenError);
        expect((err as CircuitOpenError).retryAfterMs).toBeLessThanOrEqual(7_000);
        expect((err as CircuitOpenError).retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('does not invoke the supplied function', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      await tripToOpen(cb, 2);

      const spy = vi.fn(succeed);
      await cb.execute(spy).catch(() => {});
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ---- open -> half-open transition ----

  describe('open -> half-open transition', () => {
    it('transitions to half-open after resetTimeoutMs elapses', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5_000 });
      await tripToOpen(cb, 2);
      expect(cb.getState()).toBe('open');

      vi.advanceTimersByTime(5_000);

      // the next execute call should transition to half-open and run the fn
      await cb.execute(succeed);
      // successful probe -> closed
      expect(cb.getState()).toBe('closed');
    });
  });

  // ---- half-open state ----

  describe('half-open state', () => {
    it('transitions to closed on successful probe', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1_000 });
      await tripToOpen(cb, 2);

      vi.advanceTimersByTime(1_000);
      await cb.execute(succeed);

      expect(cb.getState()).toBe('closed');
      expect(cb.getFailures()).toBe(0);
    });

    it('transitions back to open on failed probe', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1_000 });
      await tripToOpen(cb, 2);

      vi.advanceTimersByTime(1_000);
      await cb.execute(fail).catch(() => {});

      expect(cb.getState()).toBe('open');
    });

    it('propagates the original error on failed probe', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1_000 });
      await tripToOpen(cb, 2);

      vi.advanceTimersByTime(1_000);
      await expect(cb.execute(fail)).rejects.toThrow('downstream failure');
    });

    it('exceeding halfOpenMaxAttempts trips back to open', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 1_000,
        halfOpenMaxAttempts: 2,
      });
      await tripToOpen(cb, 2);

      vi.advanceTimersByTime(1_000);

      // two successful probes don't trip (each one closes the circuit, so re-trip)
      // instead: simulate staying in half-open by failing each probe to re-open,
      // then re-entering half-open — but that resets the counter.
      // the real scenario: successive calls while in half-open state.
      // we need calls that don't resolve yet while still half-open.
      // simplest: use recordSuccess/recordFailure manually to stay in half-open.

      // alternatively: drive via execute where fn succeeds but we keep calling.
      // since successful probe closes -> we won't exceed max.
      // the max-attempts guard protects against many concurrent half-open calls.

      // simulate: first call enters half-open and succeeds (halfOpenAttempts=1 -> closed)
      // we need to approach differently — let's trip again and again.

      // trip -> wait -> fail probe (back to open) -> wait -> fail probe -> wait ->
      // now make 3 calls that all time-in during half-open.

      // the simplest approach: create a breaker with halfOpenMaxAttempts=2,
      // enter half-open, and make 3 calls where each fn hangs (never resolves).
      // but that's complex. instead, rely on the counter:
      // call 1: succeeds -> closes. but we want to exhaust attempts without closing.
      // the only way to stay in half-open is if fn hasn't resolved yet.

      // let's use a deferred approach:
      const cb2 = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 100,
        halfOpenMaxAttempts: 2,
      });

      // trip to open
      await cb2.execute(fail).catch(() => {});
      expect(cb2.getState()).toBe('open');

      vi.advanceTimersByTime(100);

      // create functions that we can control
      let resolve1!: (v: string) => void;
      let resolve2!: (v: string) => void;
      const p1 = cb2.execute(
        () => new Promise<string>((r) => { resolve1 = r; }),
      );
      // attempt 1 consumed (halfOpenAttempts = 1), still in half-open
      const p2 = cb2.execute(
        () => new Promise<string>((r) => { resolve2 = r; }),
      );
      // attempt 2 consumed (halfOpenAttempts = 2), still in half-open

      // attempt 3 should exceed max -> throw CircuitOpenError
      await expect(cb2.execute(succeed)).rejects.toThrow(CircuitOpenError);
      expect(cb2.getState()).toBe('open');

      // clean up pending promises
      resolve1('done');
      resolve2('done');
      await p1;
      await p2;
    });
  });

  // ---- reset ----

  describe('reset()', () => {
    it('returns circuit to closed state with zero failures', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      await tripToOpen(cb, 2);
      expect(cb.getState()).toBe('open');

      cb.reset();
      expect(cb.getState()).toBe('closed');
      expect(cb.getFailures()).toBe(0);
    });

    it('allows calls again after reset', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      await tripToOpen(cb, 2);
      cb.reset();

      const result = await cb.execute(() => Promise.resolve('back'));
      expect(result).toBe('back');
    });
  });

  // ---- inngest interaction (S7-W23) ----

  describe('Inngest retry interaction (S7-W23)', () => {
    it('CircuitOpenError carries retryAfterMs for NonRetriableError decision', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 15_000 });
      await tripToOpen(cb, 2);

      try {
        await cb.execute(succeed);
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(CircuitOpenError);
        const coe = err as CircuitOpenError;
        // callers can inspect retryAfterMs to decide:
        //  - if retryAfterMs > remaining retry budget -> throw NonRetriableError
        //  - otherwise -> schedule retry with appropriate delay
        expect(coe.retryAfterMs).toBeGreaterThan(0);
        expect(coe.retryAfterMs).toBeLessThanOrEqual(15_000);
        expect(coe.name).toBe('CircuitOpenError');
        expect(coe.message).toContain('Circuit breaker is open');
      }
    });

    it('prevents retry storms by rejecting fast during open state', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 30_000 });
      await tripToOpen(cb, 2);

      // simulate rapid inngest retries — all should be rejected without calling downstream
      const spy = vi.fn(succeed);
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => cb.execute(spy)),
      );

      expect(spy).not.toHaveBeenCalled();
      for (const r of results) {
        expect(r.status).toBe('rejected');
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(CircuitOpenError);
      }
    });
  });

  // ---- concurrent calls during half-open ----

  describe('concurrent half-open calls', () => {
    it('limits concurrent probes via halfOpenMaxAttempts', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 100,
        halfOpenMaxAttempts: 1,
      });

      await cb.execute(fail).catch(() => {});
      expect(cb.getState()).toBe('open');

      vi.advanceTimersByTime(100);

      // first call enters half-open (attempt 1)
      let resolveProbe!: (v: string) => void;
      const probe = cb.execute(
        () => new Promise<string>((r) => { resolveProbe = r; }),
      );

      // second call should exceed halfOpenMaxAttempts -> CircuitOpenError
      await expect(cb.execute(succeed)).rejects.toThrow(CircuitOpenError);

      // clean up
      resolveProbe('ok');
      await probe;
    });
  });

  // ---- CircuitOpenError class ----

  describe('CircuitOpenError', () => {
    it('has correct name and message', () => {
      const err = new CircuitOpenError(5_000);
      expect(err.name).toBe('CircuitOpenError');
      expect(err.message).toBe('Circuit breaker is open. Retry after 5000ms.');
      expect(err.retryAfterMs).toBe(5_000);
    });

    it('is an instance of Error', () => {
      const err = new CircuitOpenError(1_000);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
