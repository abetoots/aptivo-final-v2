/**
 * MCP-06: Wrapper module barrel export
 */

export { createMcpWrapper } from './mcp-wrapper.js';

export type {
  McpWrapper,
  McpWrapperDeps,
  McpWrapperLogger,
  McpError,
  ToolRegistry,
  McpServerRecord,
  McpToolRecord,
} from './mcp-wrapper-types.js';
