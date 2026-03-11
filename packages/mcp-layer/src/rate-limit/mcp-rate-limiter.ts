/**
 * MCP-03: MCP Rate Limiter (Token Bucket)
 * @task MCP-03
 * @frd FR-CORE-MCP-003
 *
 * Reuses LLM-10 token bucket pattern for non-Inngest call paths.
 * Inngest workflows use native `concurrency` controls instead.
 */

import type {
  McpRateLimiterConfig,
  McpRateLimitStore,
  RateLimitResult,
} from './rate-limit-types.js';

const DEFAULT_CONFIG: McpRateLimiterConfig = {
  maxTokens: 10,
  refillRate: 2,
};

export class McpRateLimiter {
  private readonly config: McpRateLimiterConfig;
  private readonly store: McpRateLimitStore;

  constructor(store: McpRateLimitStore, config?: Partial<McpRateLimiterConfig>) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a request to the given server is allowed.
   * Fail-closed: store errors → rate limit denied.
   *
   * @param serverId - server identifier for per-server limiting
   * @param now - current timestamp ms (injectable for testing)
   */
  async check(serverId: string, now: number = Date.now()): Promise<RateLimitResult> {
    try {
      const state = await this.store.get(serverId);

      if (!state) {
        // first request — initialize with maxTokens - 1
        await this.store.set(serverId, {
          tokens: this.config.maxTokens - 1,
          lastRefill: now,
        });
        return { allowed: true, remaining: this.config.maxTokens - 1 };
      }

      // calculate refill
      const elapsedMs = now - state.lastRefill;
      const elapsedSeconds = elapsedMs / 1000;
      const refilled = Math.floor(elapsedSeconds * this.config.refillRate);
      const newTokens = Math.min(this.config.maxTokens, state.tokens + refilled);

      if (newTokens < 1) {
        // calculate time until next token
        const tokensNeeded = 1 - newTokens;
        const retryAfterMs = Math.ceil((tokensNeeded / this.config.refillRate) * 1000);
        return { allowed: false, retryAfterMs };
      }

      // consume one token
      await this.store.set(serverId, {
        tokens: newTokens - 1,
        lastRefill: refilled > 0 ? now : state.lastRefill,
      });

      return { allowed: true, remaining: newTokens - 1 };
    } catch {
      // fail-closed: block on store errors
      return { allowed: false, retryAfterMs: 1000 };
    }
  }

  getConfig(): Readonly<McpRateLimiterConfig> {
    return this.config;
  }
}
