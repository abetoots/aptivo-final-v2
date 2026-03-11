/**
 * CF-05: MCP circuit breaker factory with error classification wiring
 * @task CF-05
 *
 * Convenience factory that creates a CircuitBreakerRegistry pre-wired
 * with shouldRecordFailure using classifyMcpError — only transient
 * errors (ConnectionFailed, ToolExecutionFailed, TransportClosed,
 * LifecycleError) count toward the failure threshold.
 *
 * Permanent errors (ToolNotFound, ServerNotAllowed) are caller/config
 * errors and should not trip the breaker.
 */

import { CircuitBreakerRegistry } from './circuit-breaker-registry.js';
import type { CircuitBreakerConfig } from './circuit-breaker.js';
import { classifyMcpError } from './error-classifier.js';
import type { McpTransportError } from '../transport/transport-types.js';

/**
 * Creates a CircuitBreakerRegistry with classifyMcpError wired as
 * the shouldRecordFailure filter.
 */
export function createMcpCircuitBreakerRegistry(
  config?: Partial<Omit<CircuitBreakerConfig, 'shouldRecordFailure'>>,
): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry({
    ...config,
    shouldRecordFailure: (err: unknown) => {
      // only record failures for errors that look like MCP transport errors
      if (typeof err === 'object' && err !== null && '_tag' in err) {
        return classifyMcpError(err as McpTransportError) === 'transient';
      }
      // unknown errors are treated as transient (fail-safe)
      return true;
    },
  });
}
