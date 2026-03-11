/**
 * @testcase MCP-04-CH-001 through MCP-04-CH-014
 * @task MCP-04
 * @frd FR-CORE-MCP-002, FR-CORE-MCP-003
 *
 * Tests circuit breaker hardening:
 * - Error classification (transient vs permanent)
 * - shouldRecordFailure filter integration
 * - Per-server circuit breaker registry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { classifyMcpError } from '../src/resilience/error-classifier.js';
import { CircuitBreaker } from '../src/resilience/circuit-breaker.js';
import { CircuitBreakerRegistry } from '../src/resilience/circuit-breaker-registry.js';
import type { McpTransportError } from '../src/transport/transport-types.js';

describe('MCP-04: Circuit Breaker Hardening', () => {
  // -----------------------------------------------------------------------
  // error classification
  // -----------------------------------------------------------------------

  describe('classifyMcpError', () => {
    it('classifies ConnectionFailed as transient', () => {
      const err: McpTransportError = { _tag: 'ConnectionFailed', server: 's1', cause: new Error() };
      expect(classifyMcpError(err)).toBe('transient');
    });

    it('classifies ToolExecutionFailed as transient', () => {
      const err: McpTransportError = { _tag: 'ToolExecutionFailed', tool: 't1', message: 'err' };
      expect(classifyMcpError(err)).toBe('transient');
    });

    it('classifies TransportClosed as transient', () => {
      const err: McpTransportError = { _tag: 'TransportClosed', server: 's1' };
      expect(classifyMcpError(err)).toBe('transient');
    });

    it('classifies LifecycleError as transient', () => {
      const err: McpTransportError = { _tag: 'LifecycleError', operation: 'connect', cause: null };
      expect(classifyMcpError(err)).toBe('transient');
    });

    it('classifies ToolNotFound as permanent', () => {
      const err: McpTransportError = { _tag: 'ToolNotFound', tool: 't1', server: 's1' };
      expect(classifyMcpError(err)).toBe('permanent');
    });

    it('classifies ServerNotAllowed as permanent', () => {
      const err: McpTransportError = { _tag: 'ServerNotAllowed', server: 's1' };
      expect(classifyMcpError(err)).toBe('permanent');
    });
  });

  // -----------------------------------------------------------------------
  // shouldRecordFailure filter
  // -----------------------------------------------------------------------

  describe('shouldRecordFailure filter', () => {
    it('records failure when filter returns true', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        shouldRecordFailure: () => true,
      });

      try { await breaker.execute(async () => { throw new Error('transient'); }); } catch {}
      expect(breaker.getFailures()).toBe(1);
    });

    it('skips failure recording when filter returns false', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        shouldRecordFailure: () => false,
      });

      try { await breaker.execute(async () => { throw new Error('permanent'); }); } catch {}
      expect(breaker.getFailures()).toBe(0);
    });

    it('does not trip circuit on filtered-out errors', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        shouldRecordFailure: (err) =>
          err instanceof Error && err.message !== 'permanent',
      });

      // 5 permanent errors — should NOT trip
      for (let i = 0; i < 5; i++) {
        try { await breaker.execute(async () => { throw new Error('permanent'); }); } catch {}
      }
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailures()).toBe(0);
    });

    it('trips circuit on non-filtered errors', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        shouldRecordFailure: (err) =>
          err instanceof Error && err.message === 'transient',
      });

      // 2 transient errors — should trip
      for (let i = 0; i < 2; i++) {
        try { await breaker.execute(async () => { throw new Error('transient'); }); } catch {}
      }
      expect(breaker.getState()).toBe('open');
    });

    it('still throws the error even when not recording failure', async () => {
      const breaker = new CircuitBreaker({
        shouldRecordFailure: () => false,
      });

      await expect(
        breaker.execute(async () => { throw new Error('should propagate'); }),
      ).rejects.toThrow('should propagate');
    });

    it('half-open does not trip back to open on filtered errors', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 0, // instant reset for testing
        shouldRecordFailure: () => false,
      });

      // trip the breaker with a recorded failure (bypass filter for setup)
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');

      // after resetTimeout, next call enters half-open
      // the filtered error should NOT trip back to open
      try {
        await breaker.execute(async () => { throw new Error('permanent'); });
      } catch {}

      // should still be half-open (not tripped back to open)
      expect(breaker.getState()).toBe('half-open');
    });
  });

  // -----------------------------------------------------------------------
  // circuit breaker registry
  // -----------------------------------------------------------------------

  describe('CircuitBreakerRegistry', () => {
    let registry: CircuitBreakerRegistry;

    beforeEach(() => {
      registry = new CircuitBreakerRegistry({ failureThreshold: 3 });
    });

    it('returns same breaker for same serverId', () => {
      const b1 = registry.getBreaker('server-a');
      const b2 = registry.getBreaker('server-a');
      expect(b1).toBe(b2);
    });

    it('returns different breakers for different serverIds', () => {
      const b1 = registry.getBreaker('server-a');
      const b2 = registry.getBreaker('server-b');
      expect(b1).not.toBe(b2);
    });

    it('passes config to new breakers', () => {
      const breaker = registry.getBreaker('server-x');
      expect(breaker.getConfig().failureThreshold).toBe(3);
    });

    it('resetAll resets all breakers', () => {
      const b1 = registry.getBreaker('server-a');
      const b2 = registry.getBreaker('server-b');

      b1.recordFailure();
      b2.recordFailure();
      b2.recordFailure();

      registry.resetAll();

      expect(b1.getFailures()).toBe(0);
      expect(b2.getFailures()).toBe(0);
    });

    it('tracks number of servers via size', () => {
      registry.getBreaker('a');
      registry.getBreaker('b');
      registry.getBreaker('c');
      expect(registry.size).toBe(3);
    });
  });
});
