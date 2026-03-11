/**
 * INT-W4: AgentKit Transport Adapter
 * @task INT-W4
 * @frd FR-CORE-MCP-001
 * @warning S7-W27 — traceparent injected as _metadata on tool call input (INT-08)
 *
 * Wraps @inngest/agent-kit MCPClient as an McpTransportAdapter.
 * Uses dynamic import so the adapter gracefully fails if
 * @inngest/agent-kit is not installed at runtime.
 */

import { Result } from '@aptivo/types';
import type {
  McpTransportAdapter,
  McpTransportError,
  ToolCallResult,
  ToolDefinition,
} from './transport-types.js';

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

export interface AgentKitAdapterConfig {
  serverUrl: string;
  timeout?: number; // ms, default 30_000
}

// ---------------------------------------------------------------------------
// adapter factory
// ---------------------------------------------------------------------------

export function createAgentKitTransportAdapter(
  config: AgentKitAdapterConfig,
): McpTransportAdapter {
  const { serverUrl, timeout = 30_000 } = config;

  // mutable client state
  let client: any = null;
  let connected = false;

  return {
    async connect(): Promise<Result<void, McpTransportError>> {
      try {
        // dynamic import to allow graceful failure if not installed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { MCPClient } = await import('@inngest/agent-kit') as any;
        client = new MCPClient({ url: serverUrl, timeout });
        await client.connect();
        connected = true;
        return Result.ok(undefined);
      } catch (err) {
        return Result.err({
          _tag: 'ConnectionFailed' as const,
          server: serverUrl,
          cause: err,
        });
      }
    },

    async callTool(
      name: string,
      input: Record<string, unknown>,
    ): Promise<Result<ToolCallResult, McpTransportError>> {
      if (!connected || !client) {
        return Result.err({ _tag: 'TransportClosed' as const, server: serverUrl });
      }

      try {
        const start = performance.now();

        // INT-08 (S7-W27): extract traceparent and inject as _metadata for mcp tool context
        const { _metadata: existingMeta, ...restInput } = input;
        const traceparent = (existingMeta as Record<string, unknown>)?.traceparent
          ?? input.traceparent;
        const callInput = traceparent
          ? { ...restInput, _metadata: { ...(existingMeta as Record<string, unknown> ?? {}), traceparent } }
          : input;

        const result = await client.callTool(name, callInput);
        const durationMs = performance.now() - start;

        return Result.ok({
          content: result.content ?? result,
          isError: result.isError ?? false,
          durationMs,
        });
      } catch (err) {
        return Result.err({
          _tag: 'ToolExecutionFailed' as const,
          tool: name,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },

    async listTools(): Promise<Result<ToolDefinition[], McpTransportError>> {
      if (!connected || !client) {
        return Result.err({ _tag: 'TransportClosed' as const, server: serverUrl });
      }

      try {
        const tools = await client.listTools();
        return Result.ok(
          (tools ?? []).map((t: any) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        );
      } catch (err) {
        return Result.err({
          _tag: 'LifecycleError' as const,
          operation: 'listTools',
          cause: err,
        });
      }
    },

    async close(): Promise<Result<void, McpTransportError>> {
      if (!client) {
        return Result.ok(undefined);
      }

      try {
        await client.close?.();
        connected = false;
        client = null;
        return Result.ok(undefined);
      } catch (err) {
        return Result.err({
          _tag: 'LifecycleError' as const,
          operation: 'close',
          cause: err,
        });
      }
    },
  };
}
