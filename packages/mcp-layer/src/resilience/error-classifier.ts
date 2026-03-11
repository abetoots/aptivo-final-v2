/**
 * MCP-04: Error classification for circuit breaker integration
 * @task MCP-04
 *
 * Categorizes MCP transport errors as transient (retriable, count toward
 * circuit failure threshold) or permanent (not retriable, should NOT trip
 * the circuit breaker).
 */

import type { McpTransportError } from '../transport/transport-types.js';

export type ErrorClassification = 'transient' | 'permanent';

/**
 * Classify an MCP transport error for circuit breaker decisions.
 *
 * Transient (count toward breaker): ConnectionFailed, ToolExecutionFailed,
 * TransportClosed, LifecycleError — these may recover on retry.
 *
 * Permanent (skip breaker): ToolNotFound, ServerNotAllowed — retrying
 * won't help; these are configuration or caller errors.
 */
export function classifyMcpError(error: McpTransportError): ErrorClassification {
  switch (error._tag) {
    case 'ConnectionFailed':
    case 'ToolExecutionFailed':
    case 'TransportClosed':
    case 'LifecycleError':
      return 'transient';
    case 'ToolNotFound':
    case 'ServerNotAllowed':
      return 'permanent';
  }
}
