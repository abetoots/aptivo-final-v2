/**
 * FA3-01: Admin rate-limit middleware.
 *
 * Per-actor FIXED-WINDOW rate limiter for admin write endpoints. Backed
 * by the session Redis. Pre-commit review flagged that an earlier draft
 * called this "sliding window" — the actual implementation is fixed
 * (window-aligned to `Math.floor(now / windowMs) * windowMs`). Fixed
 * windows allow up to 2x burst at boundaries; for admin writes that
 * tradeoff is acceptable since the cap is low (30 / 5 min default) and
 * dropping to a true sliding window would require Redis sorted-set
 * ops. If burst-at-boundary becomes a real operational concern, move
 * to a ZADD-based sliding window or token-bucket in a follow-up.
 *
 * Pre-commit review §G3 on the S16 plan discovered no such middleware
 * existed in the repo despite the plan claiming otherwise; this is the
 * S16 fix. The middleware is scoped to admin writes (POST / PUT / DELETE
 * on `/api/admin/*`) — reads are unrestricted to avoid breaking
 * dashboard polling.
 */

import { NextResponse } from 'next/server';
import { extractUser } from './rbac-resolver.js';

// ---------------------------------------------------------------------------
// Redis contract — minimal; mirrors what the session Redis client exposes
// ---------------------------------------------------------------------------

export interface RateLimitRedis {
  /** increment the counter, returning the new value */
  incr(key: string): Promise<number>;
  /** set TTL (seconds); typically called only on first-hit of a window */
  expire(key: string, seconds: number): Promise<number | boolean>;
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

export interface AdminRateLimitConfig {
  /** window duration in ms (spec: 5 minutes = 300_000) */
  windowMs?: number;
  /** max write requests per actor per window (spec: 30) */
  maxWrites?: number;
  /** key prefix in Redis — isolates this limiter from others */
  keyPrefix?: string;
  /** injectable clock for tests */
  nowMs?: () => number;
}

const DEFAULTS = {
  windowMs: 5 * 60 * 1000,
  maxWrites: 30,
  keyPrefix: 'admin:rl',
} as const;

// ---------------------------------------------------------------------------
// middleware factory
// ---------------------------------------------------------------------------

export interface AdminRateLimit {
  /**
   * Returns null when the request is allowed (caller continues), OR a
   * 429 RFC 7807 Problem Details response when over-limit. Callers MUST
   * invoke this BEFORE any side-effecting work.
   */
  check(request: Request): Promise<Response | null>;
}

export function createAdminRateLimit(
  redis: RateLimitRedis | null,
  config: AdminRateLimitConfig = {},
): AdminRateLimit {
  const windowMs = config.windowMs ?? DEFAULTS.windowMs;
  const maxWrites = config.maxWrites ?? DEFAULTS.maxWrites;
  const keyPrefix = config.keyPrefix ?? DEFAULTS.keyPrefix;
  const now = config.nowMs ?? Date.now;

  return {
    async check(request) {
      // Fail-open when Redis isn't configured — dev / test environments.
      // Production MUST provision a session Redis; an unconfigured
      // limiter is equivalent to no limiter at all.
      if (!redis) return null;

      const user = await extractUser(request);
      if (!user) return null; // not authenticated → RBAC handles it elsewhere

      // Window-aligned key — resets at every windowMs boundary so a
      // burst at the end of one window + start of the next is bounded.
      const windowStartMs = Math.floor(now() / windowMs) * windowMs;
      const key = `${keyPrefix}:${user.userId}:${windowStartMs}`;

      const count = await redis.incr(key);
      if (count === 1) {
        // first hit in this window — set TTL so stale counters expire
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }

      if (count > maxWrites) {
        const retryAfterSec = Math.ceil((windowStartMs + windowMs - now()) / 1000);
        return NextResponse.json(
          {
            type: 'https://aptivo.dev/errors/rate-limited',
            title: 'Rate Limited',
            status: 429,
            detail: `admin write limit: ${maxWrites} per ${windowMs / 1000}s`,
            retryAfterSec,
          },
          {
            status: 429,
            headers: {
              'content-type': 'application/problem+json',
              'retry-after': String(retryAfterSec),
            },
          },
        );
      }
      return null;
    },
  };
}
