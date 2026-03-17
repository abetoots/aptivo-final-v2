/**
 * LLM2-03: Per-user durable rate limiter with tier support
 * @task LLM2-03
 *
 * wraps a RateLimitStore with per-user token bucket logic, supporting
 * configurable tiers (admin, standard, restricted) and fractional
 * token refill for precise rate control.
 */

import type { RateLimitState, RateLimitStore } from './token-bucket.js';

// ---------------------------------------------------------------------------
// config types
// ---------------------------------------------------------------------------

export interface DurableTokenBucketConfig {
  /** max tokens (burst capacity) */
  maxTokens: number;
  /** tokens refilled per second */
  refillRate: number;
}

export interface PerUserRateLimitConfig {
  /** default config used for unknown users/roles */
  defaultConfig: DurableTokenBucketConfig;
  /** userId or role → config override */
  overrides: Record<string, DurableTokenBucketConfig>;
}

// ---------------------------------------------------------------------------
// defaults
// ---------------------------------------------------------------------------

export const DEFAULT_USER_RATE_LIMITS: PerUserRateLimitConfig = {
  defaultConfig: { maxTokens: 20, refillRate: 2 },
  overrides: {
    admin: { maxTokens: 100, refillRate: 10 },
    standard: { maxTokens: 20, refillRate: 2 },
    restricted: { maxTokens: 5, refillRate: 0.5 },
  },
};

// ---------------------------------------------------------------------------
// result type
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** milliseconds until enough tokens are available (only set when denied) */
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDurableRateLimiter(
  store: RateLimitStore,
  config?: PerUserRateLimitConfig,
) {
  const userConfig = config ?? DEFAULT_USER_RATE_LIMITS;

  function resolveConfig(userIdOrRole: string): DurableTokenBucketConfig {
    return userConfig.overrides[userIdOrRole] ?? userConfig.defaultConfig;
  }

  return {
    resolveConfig,

    /**
     * checks whether the user has enough tokens for the request.
     * refills tokens based on elapsed time since last check.
     *
     * @param userId - user identifier or role name
     * @param tokensRequested - number of tokens to consume (default: 1)
     * @param now - current timestamp in ms (injectable for testing)
     */
    async checkLimit(
      userId: string,
      tokensRequested: number = 1,
      now: number = Date.now(),
    ): Promise<RateLimitResult> {
      const cfg = resolveConfig(userId);

      // get current state from store
      const raw = await store.get(userId);
      const state: RateLimitState = raw ?? { tokens: cfg.maxTokens, lastRefill: now };

      // refill tokens based on elapsed time (guard against clock skew)
      const elapsed = Math.max(0, (now - state.lastRefill) / 1000);
      const refilled = Math.min(cfg.maxTokens, state.tokens + elapsed * cfg.refillRate);

      // guard against invalid requests
      const safeTokensRequested = Math.max(0, tokensRequested);

      if (refilled >= safeTokensRequested) {
        const newTokens = refilled - safeTokensRequested;
        await store.set(userId, { tokens: newTokens, lastRefill: now });
        return { allowed: true, remaining: Math.floor(newTokens) };
      }

      // not enough tokens — calculate retry time (guard against zero refill rate)
      const deficit = safeTokensRequested - refilled;
      const retryAfterMs = cfg.refillRate > 0
        ? Math.ceil((deficit / cfg.refillRate) * 1000)
        : 60_000; // fallback to 1 minute if refill rate is zero
      // persist current refilled state even on denial
      await store.set(userId, { tokens: refilled, lastRefill: now });
      return { allowed: false, remaining: Math.floor(refilled), retryAfterMs };
    },
  };
}

export type DurableRateLimiter = ReturnType<typeof createDurableRateLimiter>;
