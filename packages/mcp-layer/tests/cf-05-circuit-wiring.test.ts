/**
 * CF-05: MCP circuit breaker error classification wiring tests
 * @task CF-05
 *
 * Tests that createMcpCircuitBreakerRegistry wires classifyMcpError
 * correctly — transient errors trip the breaker, permanent errors don't.
 */

import { describe, it, expect } from 'vitest';
import { createMcpCircuitBreakerRegistry } from '../src/resilience/mcp-circuit-factory.js';

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('createMcpCircuitBreakerRegistry', () => {
  it('creates a registry that builds breakers with shouldRecordFailure', () => {
    const registry = createMcpCircuitBreakerRegistry({ failureThreshold: 3 });
    const breaker = registry.getBreaker('server-1');

    expect(breaker.getConfig().shouldRecordFailure).toBeDefined();
  });

  it('records transient MCP errors as failures', async () => {
    const registry = createMcpCircuitBreakerRegistry({ failureThreshold: 2 });
    const breaker = registry.getBreaker('server-1');

    // simulate transient error (ConnectionFailed)
    try {
      await breaker.execute(async () => {
        throw { _tag: 'ConnectionFailed', message: 'timeout' };
      });
    } catch { /* expected */ }

    expect(breaker.getFailures()).toBe(1);
  });

  it('does not record permanent MCP errors as failures', async () => {
    const registry = createMcpCircuitBreakerRegistry({ failureThreshold: 2 });
    const breaker = registry.getBreaker('server-1');

    // simulate permanent error (ToolNotFound)
    try {
      await breaker.execute(async () => {
        throw { _tag: 'ToolNotFound', tool: 'missing', server: 's1' };
      });
    } catch { /* expected */ }

    expect(breaker.getFailures()).toBe(0);
  });

  it('treats ToolExecutionFailed as transient', async () => {
    const registry = createMcpCircuitBreakerRegistry({ failureThreshold: 3 });
    const breaker = registry.getBreaker('server-1');

    try {
      await breaker.execute(async () => {
        throw { _tag: 'ToolExecutionFailed', tool: 'test', message: 'error' };
      });
    } catch { /* expected */ }

    expect(breaker.getFailures()).toBe(1);
  });

  it('treats ServerNotAllowed as permanent', async () => {
    const registry = createMcpCircuitBreakerRegistry({ failureThreshold: 3 });
    const breaker = registry.getBreaker('server-1');

    try {
      await breaker.execute(async () => {
        throw { _tag: 'ServerNotAllowed', server: 'bad-server' };
      });
    } catch { /* expected */ }

    expect(breaker.getFailures()).toBe(0);
  });

  it('treats unknown errors as transient (fail-safe)', async () => {
    const registry = createMcpCircuitBreakerRegistry({ failureThreshold: 3 });
    const breaker = registry.getBreaker('server-1');

    try {
      await breaker.execute(async () => {
        throw new Error('something unexpected');
      });
    } catch { /* expected */ }

    expect(breaker.getFailures()).toBe(1);
  });

  it('trips breaker after threshold transient errors', async () => {
    const registry = createMcpCircuitBreakerRegistry({ failureThreshold: 2 });
    const breaker = registry.getBreaker('server-1');

    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw { _tag: 'TransportClosed', message: 'closed' };
        });
      } catch { /* expected */ }
    }

    expect(breaker.getState()).toBe('open');
  });

  it('does not trip breaker after many permanent errors', async () => {
    const registry = createMcpCircuitBreakerRegistry({ failureThreshold: 2 });
    const breaker = registry.getBreaker('server-1');

    for (let i = 0; i < 5; i++) {
      try {
        await breaker.execute(async () => {
          throw { _tag: 'ToolNotFound', tool: 'missing', server: 's1' };
        });
      } catch { /* expected */ }
    }

    expect(breaker.getState()).toBe('closed');
    expect(breaker.getFailures()).toBe(0);
  });
});
