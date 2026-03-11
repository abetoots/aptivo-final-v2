/**
 * MCP-03: Rate Limiting
 */

export { McpRateLimiter } from './mcp-rate-limiter.js';

export type {
  McpRateLimiterConfig,
  McpRateLimitStore,
  McpRateLimitState,
  RateLimitResult,
} from './rate-limit-types.js';

// ---------------------------------------------------------------------------
// in-memory store (single-instance, for tests)
// ---------------------------------------------------------------------------

import type { McpRateLimitState, McpRateLimitStore } from './rate-limit-types.js';

export class InMemoryRateLimitStore implements McpRateLimitStore {
  private readonly state = new Map<string, McpRateLimitState>();

  async get(key: string): Promise<McpRateLimitState | null> {
    return this.state.get(key) ?? null;
  }

  async set(key: string, state: McpRateLimitState): Promise<void> {
    this.state.set(key, state);
  }
}
