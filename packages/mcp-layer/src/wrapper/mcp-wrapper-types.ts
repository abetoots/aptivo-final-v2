/**
 * MCP-06: Wrapper service types
 * @task MCP-06
 * @frd FR-CORE-MCP-001, FR-CORE-MCP-002, FR-CORE-MCP-003
 */

import type { Result } from '@aptivo/types';
import type { McpTransportAdapter, ToolCallResult } from '../transport/transport-types.js';
import type { McpRateLimiter } from '../rate-limit/mcp-rate-limiter.js';
import type { CircuitBreakerRegistry } from '../resilience/circuit-breaker-registry.js';
import type { McpCacheStore } from '../cache/cache-store.js';
import type { McpServerConfig } from '../security/allowlist.js';

// ---------------------------------------------------------------------------
// registry interfaces (DB adapters inject these)
// ---------------------------------------------------------------------------

export interface McpServerRecord {
  id: string;
  name: string;
  transport: string;
  command: string;
  args: string[];
  envAllowlist: string[];
  maxConcurrent: number;
  isEnabled: boolean;
}

export interface McpToolRecord {
  id: string;
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  maxResponseBytes: number;
  cacheTtlSeconds: number | null;
  isEnabled: boolean;
}

export interface ToolRegistry {
  getServer(serverId: string): Promise<McpServerRecord | null>;
  getTool(serverId: string, toolName: string): Promise<McpToolRecord | null>;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type McpError =
  | { _tag: 'ValidationError'; message: string }
  | { _tag: 'ServerNotAllowed'; server: string }
  | { _tag: 'ToolNotFound'; tool: string; server: string }
  | { _tag: 'ToolDisabled'; tool: string }
  | { _tag: 'RateLimitExceeded'; server: string; retryAfterMs: number }
  | { _tag: 'CircuitOpen'; server: string; retryAfterMs: number }
  | { _tag: 'ResponseTooLarge'; tool: string; bytes: number; limit: number }
  | { _tag: 'TransportError'; tool: string; message: string }
  | { _tag: 'TokenGenerationError'; message: string };

// ---------------------------------------------------------------------------
// wrapper interface + deps
// ---------------------------------------------------------------------------

export interface McpWrapperDeps {
  registry: ToolRegistry;
  transport: McpTransportAdapter;
  rateLimiter: McpRateLimiter;
  circuitBreakers: CircuitBreakerRegistry;
  cache?: McpCacheStore;
  allowlist: McpServerConfig[];
  signingKey: string;
  logger?: McpWrapperLogger;
}

export interface McpWrapperLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface McpWrapper {
  executeTool(
    serverId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<Result<ToolCallResult, McpError>>;
}
