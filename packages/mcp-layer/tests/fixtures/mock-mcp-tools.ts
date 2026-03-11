/**
 * MCP-07: Mock MCP tool definitions for testing
 * @task MCP-07
 *
 * Deterministic test tools consumed by InMemoryTransportAdapter.
 * Used by MCP-07 tests directly and MCP-08 integration tests.
 */

import type { InMemoryToolConfig } from '../../src/transport/in-memory-adapter.js';

/** echoes input back unchanged */
export const echoTool: InMemoryToolConfig = {
  definition: {
    name: 'echo',
    description: 'Returns input as-is',
    inputSchema: { type: 'object' },
  },
  handler: async (input) => input,
};

/** delays response by configurable ms (default 100ms) */
export const slowTool: InMemoryToolConfig = {
  definition: {
    name: 'slow',
    description: 'Responds after configurable delay',
    inputSchema: {
      type: 'object',
      properties: { delayMs: { type: 'number' } },
    },
  },
  handler: async (input) => {
    const delay = (input as { delayMs?: number }).delayMs ?? 100;
    await new Promise((r) => setTimeout(r, delay));
    return { delayed: true, delayMs: delay };
  },
};

/** always throws with configurable message */
export const errorTool: InMemoryToolConfig = {
  definition: {
    name: 'error',
    description: 'Always fails with configurable error message',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
  },
  handler: async (input) => {
    throw new Error((input as { message?: string }).message ?? 'mock error');
  },
};

/** returns a response of configurable byte size (default 2MB) */
export const oversizedTool: InMemoryToolConfig = {
  definition: {
    name: 'oversized',
    description: 'Returns response exceeding typical size limits',
    inputSchema: {
      type: 'object',
      properties: { sizeBytes: { type: 'number' } },
    },
  },
  handler: async (input) => {
    const sizeBytes = (input as { sizeBytes?: number }).sizeBytes ?? 2_000_000;
    return { data: 'x'.repeat(sizeBytes) };
  },
};

/** all mock tools as an array — convenience for InMemoryTransportAdapter */
export const ALL_MOCK_TOOLS: InMemoryToolConfig[] = [
  echoTool,
  slowTool,
  errorTool,
  oversizedTool,
];
