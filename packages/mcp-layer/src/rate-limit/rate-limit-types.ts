/**
 * MCP-03: Rate Limit Types
 * @task MCP-03
 * @frd FR-CORE-MCP-003
 */

// ---------------------------------------------------------------------------
// store adapter interface
// ---------------------------------------------------------------------------

export interface McpRateLimitState {
  tokens: number;
  lastRefill: number; // unix timestamp ms
}

export interface McpRateLimitStore {
  get(key: string): Promise<McpRateLimitState | null>;
  set(key: string, state: McpRateLimitState): Promise<void>;
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

export interface McpRateLimiterConfig {
  /** burst capacity per server (default: 10) */
  maxTokens: number;
  /** tokens refilled per second (default: 2) */
  refillRate: number;
}

// ---------------------------------------------------------------------------
// result
// ---------------------------------------------------------------------------

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };
