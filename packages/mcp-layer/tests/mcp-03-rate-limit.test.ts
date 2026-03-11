/**
 * @testcase MCP-03-RL-001 through MCP-03-RL-012
 * @task MCP-03
 * @frd FR-CORE-MCP-003
 *
 * Tests the MCP rate limiter (token bucket):
 * - Basic allow/deny behavior
 * - Token refill over time
 * - Burst capacity enforcement
 * - Fail-closed on store errors
 * - Per-server isolation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpRateLimiter } from '../src/rate-limit/mcp-rate-limiter.js';
import { InMemoryRateLimitStore } from '../src/rate-limit/index.js';
import type { McpRateLimitStore } from '../src/rate-limit/rate-limit-types.js';

describe('MCP-03: Rate Limiter', () => {
  let store: InMemoryRateLimitStore;
  let limiter: McpRateLimiter;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
    limiter = new McpRateLimiter(store, { maxTokens: 3, refillRate: 1 });
  });

  // -----------------------------------------------------------------------
  // basic behavior
  // -----------------------------------------------------------------------

  describe('basic allow/deny', () => {
    it('allows first request and reports remaining tokens', async () => {
      const result = await limiter.check('server-1', 1000);

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.remaining).toBe(2); // 3 - 1 = 2
      }
    });

    it('allows requests up to maxTokens', async () => {
      const now = 1000;
      const r1 = await limiter.check('server-1', now);
      const r2 = await limiter.check('server-1', now);
      const r3 = await limiter.check('server-1', now);

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
    });

    it('denies request when tokens exhausted', async () => {
      const now = 1000;
      await limiter.check('server-1', now);
      await limiter.check('server-1', now);
      await limiter.check('server-1', now);

      const denied = await limiter.check('server-1', now);
      expect(denied.allowed).toBe(false);
      if (!denied.allowed) {
        expect(denied.retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('reports decreasing remaining tokens', async () => {
      const now = 1000;
      const r1 = await limiter.check('server-1', now);
      const r2 = await limiter.check('server-1', now);
      const r3 = await limiter.check('server-1', now);

      expect(r1.allowed && r1.remaining).toBe(2);
      expect(r2.allowed && r2.remaining).toBe(1);
      expect(r3.allowed && r3.remaining).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // token refill
  // -----------------------------------------------------------------------

  describe('token refill', () => {
    it('refills tokens over time', async () => {
      // exhaust all tokens
      await limiter.check('server-1', 1000);
      await limiter.check('server-1', 1000);
      await limiter.check('server-1', 1000);

      // wait 1 second — should refill 1 token (refillRate = 1/sec)
      const result = await limiter.check('server-1', 2000);
      expect(result.allowed).toBe(true);
    });

    it('does not exceed maxTokens on refill', async () => {
      // use one token
      await limiter.check('server-1', 1000);

      // wait 10 seconds — would refill 10 tokens but capped at maxTokens (3)
      const result = await limiter.check('server-1', 11_000);
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.remaining).toBe(2); // min(3, 2+10) = 3, then 3-1 = 2
      }
    });

    it('calculates retryAfterMs when denied', async () => {
      // exhaust all tokens at time 1000
      await limiter.check('server-1', 1000);
      await limiter.check('server-1', 1000);
      await limiter.check('server-1', 1000);

      // immediately try again — should be denied with retryAfterMs
      const denied = await limiter.check('server-1', 1000);
      expect(denied.allowed).toBe(false);
      if (!denied.allowed) {
        // need 1 token, refillRate = 1/sec → 1000ms
        expect(denied.retryAfterMs).toBe(1000);
      }
    });
  });

  // -----------------------------------------------------------------------
  // per-server isolation
  // -----------------------------------------------------------------------

  describe('per-server isolation', () => {
    it('tracks tokens independently per server', async () => {
      const now = 1000;

      // exhaust server-1
      await limiter.check('server-1', now);
      await limiter.check('server-1', now);
      await limiter.check('server-1', now);

      // server-2 should still have tokens
      const result = await limiter.check('server-2', now);
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // fail-closed
  // -----------------------------------------------------------------------

  describe('fail-closed on store errors', () => {
    it('denies when store.get throws', async () => {
      const failingStore: McpRateLimitStore = {
        get: vi.fn(async () => { throw new Error('Redis connection lost'); }),
        set: vi.fn(async () => {}),
      };
      const failLimiter = new McpRateLimiter(failingStore);

      const result = await failLimiter.check('server-1');
      expect(result.allowed).toBe(false);
    });

    it('denies when store.set throws', async () => {
      const failingStore: McpRateLimitStore = {
        get: vi.fn(async () => null),
        set: vi.fn(async () => { throw new Error('Redis write failed'); }),
      };
      const failLimiter = new McpRateLimiter(failingStore);

      const result = await failLimiter.check('server-1');
      expect(result.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // burst test
  // -----------------------------------------------------------------------

  describe('burst capacity', () => {
    it('10 concurrent calls with maxTokens=3: exactly 3 allowed, 7 denied', async () => {
      const burstLimiter = new McpRateLimiter(store, { maxTokens: 3, refillRate: 0 });
      const now = 1000;

      // sequential calls (simulating burst at same instant)
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(await burstLimiter.check('server-burst', now));
      }

      const allowed = results.filter((r) => r.allowed).length;
      const denied = results.filter((r) => !r.allowed).length;

      expect(allowed).toBe(3);
      expect(denied).toBe(7);
    });
  });

  // -----------------------------------------------------------------------
  // config
  // -----------------------------------------------------------------------

  describe('config', () => {
    it('exposes config via getConfig()', () => {
      expect(limiter.getConfig()).toEqual({ maxTokens: 3, refillRate: 1 });
    });

    it('uses defaults when no config provided', () => {
      const defaultLimiter = new McpRateLimiter(store);
      expect(defaultLimiter.getConfig()).toEqual({ maxTokens: 10, refillRate: 2 });
    });
  });
});
