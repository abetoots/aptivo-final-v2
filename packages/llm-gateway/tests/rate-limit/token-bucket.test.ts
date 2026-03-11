/**
 * LLM-10: Token Bucket Rate Limiting Tests
 * @task LLM-10
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenBucket, InMemoryRateLimitStore } from '../../src/rate-limit/token-bucket.js';
import type { RateLimitStore } from '../../src/rate-limit/token-bucket.js';

describe('TokenBucket', () => {
  let store: InMemoryRateLimitStore;
  let bucket: TokenBucket;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
    bucket = new TokenBucket(store, { maxTokens: 5, refillRate: 1 });
  });

  it('allows first request (initializes bucket)', async () => {
    const result = await bucket.enforce('user-1', 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('allowed');
    }
  });

  it('allows requests up to burst capacity', async () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      const result = await bucket.enforce('user-1', now);
      expect(result.ok).toBe(true);
    }
  });

  it('blocks when tokens exhausted', async () => {
    const now = 1000;
    // exhaust all 5 tokens
    for (let i = 0; i < 5; i++) {
      await bucket.enforce('user-1', now);
    }

    // 6th request should be blocked (no time for refill)
    const result = await bucket.enforce('user-1', now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('RateLimitExceeded');
      if (result.error._tag === 'RateLimitExceeded') {
        expect(result.error.userId).toBe('user-1');
        expect(result.error.limit).toBe(5);
      }
    }
  });

  it('refills tokens over time', async () => {
    const now = 1000;
    // exhaust all tokens
    for (let i = 0; i < 5; i++) {
      await bucket.enforce('user-1', now);
    }

    // wait 2 seconds — refillRate=1, so 2 tokens refilled
    const result = await bucket.enforce('user-1', now + 2000);
    expect(result.ok).toBe(true);
  });

  it('caps refill at maxTokens', async () => {
    const now = 1000;
    await bucket.enforce('user-1', now); // use 1 token, 4 remaining

    // wait 100 seconds — refill capped at maxTokens (5)
    // should have 5 tokens, consume 1 = 4 remaining
    const result = await bucket.enforce('user-1', now + 100_000);
    expect(result.ok).toBe(true);
  });

  it('isolates per user', async () => {
    const now = 1000;
    // exhaust user-1
    for (let i = 0; i < 5; i++) {
      await bucket.enforce('user-1', now);
    }
    const blocked = await bucket.enforce('user-1', now);
    expect(blocked.ok).toBe(false);

    // user-2 should still be allowed
    const allowed = await bucket.enforce('user-2', now);
    expect(allowed.ok).toBe(true);
  });

  it('fail-closed on store errors', async () => {
    const failStore: RateLimitStore = {
      get: async () => { throw new Error('store down'); },
      set: async () => { throw new Error('store down'); },
    };
    const failBucket = new TokenBucket(failStore, { maxTokens: 5, refillRate: 1 });

    const result = await failBucket.enforce('user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('RateLimitExceeded');
    }
  });

  it('returns RateLimitExceeded error type', async () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      await bucket.enforce('user-1', now);
    }
    const result = await bucket.enforce('user-1', now);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        _tag: 'RateLimitExceeded',
        userId: 'user-1',
        limit: 5,
      });
    }
  });
});

describe('InMemoryRateLimitStore', () => {
  it('returns null for unknown key', async () => {
    const store = new InMemoryRateLimitStore();
    const result = await store.get('unknown');
    expect(result).toBeNull();
  });

  it('stores and retrieves state', async () => {
    const store = new InMemoryRateLimitStore();
    await store.set('user-1', { tokens: 5, lastRefill: 1000 });

    const result = await store.get('user-1');
    expect(result).toEqual({ tokens: 5, lastRefill: 1000 });
  });
});
