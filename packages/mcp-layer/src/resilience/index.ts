/**
 * MCP Resilience — barrel export
 * @spike SP-10
 * @task MCP-04
 */

export {
  CircuitBreaker,
  CircuitOpenError,
  DEFAULT_CIRCUIT_CONFIG,
} from './circuit-breaker.js';

export type {
  CircuitState,
  CircuitBreakerConfig,
} from './circuit-breaker.js';

export { CircuitBreakerRegistry } from './circuit-breaker-registry.js';

export { classifyMcpError } from './error-classifier.js';

export type { ErrorClassification } from './error-classifier.js';

export { createMcpCircuitBreakerRegistry } from './mcp-circuit-factory.js';
