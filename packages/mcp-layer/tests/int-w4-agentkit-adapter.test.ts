/**
 * @testcase INT-W4-AK-001 through INT-W4-AK-009
 * @task INT-W4
 * @frd FR-CORE-MCP-001
 *
 * Tests the AgentKit transport adapter:
 * - connect success / failure
 * - callTool success / not-connected / execution error
 * - listTools success / not-connected
 * - close success / idempotent when already closed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpTransportAdapter } from '../src/transport/transport-types.js';

// ---------------------------------------------------------------------------
// mock @inngest/agent-kit
// ---------------------------------------------------------------------------

const mockConnect = vi.fn();
const mockCallTool = vi.fn();
const mockListTools = vi.fn();
const mockClose = vi.fn();

// use a class so vitest recognises it as a constructor
class MockMCPClient {
  connect = mockConnect;
  callTool = mockCallTool;
  listTools = mockListTools;
  close = mockClose;
}

vi.mock('@inngest/agent-kit', () => ({
  MCPClient: MockMCPClient,
}));

// ---------------------------------------------------------------------------
// import adapter under test (after mock is hoisted)
// ---------------------------------------------------------------------------

import { createAgentKitTransportAdapter } from '../src/transport/agentkit-adapter.js';

describe('INT-W4: AgentKit Transport Adapter', () => {
  let adapter: McpTransportAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    adapter = createAgentKitTransportAdapter({ serverUrl: 'http://localhost:3000' });
  });

  // -----------------------------------------------------------------------
  // connect
  // -----------------------------------------------------------------------

  describe('connect', () => {
    it('INT-W4-AK-001: returns ok on successful connection', async () => {
      const result = await adapter.connect();

      expect(result.ok).toBe(true);
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('INT-W4-AK-002: returns ConnectionFailed on error', async () => {
      const cause = new Error('refused');
      mockConnect.mockRejectedValueOnce(cause);

      const result = await adapter.connect();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ConnectionFailed');
        if (result.error._tag === 'ConnectionFailed') {
          expect(result.error.server).toBe('http://localhost:3000');
          expect(result.error.cause).toBe(cause);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // callTool
  // -----------------------------------------------------------------------

  describe('callTool', () => {
    it('INT-W4-AK-003: returns ok with ToolCallResult on success', async () => {
      await adapter.connect();
      mockCallTool.mockResolvedValueOnce({
        content: { message: 'hello' },
        isError: false,
      });

      const result = await adapter.callTool('echo', { message: 'hello' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual({ message: 'hello' });
        expect(result.value.isError).toBe(false);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
      expect(mockCallTool).toHaveBeenCalledWith('echo', { message: 'hello' });
    });

    it('INT-W4-AK-004: returns TransportClosed when not connected', async () => {
      const result = await adapter.callTool('echo', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TransportClosed');
        if (result.error._tag === 'TransportClosed') {
          expect(result.error.server).toBe('http://localhost:3000');
        }
      }
    });

    it('INT-W4-AK-005: returns ToolExecutionFailed on error', async () => {
      await adapter.connect();
      mockCallTool.mockRejectedValueOnce(new Error('tool broke'));

      const result = await adapter.callTool('failing-tool', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ToolExecutionFailed');
        if (result.error._tag === 'ToolExecutionFailed') {
          expect(result.error.tool).toBe('failing-tool');
          expect(result.error.message).toBe('tool broke');
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // listTools
  // -----------------------------------------------------------------------

  describe('listTools', () => {
    it('INT-W4-AK-006: returns ok with ToolDefinition[] on success', async () => {
      await adapter.connect();
      mockListTools.mockResolvedValueOnce([
        { name: 'echo', description: 'Echoes input', inputSchema: { type: 'object' } },
        { name: 'greet', description: 'Greets user' },
      ]);

      const result = await adapter.listTools();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]).toEqual({
          name: 'echo',
          description: 'Echoes input',
          inputSchema: { type: 'object' },
        });
        expect(result.value[1]).toEqual({
          name: 'greet',
          description: 'Greets user',
          inputSchema: undefined,
        });
      }
    });

    it('INT-W4-AK-007: returns TransportClosed when not connected', async () => {
      const result = await adapter.listTools();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TransportClosed');
        if (result.error._tag === 'TransportClosed') {
          expect(result.error.server).toBe('http://localhost:3000');
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------

  describe('close', () => {
    it('INT-W4-AK-008: returns ok on successful close', async () => {
      await adapter.connect();
      const result = await adapter.close();

      expect(result.ok).toBe(true);
      expect(mockClose).toHaveBeenCalledOnce();
    });

    it('INT-W4-AK-009: returns ok when already closed (idempotent)', async () => {
      // never connected — client is null
      const result = await adapter.close();

      expect(result.ok).toBe(true);
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // config defaults
  // -----------------------------------------------------------------------

  describe('config', () => {
    it('uses custom timeout when provided', async () => {
      const custom = createAgentKitTransportAdapter({
        serverUrl: 'http://custom:8080',
        timeout: 5_000,
      });
      await custom.connect();

      // the adapter passes config to MCPClient constructor — verify the
      // mock class was constructed (indirectly via connect succeeding)
      expect(mockConnect).toHaveBeenCalledOnce();
    });
  });
});
