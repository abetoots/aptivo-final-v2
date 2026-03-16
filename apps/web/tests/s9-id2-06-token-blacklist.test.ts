/**
 * ID2-06: Redis-backed token blacklist tests
 * @task ID2-06
 *
 * verifies the token blacklist service, middleware, and edge cases
 * using an in-memory mock redis client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTokenBlacklistService,
  checkBlacklist,
  type RedisClient,
  type TokenBlacklistService,
} from '../src/lib/auth/token-blacklist';

// ---------------------------------------------------------------------------
// mock redis
// ---------------------------------------------------------------------------

function createMockRedis(): RedisClient & { store: Map<string, { value: string; expireAt?: number }> } {
  const store = new Map<string, { value: string; expireAt?: number }>();
  return {
    store,
    async set(key, value, options) {
      const expireAt = options?.ex ? Date.now() / 1000 + options.ex : undefined;
      store.set(key, { value, expireAt });
      return 'OK';
    },
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expireAt && Date.now() / 1000 > entry.expireAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async exists(...keys) {
      return keys.filter((k) => {
        const entry = store.get(k);
        if (!entry) return false;
        if (entry.expireAt && Date.now() / 1000 > entry.expireAt) {
          store.delete(k);
          return false;
        }
        return true;
      }).length;
    },
    async del(...keys) {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
      }
      return count;
    },
    async dbsize() {
      return store.size;
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function futureTimestamp(secondsFromNow: number): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

function pastTimestamp(secondsAgo: number): number {
  return Math.floor(Date.now() / 1000) - secondsAgo;
}

function makeRequest(): Request {
  return new Request('http://localhost:3000/api/test');
}

// ---------------------------------------------------------------------------
// tests: createTokenBlacklistService
// ---------------------------------------------------------------------------

describe('createTokenBlacklistService', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let service: TokenBlacklistService;

  beforeEach(() => {
    redis = createMockRedis();
    service = createTokenBlacklistService({ redis });
  });

  it('blacklists a jti and isBlacklisted returns true', async () => {
    const result = await service.blacklist('jti-abc', futureTimestamp(3600));
    expect(result.ok).toBe(true);

    const check = await service.isBlacklisted('jti-abc');
    expect(check.ok).toBe(true);
    expect(check.ok && check.value).toBe(true);
  });

  it('returns false for a jti that has not been blacklisted', async () => {
    const result = await service.isBlacklisted('unknown-jti');
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe(false);
  });

  it('skips blacklist when TTL <= 0 (already expired token)', async () => {
    const result = await service.blacklist('expired-jti', pastTimestamp(60));
    expect(result.ok).toBe(true);

    // should not have been stored
    expect(redis.store.size).toBe(0);

    const check = await service.isBlacklisted('expired-jti');
    expect(check.ok).toBe(true);
    expect(check.ok && check.value).toBe(false);
  });

  it('uses custom key prefix', async () => {
    const customService = createTokenBlacklistService({
      redis,
      keyPrefix: 'revoked:',
    });

    await customService.blacklist('jti-custom', futureTimestamp(300));
    expect(redis.store.has('revoked:jti-custom')).toBe(true);
    expect(redis.store.has('bl:jti-custom')).toBe(false);
  });

  it('getStats returns the count of entries', async () => {
    await service.blacklist('jti-1', futureTimestamp(3600));
    await service.blacklist('jti-2', futureTimestamp(3600));
    await service.blacklist('jti-3', futureTimestamp(3600));

    const stats = await service.getStats();
    expect(stats.ok).toBe(true);
    expect(stats.ok && stats.value.count).toBe(3);
  });

  it('returns BlacklistError when redis throws on blacklist', async () => {
    const failRedis = createMockRedis();
    failRedis.set = async () => {
      throw new Error('connection refused');
    };
    const failService = createTokenBlacklistService({ redis: failRedis });

    const result = await failService.blacklist('jti-fail', futureTimestamp(3600));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('BlacklistError');
      expect(result.error.operation).toBe('blacklist');
    }
  });

  it('returns BlacklistError when redis throws on isBlacklisted', async () => {
    const failRedis = createMockRedis();
    failRedis.exists = async () => {
      throw new Error('timeout');
    };
    const failService = createTokenBlacklistService({ redis: failRedis });

    const result = await failService.isBlacklisted('jti-fail');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('BlacklistError');
      expect(result.error.operation).toBe('isBlacklisted');
    }
  });

  it('returns BlacklistError when redis throws on getStats', async () => {
    const failRedis = createMockRedis();
    failRedis.dbsize = async () => {
      throw new Error('connection reset');
    };
    const failService = createTokenBlacklistService({ redis: failRedis });

    const result = await failService.getStats();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('BlacklistError');
      expect(result.error.operation).toBe('getStats');
    }
  });
});

// ---------------------------------------------------------------------------
// tests: checkBlacklist middleware
// ---------------------------------------------------------------------------

describe('checkBlacklist middleware', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let middleware: (request: Request, jti: string | undefined) => Promise<Response | null>;

  beforeEach(() => {
    redis = createMockRedis();
    middleware = checkBlacklist({ redis });
  });

  it('returns 401 for a blacklisted token', async () => {
    // blacklist the jti first
    const service = createTokenBlacklistService({ redis });
    await service.blacklist('revoked-jti', futureTimestamp(3600));

    const response = await middleware(makeRequest(), 'revoked-jti');
    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(401);

    const body = await response!.json();
    expect(body.type).toBe('https://aptivo.dev/errors/token-revoked');
    expect(body.title).toBe('Token Revoked');
    expect(body.errorCode).toBe('token_revoked');
  });

  it('returns null for a non-blacklisted token', async () => {
    const response = await middleware(makeRequest(), 'valid-jti');
    expect(response).toBeNull();
  });

  it('returns null when jti is undefined (skip check)', async () => {
    const response = await middleware(makeRequest(), undefined);
    expect(response).toBeNull();
  });

  it('fails open when redis throws (returns null, not error response)', async () => {
    const failRedis = createMockRedis();
    failRedis.exists = async () => {
      throw new Error('redis down');
    };
    const failMiddleware = checkBlacklist({ redis: failRedis });

    // suppress console.warn in test output
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await failMiddleware(makeRequest(), 'some-jti');
    expect(response).toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      'token blacklist check failed, failing open:',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});
