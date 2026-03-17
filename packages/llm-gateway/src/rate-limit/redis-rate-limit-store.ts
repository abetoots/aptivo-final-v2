/**
 * LLM2-03: Redis-backed durable rate limit store
 * @task LLM2-03
 *
 * provides a persistent rate limit store backed by redis, replacing the
 * in-memory store for multi-instance deployments. fail-open semantics
 * ensure redis outages don't block llm requests.
 */

import type { RateLimitState, RateLimitStore } from './token-bucket.js';

// ---------------------------------------------------------------------------
// redis client interface (minimal subset matching @upstash/redis shape)
// ---------------------------------------------------------------------------

export interface RedisRateLimitClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

export interface RedisRateLimitStoreConfig {
  redis: RedisRateLimitClient;
  /** key prefix for all rate limit keys (default: 'ratelimit:llm:') */
  keyPrefix?: string;
  /** ttl in seconds for each key (default: 3600 = 1 hour) */
  defaultTtlSeconds?: number;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createRedisRateLimitStore(config: RedisRateLimitStoreConfig): RateLimitStore {
  const { redis, keyPrefix = 'ratelimit:llm:', defaultTtlSeconds = 3600 } = config;

  return {
    async get(key: string): Promise<RateLimitState | null> {
      try {
        const data = await redis.get(`${keyPrefix}${key}`);
        if (!data) return null;
        return JSON.parse(data) as RateLimitState;
      } catch {
        // fail-open on read — treat as cache miss
        return null;
      }
    },

    async set(key: string, state: RateLimitState): Promise<void> {
      try {
        await redis.set(`${keyPrefix}${key}`, JSON.stringify(state), { ex: defaultTtlSeconds });
      } catch {
        // fail-open on write — log warning but don't throw
        console.warn('redis rate limit store: failed to persist state for', key);
      }
    },
  };
}
