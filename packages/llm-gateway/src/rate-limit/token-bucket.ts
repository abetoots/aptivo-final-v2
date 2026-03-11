/**
 * LLM-10: Per-User Rate Limiting
 * @task LLM-10
 * @warning S2-W1 single-user budget exhaustion prevention
 */

import { Result } from '@aptivo/types';
import type { LLMError } from '../providers/types.js';

// ---------------------------------------------------------------------------
// store adapter interface (swap in-memory for Redis in Phase 2)
// ---------------------------------------------------------------------------

export interface RateLimitState {
  tokens: number;
  lastRefill: number; // unix timestamp ms
}

export interface RateLimitStore {
  get(key: string): Promise<RateLimitState | null>;
  set(key: string, state: RateLimitState): Promise<void>;
}

// ---------------------------------------------------------------------------
// in-memory store (single-instance, Phase 1)
// ---------------------------------------------------------------------------

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly state = new Map<string, RateLimitState>();

  async get(key: string): Promise<RateLimitState | null> {
    return this.state.get(key) ?? null;
  }

  async set(key: string, state: RateLimitState): Promise<void> {
    this.state.set(key, state);
  }
}

// ---------------------------------------------------------------------------
// token bucket config
// ---------------------------------------------------------------------------

export interface TokenBucketConfig {
  /** max tokens (burst capacity) */
  maxTokens: number;
  /** tokens refilled per second */
  refillRate: number;
}

const DEFAULT_CONFIG: TokenBucketConfig = {
  maxTokens: 20,
  refillRate: 2, // 2 requests/sec refill
};

// ---------------------------------------------------------------------------
// token bucket rate limiter
// ---------------------------------------------------------------------------

export class TokenBucket {
  private readonly config: TokenBucketConfig;
  private readonly store: RateLimitStore;

  constructor(store: RateLimitStore, config?: Partial<TokenBucketConfig>) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attempts to consume a token for the given user.
   * Returns ok('allowed') or err with RateLimitExceeded.
   *
   * @param userId - user or session identifier
   * @param now - current timestamp in ms (injectable for testing)
   */
  async enforce(userId: string, now: number = Date.now()): Promise<Result<'allowed', LLMError>> {
    try {
      const state = await this.store.get(userId);

      if (!state) {
        // first request: initialize with maxTokens - 1
        await this.store.set(userId, {
          tokens: this.config.maxTokens - 1,
          lastRefill: now,
        });
        return Result.ok('allowed');
      }

      // calculate refill
      const elapsedMs = now - state.lastRefill;
      const elapsedSeconds = elapsedMs / 1000;
      const refilled = Math.floor(elapsedSeconds * this.config.refillRate);
      const newTokens = Math.min(this.config.maxTokens, state.tokens + refilled);

      if (newTokens < 1) {
        return Result.err({
          _tag: 'RateLimitExceeded',
          userId,
          limit: this.config.maxTokens,
        });
      }

      // consume one token
      await this.store.set(userId, {
        tokens: newTokens - 1,
        lastRefill: refilled > 0 ? now : state.lastRefill,
      });

      return Result.ok('allowed');
    } catch {
      // fail-closed: block on store errors
      return Result.err({
        _tag: 'RateLimitExceeded',
        userId,
        limit: this.config.maxTokens,
      });
    }
  }
}
