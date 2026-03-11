/**
 * MCP-02: Transport adapter interfaces
 * @task MCP-02
 * @frd FR-CORE-MCP-001
 */

import type { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type McpTransportError =
  | { _tag: 'ConnectionFailed'; server: string; cause: unknown }
  | { _tag: 'ToolNotFound'; tool: string; server: string }
  | { _tag: 'ToolExecutionFailed'; tool: string; message: string }
  | { _tag: 'TransportClosed'; server: string }
  | { _tag: 'ServerNotAllowed'; server: string }
  | { _tag: 'LifecycleError'; operation: string; cause: unknown };

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export interface ToolCallResult {
  content: unknown;
  isError: boolean;
  durationMs: number;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// adapter interface
// ---------------------------------------------------------------------------

export interface McpTransportAdapter {
  connect(): Promise<Result<void, McpTransportError>>;
  callTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<Result<ToolCallResult, McpTransportError>>;
  listTools(): Promise<Result<ToolDefinition[], McpTransportError>>;
  close(): Promise<Result<void, McpTransportError>>;
}
