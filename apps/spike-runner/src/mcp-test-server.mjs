/**
 * Minimal MCP test server for SP-05 transport benchmarks.
 * Spawned as a child process for stdio transport testing.
 *
 * Usage: node apps/spike-runner/src/mcp-test-server.mjs
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';

const server = new McpServer({
  name: 'sp05-test-server',
  version: '1.0.0',
});

// simple echo tool — returns the input as-is
server.tool('echo', { message: z.string() }, async ({ message }) => ({
  content: [{ type: 'text', text: message }],
}));

// add tool — adds two numbers
server.tool('add', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: 'text', text: String(a + b) }],
}));

// slow tool — adds controllable latency for timeout testing
server.tool('slow', { delayMs: z.number() }, async ({ delayMs }) => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return { content: [{ type: 'text', text: 'done' }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
