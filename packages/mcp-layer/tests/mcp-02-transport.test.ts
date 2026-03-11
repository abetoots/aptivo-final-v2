/**
 * @testcase MCP-02-TA-001 through MCP-02-TA-010
 * @task MCP-02
 * @frd FR-CORE-MCP-001
 *
 * Tests the transport adapter interface and in-memory implementation:
 * - Connection lifecycle (connect, close, reconnect)
 * - Tool call execution and error handling
 * - Tool listing
 * - Duration tracking
 * - Input passthrough
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTransportAdapter } from '../src/transport/in-memory-adapter.js';
import type { InMemoryToolConfig } from '../src/transport/in-memory-adapter.js';

const echoTool: InMemoryToolConfig = {
  definition: {
    name: 'echo',
    description: 'Echoes input back',
    inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
  },
  handler: async (input) => input,
};

const failTool: InMemoryToolConfig = {
  definition: { name: 'fail', description: 'Always throws' },
  handler: async () => {
    throw new Error('tool execution failed');
  },
};

describe('MCP-02: Transport Adapter', () => {
  let adapter: InMemoryTransportAdapter;

  beforeEach(() => {
    adapter = new InMemoryTransportAdapter('test-server', [echoTool, failTool]);
  });

  // -----------------------------------------------------------------------
  // connection lifecycle
  // -----------------------------------------------------------------------

  describe('connection lifecycle', () => {
    it('connect resolves with ok result', async () => {
      const result = await adapter.connect();
      expect(result.ok).toBe(true);
    });

    it('close resolves with ok result', async () => {
      await adapter.connect();
      const result = await adapter.close();
      expect(result.ok).toBe(true);
    });

    it('reconnects after close', async () => {
      await adapter.connect();
      await adapter.close();
      const result = await adapter.connect();
      expect(result.ok).toBe(true);

      const call = await adapter.callTool('echo', { message: 'hi' });
      expect(call.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // tool calls
  // -----------------------------------------------------------------------

  describe('callTool', () => {
    it('returns content and durationMs for registered tool', async () => {
      await adapter.connect();
      const result = await adapter.callTool('echo', { message: 'hello' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual({ message: 'hello' });
        expect(result.value.isError).toBe(false);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns ToolNotFound for unregistered tool', async () => {
      await adapter.connect();
      const result = await adapter.callTool('nonexistent', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ToolNotFound');
        if (result.error._tag === 'ToolNotFound') {
          expect(result.error.tool).toBe('nonexistent');
          expect(result.error.server).toBe('test-server');
        }
      }
    });

    it('returns TransportClosed when not connected', async () => {
      const result = await adapter.callTool('echo', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TransportClosed');
      }
    });

    it('returns isError=true when handler throws', async () => {
      await adapter.connect();
      const result = await adapter.callTool('fail', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isError).toBe(true);
        expect(result.value.content).toBe('tool execution failed');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('passes input to handler', async () => {
      await adapter.connect();
      const input = { key: 'value', nested: { a: 1 } };
      const result = await adapter.callTool('echo', input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual(input);
      }
    });
  });

  // -----------------------------------------------------------------------
  // listTools
  // -----------------------------------------------------------------------

  describe('listTools', () => {
    it('returns registered tool definitions', async () => {
      await adapter.connect();
      const result = await adapter.listTools();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        const names = result.value.map((t) => t.name);
        expect(names).toContain('echo');
        expect(names).toContain('fail');
      }
    });

    it('returns TransportClosed when not connected', async () => {
      const result = await adapter.listTools();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TransportClosed');
      }
    });
  });

  // -----------------------------------------------------------------------
  // registerTool (test helper)
  // -----------------------------------------------------------------------

  describe('registerTool', () => {
    it('adds a tool after construction', async () => {
      adapter.registerTool(
        { name: 'greet', description: 'Says hello' },
        async (input) => `Hello, ${(input as Record<string, string>).name}!`,
      );
      await adapter.connect();

      const result = await adapter.callTool('greet', { name: 'World' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Hello, World!');
      }
    });
  });
});
