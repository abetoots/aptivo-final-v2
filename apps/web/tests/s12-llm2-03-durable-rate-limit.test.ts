/**
 * S12-LLM2-03: Per-User Durable Rate Limits
 * @task LLM2-03
 *
 * verifies redis-backed rate limit store, per-user durable rate limiter
 * with tier support, fail-open semantics, and composition root wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRedisRateLimitStore,
  createDurableRateLimiter,
  DEFAULT_USER_RATE_LIMITS,
  InMemoryRateLimitStore,
} from '@aptivo/llm-gateway/rate-limit';
import type {
  RedisRateLimitClient,
  RateLimitStore,
  PerUserRateLimitConfig,
} from '@aptivo/llm-gateway/rate-limit';

// ---------------------------------------------------------------------------
// mock redis client
// ---------------------------------------------------------------------------

function createMockRedis(store = new Map<string, string>()): RedisRateLimitClient {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, options?: { ex?: number }) => {
      store.set(key, value);
      return 'OK';
    }),
  };
}

// ---------------------------------------------------------------------------
// redis rate limit store
// ---------------------------------------------------------------------------

describe('LLM2-03: RedisRateLimitStore', () => {
  let redis: RedisRateLimitClient;
  let backingStore: Map<string, string>;

  beforeEach(() => {
    backingStore = new Map();
    redis = createMockRedis(backingStore);
  });

  it('get returns null for missing key', async () => {
    const store = createRedisRateLimitStore({ redis });
    const result = await store.get('nonexistent-user');
    expect(result).toBeNull();
  });

  it('set + get round-trips RateLimitState', async () => {
    const store = createRedisRateLimitStore({ redis });
    const state = { tokens: 15, lastRefill: Date.now() };
    await store.set('user-1', state);
    const retrieved = await store.get('user-1');
    expect(retrieved).toEqual(state);
  });

  it('uses custom key prefix', async () => {
    const store = createRedisRateLimitStore({ redis, keyPrefix: 'custom:' });
    await store.set('user-2', { tokens: 10, lastRefill: 1000 });
    expect(redis.set).toHaveBeenCalledWith(
      'custom:user-2',
      expect.any(String),
      { ex: 3600 },
    );
  });

  it('uses custom ttl', async () => {
    const store = createRedisRateLimitStore({ redis, defaultTtlSeconds: 7200 });
    await store.set('user-3', { tokens: 5, lastRefill: 2000 });
    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { ex: 7200 },
    );
  });

  it('get returns null on redis error (fail-open)', async () => {
    const failRedis: RedisRateLimitClient = {
      get: vi.fn(async () => { throw new Error('connection refused'); }),
      set: vi.fn(async () => null),
    };
    const store = createRedisRateLimitStore({ redis: failRedis });
    const result = await store.get('any-user');
    expect(result).toBeNull();
  });

  it('set logs warning on redis error (fail-open)', async () => {
    const failRedis: RedisRateLimitClient = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => { throw new Error('connection refused'); }),
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createRedisRateLimitStore({ redis: failRedis });
    await store.set('any-user', { tokens: 10, lastRefill: 1000 });
    expect(warnSpy).toHaveBeenCalledWith(
      'redis rate limit store: failed to persist state for',
      'any-user',
    );
    warnSpy.mockRestore();
  });

  it('get returns null when redis returns non-json string', async () => {
    const badRedis: RedisRateLimitClient = {
      get: vi.fn(async () => 'not-valid-json'),
      set: vi.fn(async () => null),
    };
    const store = createRedisRateLimitStore({ redis: badRedis });
    const result = await store.get('user-corrupt');
    // json parse throws, caught by fail-open
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// durable rate limiter — basic token bucket behavior
// ---------------------------------------------------------------------------

describe('LLM2-03: DurableRateLimiter — token bucket', () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  it('allows when tokens are available', async () => {
    const limiter = createDurableRateLimiter(store);
    const result = await limiter.checkLimit('user-1', 1, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19); // default 20 - 1
  });

  it('denies when tokens are exhausted', async () => {
    const config: PerUserRateLimitConfig = {
      defaultConfig: { maxTokens: 2, refillRate: 1 },
      overrides: {},
    };
    const limiter = createDurableRateLimiter(store, config);
    const now = 1000;

    // consume all tokens
    await limiter.checkLimit('user-1', 1, now);
    await limiter.checkLimit('user-1', 1, now);
    const result = await limiter.checkLimit('user-1', 1, now);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tokens refill over time', async () => {
    const config: PerUserRateLimitConfig = {
      defaultConfig: { maxTokens: 2, refillRate: 1 },
      overrides: {},
    };
    const limiter = createDurableRateLimiter(store, config);

    // exhaust tokens at t=0
    await limiter.checkLimit('user-1', 2, 0);
    const denied = await limiter.checkLimit('user-1', 1, 0);
    expect(denied.allowed).toBe(false);

    // 2 seconds later, 2 tokens refilled
    const allowed = await limiter.checkLimit('user-1', 1, 2000);
    expect(allowed.allowed).toBe(true);
    expect(allowed.remaining).toBe(1); // 2 refilled - 1 consumed
  });

  it('does not exceed maxTokens on refill', async () => {
    const config: PerUserRateLimitConfig = {
      defaultConfig: { maxTokens: 5, refillRate: 100 },
      overrides: {},
    };
    const limiter = createDurableRateLimiter(store, config);

    // consume 1 token
    await limiter.checkLimit('user-1', 1, 0);

    // wait a long time — tokens should cap at maxTokens
    const result = await limiter.checkLimit('user-1', 1, 100_000);
    expect(result.remaining).toBeLessThanOrEqual(5);
    expect(result.remaining).toBe(4); // 5 capped - 1 consumed
  });

  it('retryAfterMs is calculated correctly', async () => {
    const config: PerUserRateLimitConfig = {
      defaultConfig: { maxTokens: 1, refillRate: 2 },
      overrides: {},
    };
    const limiter = createDurableRateLimiter(store, config);

    // consume the only token
    await limiter.checkLimit('user-1', 1, 0);

    // try again immediately — need 1 token, have 0, refillRate=2
    const result = await limiter.checkLimit('user-1', 1, 0);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(500); // 1 token / 2 per sec = 0.5 sec = 500ms
  });

  it('retryAfterMs accounts for partial refill', async () => {
    const config: PerUserRateLimitConfig = {
      defaultConfig: { maxTokens: 5, refillRate: 1 },
      overrides: {},
    };
    const limiter = createDurableRateLimiter(store, config);

    // exhaust all 5 tokens at t=0
    await limiter.checkLimit('user-1', 5, 0);

    // 2 seconds later — have 2 tokens, need 3
    const result = await limiter.checkLimit('user-1', 3, 2000);
    expect(result.allowed).toBe(false);
    // deficit = 3 - 2 = 1; retryAfterMs = ceil(1/1 * 1000) = 1000
    expect(result.retryAfterMs).toBe(1000);
  });

  it('state persists across calls via store', async () => {
    const limiter = createDurableRateLimiter(store);
    await limiter.checkLimit('user-1', 5, 0);
    // second call should see 15 tokens remaining from first (20 - 5)
    const result = await limiter.checkLimit('user-1', 5, 0);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10); // 15 - 5
  });

  it('allows requesting multiple tokens at once', async () => {
    const limiter = createDurableRateLimiter(store);
    const result = await limiter.checkLimit('user-1', 10, 0);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10); // 20 - 10
  });
});

// ---------------------------------------------------------------------------
// durable rate limiter — per-user config resolution
// ---------------------------------------------------------------------------

describe('LLM2-03: DurableRateLimiter — config resolution', () => {
  it('admin override gives 100 max tokens', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createDurableRateLimiter(store);
    const config = limiter.resolveConfig('admin');
    expect(config.maxTokens).toBe(100);
    expect(config.refillRate).toBe(10);
  });

  it('restricted override gives 5 max tokens', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createDurableRateLimiter(store);
    const config = limiter.resolveConfig('restricted');
    expect(config.maxTokens).toBe(5);
    expect(config.refillRate).toBe(0.5);
  });

  it('standard override matches default', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createDurableRateLimiter(store);
    const config = limiter.resolveConfig('standard');
    expect(config).toEqual(DEFAULT_USER_RATE_LIMITS.defaultConfig);
  });

  it('unknown userId falls back to default config', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createDurableRateLimiter(store);
    const config = limiter.resolveConfig('some-random-user-id');
    expect(config).toEqual(DEFAULT_USER_RATE_LIMITS.defaultConfig);
  });

  it('admin user can burst more requests than standard', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createDurableRateLimiter(store);

    // admin gets 100 tokens
    const adminResult = await limiter.checkLimit('admin', 50, 0);
    expect(adminResult.allowed).toBe(true);
    expect(adminResult.remaining).toBe(50);

    // standard user can't burst 50
    const userResult = await limiter.checkLimit('some-user', 50, 0);
    expect(userResult.allowed).toBe(false);
  });

  it('custom config overrides defaults entirely', async () => {
    const store = new InMemoryRateLimitStore();
    const custom: PerUserRateLimitConfig = {
      defaultConfig: { maxTokens: 3, refillRate: 1 },
      overrides: { vip: { maxTokens: 50, refillRate: 5 } },
    };
    const limiter = createDurableRateLimiter(store, custom);

    // default is now 3, not 20
    const config = limiter.resolveConfig('nobody');
    expect(config.maxTokens).toBe(3);

    // vip is 50
    const vipConfig = limiter.resolveConfig('vip');
    expect(vipConfig.maxTokens).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// default constants
// ---------------------------------------------------------------------------

describe('LLM2-03: DEFAULT_USER_RATE_LIMITS', () => {
  it('has default, admin, standard, and restricted tiers', () => {
    expect(DEFAULT_USER_RATE_LIMITS.defaultConfig).toBeDefined();
    expect(DEFAULT_USER_RATE_LIMITS.overrides.admin).toBeDefined();
    expect(DEFAULT_USER_RATE_LIMITS.overrides.standard).toBeDefined();
    expect(DEFAULT_USER_RATE_LIMITS.overrides.restricted).toBeDefined();
  });

  it('admin has highest burst capacity', () => {
    const { admin, standard, restricted } = DEFAULT_USER_RATE_LIMITS.overrides;
    expect(admin!.maxTokens).toBeGreaterThan(standard!.maxTokens);
    expect(standard!.maxTokens).toBeGreaterThan(restricted!.maxTokens);
  });

  it('admin has highest refill rate', () => {
    const { admin, standard, restricted } = DEFAULT_USER_RATE_LIMITS.overrides;
    expect(admin!.refillRate).toBeGreaterThan(standard!.refillRate);
    expect(standard!.refillRate).toBeGreaterThan(restricted!.refillRate);
  });
});

// ---------------------------------------------------------------------------
// composition root wiring
// ---------------------------------------------------------------------------

describe('LLM2-03: composition root wiring', () => {
  it('getLlmGateway is exported from services', async () => {
    // verify the composition root module can be resolved
    const mod = await import('../src/lib/services.js');
    expect(typeof mod.getLlmGateway).toBe('function');
    expect(typeof mod.getDurableRateLimiter).toBe('function');
  });

  it('createRedisRateLimitStore implements RateLimitStore interface', () => {
    const redis = createMockRedis();
    const store = createRedisRateLimitStore({ redis });
    // verify it has the required methods
    expect(typeof store.get).toBe('function');
    expect(typeof store.set).toBe('function');
  });

  it('InMemoryRateLimitStore implements RateLimitStore interface', () => {
    const store = new InMemoryRateLimitStore();
    expect(typeof store.get).toBe('function');
    expect(typeof store.set).toBe('function');
  });

  it('createDurableRateLimiter works with InMemoryRateLimitStore (fallback)', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createDurableRateLimiter(store);
    const result = await limiter.checkLimit('test-user', 1, 0);
    expect(result.allowed).toBe(true);
  });

  it('createDurableRateLimiter works with RedisRateLimitStore', async () => {
    const redis = createMockRedis();
    const store = createRedisRateLimitStore({ redis });
    const limiter = createDurableRateLimiter(store);
    const result = await limiter.checkLimit('test-user', 1, 0);
    expect(result.allowed).toBe(true);
    // verify redis was called
    expect(redis.set).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// edge cases
// ---------------------------------------------------------------------------

describe('LLM2-03: edge cases', () => {
  it('zero tokensRequested always allowed', async () => {
    const store = new InMemoryRateLimitStore();
    const config: PerUserRateLimitConfig = {
      defaultConfig: { maxTokens: 0, refillRate: 0 },
      overrides: {},
    };
    const limiter = createDurableRateLimiter(store, config);
    const result = await limiter.checkLimit('user-1', 0, 0);
    expect(result.allowed).toBe(true);
  });

  it('fractional refill rate works (restricted tier = 0.5/sec)', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createDurableRateLimiter(store);

    // exhaust restricted user's tokens (5)
    await limiter.checkLimit('restricted', 5, 0);
    const denied = await limiter.checkLimit('restricted', 1, 0);
    expect(denied.allowed).toBe(false);

    // 2 seconds later: 0.5 * 2 = 1 token
    const allowed = await limiter.checkLimit('restricted', 1, 2000);
    expect(allowed.allowed).toBe(true);
  });

  it('concurrent users have independent buckets', async () => {
    const store = new InMemoryRateLimitStore();
    const config: PerUserRateLimitConfig = {
      defaultConfig: { maxTokens: 2, refillRate: 0 },
      overrides: {},
    };
    const limiter = createDurableRateLimiter(store, config);

    // exhaust user-a
    await limiter.checkLimit('user-a', 2, 0);
    const deniedA = await limiter.checkLimit('user-a', 1, 0);
    expect(deniedA.allowed).toBe(false);

    // user-b should still have tokens
    const allowedB = await limiter.checkLimit('user-b', 1, 0);
    expect(allowedB.allowed).toBe(true);
  });
});
