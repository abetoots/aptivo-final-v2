/**
 * @testcase MCP-08-INT-001 through MCP-08-INT-010
 * @task MCP-08
 *
 * Integration tests exercising the full MCP wrapper pipeline
 * end-to-end with mock server tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';
import { createMcpWrapper } from '../../src/wrapper/mcp-wrapper.js';
import { InMemoryTransportAdapter } from '../../src/transport/in-memory-adapter.js';
import { McpRateLimiter } from '../../src/rate-limit/mcp-rate-limiter.js';
import { InMemoryRateLimitStore } from '../../src/rate-limit/index.js';
import { CircuitBreakerRegistry } from '../../src/resilience/circuit-breaker-registry.js';
import { InMemoryCacheStore } from '../../src/cache/in-memory-cache-store.js';
import { ALL_MOCK_TOOLS } from '../fixtures/mock-mcp-tools.js';
import type {
  McpWrapperDeps,
  ToolRegistry,
  McpServerRecord,
  McpToolRecord,
} from '../../src/wrapper/mcp-wrapper-types.js';
import type { McpServerConfig } from '../../src/security/allowlist.js';
import type { McpTransportAdapter } from '../../src/transport/transport-types.js';

// ---------------------------------------------------------------------------
// shared test infrastructure
// ---------------------------------------------------------------------------

const SIGNING_KEY = 'integration-test-key-must-be-32-chars!!';

const server: McpServerRecord = {
  id: 'int-srv',
  name: 'integration-server',
  transport: 'stdio',
  command: 'node',
  args: ['mock-server.js'],
  envAllowlist: [],
  maxConcurrent: 5,
  isEnabled: true,
};

const allowlist: McpServerConfig[] = [
  { name: 'integration-server', command: 'node', args: ['mock-server.js'] },
];

function createTool(name: string, overrides?: Partial<McpToolRecord>): McpToolRecord {
  return {
    id: `tool-${name}`,
    serverId: 'int-srv',
    name,
    maxResponseBytes: 1_048_576,
    cacheTtlSeconds: null,
    isEnabled: true,
    ...overrides,
  };
}

function buildPipeline(overrides?: {
  tools?: Record<string, McpToolRecord>;
  rateLimitConfig?: { maxTokens: number; refillRate: number };
  circuitConfig?: { failureThreshold: number; resetTimeoutMs?: number };
  transport?: McpTransportAdapter;
  cache?: InMemoryCacheStore;
}): { wrapper: ReturnType<typeof createMcpWrapper>; deps: McpWrapperDeps } {
  const tools = overrides?.tools ?? { echo: createTool('echo') };
  const transport = overrides?.transport ??
    (() => { const t = new InMemoryTransportAdapter('integration-server', ALL_MOCK_TOOLS); t.connect(); return t; })();

  const registry: ToolRegistry = {
    getServer: vi.fn(async (id) => id === 'int-srv' ? server : null),
    getTool: vi.fn(async (_sid, name) => tools[name] ?? null),
  };

  const deps: McpWrapperDeps = {
    registry,
    transport,
    rateLimiter: new McpRateLimiter(
      new InMemoryRateLimitStore(),
      overrides?.rateLimitConfig ?? { maxTokens: 100, refillRate: 10 },
    ),
    circuitBreakers: new CircuitBreakerRegistry(overrides?.circuitConfig),
    cache: overrides?.cache,
    allowlist,
    signingKey: SIGNING_KEY,
  };

  return { wrapper: createMcpWrapper(deps), deps };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('MCP-08: Integration — Full Pipeline', () => {
  // -----------------------------------------------------------------------
  // happy path
  // -----------------------------------------------------------------------

  it('end-to-end: allowed tool call succeeds', async () => {
    const { wrapper } = buildPipeline();
    const result = await wrapper.executeTool('int-srv', 'echo', { hello: 'world' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toEqual({ hello: 'world' });
      expect(result.value.isError).toBe(false);
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  // -----------------------------------------------------------------------
  // security
  // -----------------------------------------------------------------------

  it('security: disallowed server rejected before transport call', async () => {
    const transport = new InMemoryTransportAdapter('rogue-server', ALL_MOCK_TOOLS);
    await transport.connect();
    const callSpy = vi.spyOn(transport, 'callTool');

    const registry: ToolRegistry = {
      getServer: vi.fn(async () => ({ ...server, name: 'rogue-server', command: 'evil' })),
      getTool: vi.fn(async () => createTool('echo')),
    };

    const deps: McpWrapperDeps = {
      registry,
      transport,
      rateLimiter: new McpRateLimiter(new InMemoryRateLimitStore()),
      circuitBreakers: new CircuitBreakerRegistry(),
      allowlist,
      signingKey: SIGNING_KEY,
    };
    const wrapper = createMcpWrapper(deps);

    const result = await wrapper.executeTool('int-srv', 'echo', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ServerNotAllowed');
    expect(callSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // rate limit
  // -----------------------------------------------------------------------

  it('rate limit: burst exceeding limit throttled', async () => {
    const { wrapper } = buildPipeline({
      tools: { echo: createTool('echo') },
      rateLimitConfig: { maxTokens: 3, refillRate: 0 },
    });

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await wrapper.executeTool('int-srv', 'echo', { i }));
    }

    const allowed = results.filter((r) => r.ok).length;
    const denied = results.filter((r) => !r.ok).length;
    expect(allowed).toBe(3);
    expect(denied).toBe(2);
  });

  // -----------------------------------------------------------------------
  // circuit breaker
  // -----------------------------------------------------------------------

  it('circuit breaker: consecutive failures trip circuit', async () => {
    const failTransport: McpTransportAdapter = {
      connect: async () => Result.ok(undefined),
      callTool: async () => Result.err({
        _tag: 'ConnectionFailed' as const,
        server: 'integration-server',
        cause: new Error('down'),
      }),
      listTools: async () => Result.ok([]),
      close: async () => Result.ok(undefined),
    };

    const { wrapper } = buildPipeline({
      transport: failTransport,
      circuitConfig: { failureThreshold: 2 },
    });

    // two failures trip the breaker
    await wrapper.executeTool('int-srv', 'echo', {});
    await wrapper.executeTool('int-srv', 'echo', {});

    // third call should get CircuitOpen
    const result = await wrapper.executeTool('int-srv', 'echo', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('CircuitOpen');
    }
  });

  // -----------------------------------------------------------------------
  // cache
  // -----------------------------------------------------------------------

  it('cache: second identical call returns cached response', async () => {
    const cache = new InMemoryCacheStore();
    const transport = new InMemoryTransportAdapter('integration-server', ALL_MOCK_TOOLS);
    await transport.connect();
    const callSpy = vi.spyOn(transport, 'callTool');

    const { wrapper } = buildPipeline({
      tools: { echo: createTool('echo', { cacheTtlSeconds: 300 }) },
      transport,
      cache,
    });

    await wrapper.executeTool('int-srv', 'echo', { q: 'cached' });
    // small delay for async cache.set to complete
    await new Promise((r) => setTimeout(r, 10));
    await wrapper.executeTool('int-srv', 'echo', { q: 'cached' });

    expect(callSpy).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // response size (S1-W14)
  // -----------------------------------------------------------------------

  it('response size: oversized response rejected', async () => {
    const { wrapper } = buildPipeline({
      tools: { oversized: createTool('oversized', { maxResponseBytes: 500 }) },
    });

    const result = await wrapper.executeTool('int-srv', 'oversized', { sizeBytes: 10_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('ResponseTooLarge');
    }
  });

  // -----------------------------------------------------------------------
  // combined scenarios
  // -----------------------------------------------------------------------

  it('disabled tool returns ToolDisabled before any pipeline work', async () => {
    const { wrapper } = buildPipeline({
      tools: { echo: createTool('echo', { isEnabled: false }) },
    });

    const result = await wrapper.executeTool('int-srv', 'echo', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ToolDisabled');
  });

  it('unknown tool returns ToolNotFound', async () => {
    const { wrapper } = buildPipeline();

    const result = await wrapper.executeTool('int-srv', 'nonexistent', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe('ToolNotFound');
  });
});
