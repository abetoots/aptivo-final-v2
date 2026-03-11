/**
 * @testcase MCP-06-WS-001 through MCP-06-WS-015
 * @task MCP-06
 * @frd FR-CORE-MCP-001, FR-CORE-MCP-002, FR-CORE-MCP-003
 *
 * Tests the MCP wrapper pipeline:
 * - Happy path: tool call through full pipeline
 * - Allowlist rejection
 * - Rate limiting
 * - Circuit breaker
 * - Cache hit/miss
 * - Response size enforcement (S1-W14)
 * - Transport errors
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Result } from '@aptivo/types';
import { createMcpWrapper } from '../src/wrapper/mcp-wrapper.js';
import { InMemoryTransportAdapter } from '../src/transport/in-memory-adapter.js';
import { McpRateLimiter } from '../src/rate-limit/mcp-rate-limiter.js';
import { InMemoryRateLimitStore } from '../src/rate-limit/index.js';
import { CircuitBreakerRegistry } from '../src/resilience/circuit-breaker-registry.js';
import { InMemoryCacheStore } from '../src/cache/in-memory-cache-store.js';
import { ALL_MOCK_TOOLS } from './fixtures/mock-mcp-tools.js';
import type { McpWrapperDeps, ToolRegistry, McpServerRecord, McpToolRecord } from '../src/wrapper/mcp-wrapper-types.js';
import type { McpServerConfig } from '../src/security/allowlist.js';
import type { McpTransportAdapter } from '../src/transport/transport-types.js';

// ---------------------------------------------------------------------------
// test helpers
// ---------------------------------------------------------------------------

const SIGNING_KEY = 'a'.repeat(32); // 32-char key for scoped tokens

const testServer: McpServerRecord = {
  id: 'srv-1',
  name: 'test-server',
  transport: 'stdio',
  command: 'node',
  args: ['server.js'],
  envAllowlist: [],
  maxConcurrent: 3,
  isEnabled: true,
};

const testTool: McpToolRecord = {
  id: 'tool-1',
  serverId: 'srv-1',
  name: 'echo',
  description: 'Echoes input',
  maxResponseBytes: 1_048_576, // 1MB
  cacheTtlSeconds: null,
  isEnabled: true,
};

const testAllowlist: McpServerConfig[] = [
  { name: 'test-server', command: 'node', args: ['server.js'] },
];

function createTestRegistry(overrides?: {
  server?: McpServerRecord | null;
  tool?: McpToolRecord | null;
}): ToolRegistry {
  return {
    getServer: vi.fn(async () => overrides?.server !== undefined ? overrides.server : testServer),
    getTool: vi.fn(async () => overrides?.tool !== undefined ? overrides.tool : testTool),
  };
}

function createTestDeps(overrides?: Partial<McpWrapperDeps>): McpWrapperDeps {
  const transport = new InMemoryTransportAdapter('test-server', ALL_MOCK_TOOLS);
  // must connect before use
  transport.connect();

  return {
    registry: createTestRegistry(),
    transport,
    rateLimiter: new McpRateLimiter(new InMemoryRateLimitStore(), { maxTokens: 10, refillRate: 2 }),
    circuitBreakers: new CircuitBreakerRegistry(),
    allowlist: testAllowlist,
    signingKey: SIGNING_KEY,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('MCP-06: Wrapper Service', () => {
  // -----------------------------------------------------------------------
  // happy path
  // -----------------------------------------------------------------------

  describe('happy path', () => {
    it('executes tool call through full pipeline', async () => {
      const wrapper = createMcpWrapper(createTestDeps());
      const result = await wrapper.executeTool('srv-1', 'echo', { msg: 'hello' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual({ msg: 'hello' });
        expect(result.value.isError).toBe(false);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles tool handler errors as isError=true', async () => {
      const deps = createTestDeps();
      (deps.registry as ReturnType<typeof createTestRegistry>).getTool = vi.fn(async () => ({
        ...testTool,
        name: 'error',
      }));
      const wrapper = createMcpWrapper(deps);
      const result = await wrapper.executeTool('srv-1', 'error', { message: 'boom' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isError).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // registry
  // -----------------------------------------------------------------------

  describe('registry', () => {
    it('returns ToolNotFound when tool does not exist', async () => {
      const deps = createTestDeps({ registry: createTestRegistry({ tool: null }) });
      const wrapper = createMcpWrapper(deps);
      const result = await wrapper.executeTool('srv-1', 'nonexistent', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ToolNotFound');
      }
    });

    it('returns ToolDisabled when tool is disabled', async () => {
      const deps = createTestDeps({
        registry: createTestRegistry({ tool: { ...testTool, isEnabled: false } }),
      });
      const wrapper = createMcpWrapper(deps);
      const result = await wrapper.executeTool('srv-1', 'echo', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ToolDisabled');
      }
    });

    it('returns ToolNotFound when server does not exist', async () => {
      const deps = createTestDeps({
        registry: createTestRegistry({ server: null }),
      });
      const wrapper = createMcpWrapper(deps);
      const result = await wrapper.executeTool('srv-1', 'echo', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ToolNotFound');
      }
    });
  });

  // -----------------------------------------------------------------------
  // allowlist
  // -----------------------------------------------------------------------

  describe('allowlist', () => {
    it('rejects server not in allowlist', async () => {
      const deps = createTestDeps({ allowlist: [] });
      const wrapper = createMcpWrapper(deps);
      const result = await wrapper.executeTool('srv-1', 'echo', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ServerNotAllowed');
      }
    });
  });

  // -----------------------------------------------------------------------
  // rate limiting
  // -----------------------------------------------------------------------

  describe('rate limiting', () => {
    it('rejects when rate limit exceeded', async () => {
      const rateLimiter = new McpRateLimiter(new InMemoryRateLimitStore(), {
        maxTokens: 1,
        refillRate: 0,
      });
      const deps = createTestDeps({ rateLimiter });
      const wrapper = createMcpWrapper(deps);

      // first call consumes the only token
      await wrapper.executeTool('srv-1', 'echo', { n: 1 });

      // second call should be rate limited
      const result = await wrapper.executeTool('srv-1', 'echo', { n: 2 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('RateLimitExceeded');
      }
    });
  });

  // -----------------------------------------------------------------------
  // circuit breaker
  // -----------------------------------------------------------------------

  describe('circuit breaker', () => {
    it('returns CircuitOpen when breaker is tripped', async () => {
      const circuitBreakers = new CircuitBreakerRegistry({ failureThreshold: 1 });
      // transport that returns Result.err (real transport failure, not tool error)
      const failTransport: McpTransportAdapter = {
        connect: async () => Result.ok(undefined),
        callTool: async () => Result.err({
          _tag: 'ConnectionFailed' as const,
          server: 'test-server',
          cause: new Error('transport failure'),
        }),
        listTools: async () => Result.ok([]),
        close: async () => Result.ok(undefined),
      };

      const deps = createTestDeps({ circuitBreakers, transport: failTransport });
      const wrapper = createMcpWrapper(deps);

      // first call fails + trips breaker
      await wrapper.executeTool('srv-1', 'echo', {});

      // second call should get CircuitOpen
      const result = await wrapper.executeTool('srv-1', 'echo', {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('CircuitOpen');
      }
    });
  });

  // -----------------------------------------------------------------------
  // caching
  // -----------------------------------------------------------------------

  describe('caching', () => {
    it('returns cached response on second identical call', async () => {
      const cache = new InMemoryCacheStore();
      const transport = new InMemoryTransportAdapter('test-server', ALL_MOCK_TOOLS);
      await transport.connect();
      const callToolSpy = vi.spyOn(transport, 'callTool');

      const deps = createTestDeps({
        cache,
        transport,
        registry: createTestRegistry({
          tool: { ...testTool, cacheTtlSeconds: 300 },
        }),
      });
      const wrapper = createMcpWrapper(deps);

      // first call — cache miss
      const r1 = await wrapper.executeTool('srv-1', 'echo', { q: 'test' });
      expect(r1.ok).toBe(true);
      expect(callToolSpy).toHaveBeenCalledTimes(1);

      // second call — cache hit
      const r2 = await wrapper.executeTool('srv-1', 'echo', { q: 'test' });
      expect(r2.ok).toBe(true);
      expect(callToolSpy).toHaveBeenCalledTimes(1); // NOT called again
    });

    it('skips cache when cacheTtlSeconds is null', async () => {
      const cache = new InMemoryCacheStore();
      const transport = new InMemoryTransportAdapter('test-server', ALL_MOCK_TOOLS);
      await transport.connect();
      const callToolSpy = vi.spyOn(transport, 'callTool');

      const deps = createTestDeps({
        cache,
        transport,
        registry: createTestRegistry({
          tool: { ...testTool, cacheTtlSeconds: null },
        }),
      });
      const wrapper = createMcpWrapper(deps);

      await wrapper.executeTool('srv-1', 'echo', { q: 'test' });
      await wrapper.executeTool('srv-1', 'echo', { q: 'test' });

      expect(callToolSpy).toHaveBeenCalledTimes(2); // both go to transport
    });
  });

  // -----------------------------------------------------------------------
  // response size (S1-W14)
  // -----------------------------------------------------------------------

  describe('response size enforcement', () => {
    it('rejects responses exceeding maxResponseBytes', async () => {
      const deps = createTestDeps({
        registry: createTestRegistry({
          tool: { ...testTool, name: 'oversized', maxResponseBytes: 100 },
        }),
      });
      const wrapper = createMcpWrapper(deps);

      const result = await wrapper.executeTool('srv-1', 'oversized', { sizeBytes: 10_000 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ResponseTooLarge');
        if (result.error._tag === 'ResponseTooLarge') {
          expect(result.error.limit).toBe(100);
          expect(result.error.bytes).toBeGreaterThan(100);
        }
      }
    });

    it('allows responses within maxResponseBytes', async () => {
      const deps = createTestDeps({
        registry: createTestRegistry({
          tool: { ...testTool, maxResponseBytes: 10_000_000 },
        }),
      });
      const wrapper = createMcpWrapper(deps);

      const result = await wrapper.executeTool('srv-1', 'echo', { msg: 'small' });
      expect(result.ok).toBe(true);
    });
  });
});
