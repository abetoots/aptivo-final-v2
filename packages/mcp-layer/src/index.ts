/**
 * @aptivo/mcp-layer — MCP security + resilience
 *
 * Provides environment sanitization, server allowlisting, and scoped tokens
 * (SP-06) plus circuit breaker composition (SP-10) for the MCP subsystem.
 *
 * @see docs/06-sprints/sprint-0-technical-spikes.md
 */

export {
  sanitizeEnvForMcp,
  isBlockedEnvVar,
  validateServerConfig,
  generateScopedToken,
} from './security/index.js';

export type {
  McpServerConfig,
  ScopedTokenOptions,
} from './security/index.js';

export {
  CircuitBreaker,
  DEFAULT_CIRCUIT_CONFIG,
} from './resilience/index.js';

export type {
  CircuitState,
  CircuitBreakerConfig,
} from './resilience/index.js';
