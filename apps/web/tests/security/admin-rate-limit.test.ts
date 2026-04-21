/**
 * FA3-01: admin rate-limit middleware tests.
 *
 * Uses a mock Redis client (incr/expire) to exercise the sliding
 * window policy without hitting a real Redis. RBAC-extract is driven
 * via the x-user-id header (dev-mode extraction).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createAdminRateLimit,
  type RateLimitRedis,
} from '../../src/lib/security/admin-rate-limit';

// hoisted mock so extractUser returns a predictable identity
vi.mock('../../src/lib/security/rbac-resolver', () => ({
  extractUser: async (request: Request) => {
    const uid = request.headers.get('x-user-id');
    return uid ? { userId: uid, email: 'test@x' } : null;
  },
}));

function mockRedis(): RateLimitRedis & { counts: Map<string, number>; expires: Map<string, number> } {
  const counts = new Map<string, number>();
  const expires = new Map<string, number>();
  return {
    counts,
    expires,
    async incr(key) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      expires.set(key, seconds);
      return 1;
    },
  };
}

function req(userId: string | null = 'user-1'): Request {
  const headers = new Headers();
  if (userId) headers.set('x-user-id', userId);
  return new Request('http://localhost/api/admin/departments', { method: 'POST', headers });
}

// ---------------------------------------------------------------------------
// basic allow/deny
// ---------------------------------------------------------------------------

describe('FA3-01: admin rate-limit — basic window behaviour', () => {
  it('allows up to maxWrites within the window', async () => {
    const redis = mockRedis();
    const limiter = createAdminRateLimit(redis, { maxWrites: 3, windowMs: 60_000, nowMs: () => 1000 });
    for (let i = 0; i < 3; i += 1) {
      expect(await limiter.check(req())).toBeNull();
    }
  });

  it('returns 429 + application/problem+json on the (maxWrites+1)th write', async () => {
    const redis = mockRedis();
    const limiter = createAdminRateLimit(redis, { maxWrites: 3, windowMs: 60_000, nowMs: () => 1000 });
    for (let i = 0; i < 3; i += 1) {
      expect(await limiter.check(req())).toBeNull();
    }
    const denied = await limiter.check(req());
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(429);
    expect(denied!.headers.get('content-type')).toContain('application/problem+json');
    expect(denied!.headers.get('retry-after')).toBeTruthy();
  });

  it('sets TTL on the first hit of a window, not on subsequent hits', async () => {
    const redis = mockRedis();
    const limiter = createAdminRateLimit(redis, { maxWrites: 5, windowMs: 60_000, nowMs: () => 1000 });
    await limiter.check(req());
    await limiter.check(req());
    await limiter.check(req());
    expect(redis.expires.size).toBe(1);
  });

  it('resets when the window rolls over', async () => {
    const redis = mockRedis();
    let clock = 1000;
    const limiter = createAdminRateLimit(redis, { maxWrites: 2, windowMs: 60_000, nowMs: () => clock });
    expect(await limiter.check(req())).toBeNull();
    expect(await limiter.check(req())).toBeNull();
    expect((await limiter.check(req()))?.status).toBe(429);
    // advance past the window boundary
    clock += 60_000;
    expect(await limiter.check(req())).toBeNull();
  });

  it('keys by actor so two users don\'t share a bucket', async () => {
    const redis = mockRedis();
    const limiter = createAdminRateLimit(redis, { maxWrites: 1, windowMs: 60_000, nowMs: () => 1000 });
    expect(await limiter.check(req('user-A'))).toBeNull();
    expect((await limiter.check(req('user-A')))?.status).toBe(429);
    expect(await limiter.check(req('user-B'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fail-open paths
// ---------------------------------------------------------------------------

describe('FA3-01: admin rate-limit — fail-open', () => {
  it('returns null (allows) when Redis is not configured', async () => {
    const limiter = createAdminRateLimit(null);
    expect(await limiter.check(req())).toBeNull();
  });

  it('returns null when the request is unauthenticated (RBAC handles it)', async () => {
    const redis = mockRedis();
    const limiter = createAdminRateLimit(redis, { maxWrites: 1, windowMs: 60_000, nowMs: () => 1000 });
    expect(await limiter.check(req(null))).toBeNull();
  });
});
