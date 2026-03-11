/**
 * MCP-02: In-Memory Transport Adapter (for tests)
 * @task MCP-02
 *
 * Map-based adapter that simulates MCP tool execution without
 * external processes. Tools are registered as simple async handlers.
 */

import { Result } from '@aptivo/types';
import type {
  McpTransportAdapter,
  McpTransportError,
  ToolCallResult,
  ToolDefinition,
} from './transport-types.js';

// ---------------------------------------------------------------------------
// tool handler types
// ---------------------------------------------------------------------------

export type InMemoryToolHandler = (
  input: Record<string, unknown>,
) => Promise<unknown>;

export interface InMemoryToolConfig {
  definition: ToolDefinition;
  handler: InMemoryToolHandler;
}

// ---------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------

export class InMemoryTransportAdapter implements McpTransportAdapter {
  private readonly tools = new Map<string, InMemoryToolConfig>();
  private connected = false;
  private readonly serverName: string;

  constructor(serverName: string, tools?: InMemoryToolConfig[]) {
    this.serverName = serverName;
    if (tools) {
      for (const tool of tools) {
        this.tools.set(tool.definition.name, tool);
      }
    }
  }

  /** register a tool after construction (test convenience) */
  registerTool(definition: ToolDefinition, handler: InMemoryToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  async connect(): Promise<Result<void, McpTransportError>> {
    this.connected = true;
    return Result.ok(undefined);
  }

  async callTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<Result<ToolCallResult, McpTransportError>> {
    if (!this.connected) {
      return Result.err({ _tag: 'TransportClosed' as const, server: this.serverName });
    }

    const tool = this.tools.get(name);
    if (!tool) {
      return Result.err({
        _tag: 'ToolNotFound' as const,
        tool: name,
        server: this.serverName,
      });
    }

    const start = performance.now();
    try {
      const content = await tool.handler(input);
      const durationMs = performance.now() - start;
      return Result.ok({ content, isError: false, durationMs });
    } catch (err) {
      const durationMs = performance.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      return Result.ok({ content: message, isError: true, durationMs });
    }
  }

  async listTools(): Promise<Result<ToolDefinition[], McpTransportError>> {
    if (!this.connected) {
      return Result.err({ _tag: 'TransportClosed' as const, server: this.serverName });
    }
    const defs = Array.from(this.tools.values()).map((t) => t.definition);
    return Result.ok(defs);
  }

  async close(): Promise<Result<void, McpTransportError>> {
    this.connected = false;
    return Result.ok(undefined);
  }
}
