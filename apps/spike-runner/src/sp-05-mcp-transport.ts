/**
 * SP-05: MCP Transport Performance Spike
 * @spike SP-05
 * @brd BO-CORE-005, BRD §6.6 (Build: MCP Integration)
 * @frd FR-CORE-MCP-001 through FR-CORE-MCP-005
 * @add ADD §5 (MCP Layer), §5.1 (Transport)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-05
 *
 * Benchmarks three MCP transport modes:
 *   1. stdio  — spawn child process, communicate via stdin/stdout
 *   2. in-process (bundled local) — InMemoryTransport, no process overhead
 *   3. HTTP (StreamableHttp) — HTTP-based transport to separate service
 *
 * Measures: cold start, warm start, concurrency (3+), memory stability (100+ calls).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod/v3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

export const SP_05_CONFIG = {
  name: 'SP-05: MCP Transport',
  risk: 'CRITICAL' as const,
  validations: [
    'stdio transport connection establishment',
    'Server lifecycle management (start/stop)',
    'Tool discovery and capability listing',
    'Tool invocation and response parsing',
    'Error handling for server crashes',
    'Connection timeout behavior',
  ],
  thresholds: {
    stdio: { coldMs: 2_000, warmMs: 200 },
    inProcess: { coldMs: 500, warmMs: 100 },
    http: { coldMs: 100, warmMs: 50 },
    memoryDriftPct: 50, // max % increase over 100 calls
  },
} as const;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_SCRIPT = resolve(__dirname, 'mcp-test-server.mjs');

export interface BenchmarkResult {
  mode: 'stdio' | 'in-process' | 'http';
  coldStartMs: number;
  warmStartMs: number;
  concurrentMs: number;
  memoryBaselineKb: number;
  memoryAfter100Kb: number;
  memoryDriftPct: number;
}

/** high-resolution timer returning ms */
function hrtMs(): number {
  const [s, ns] = process.hrtime();
  return s * 1_000 + ns / 1_000_000;
}

function memKb(): number {
  return process.memoryUsage().heapUsed / 1_024;
}

// ---------------------------------------------------------------------------
// in-process server factory (for in-process & http benchmarks)
// ---------------------------------------------------------------------------

/** creates an McpServer wired with echo/add/slow tools — identical to mcp-test-server.mjs */
export function createTestServer(): McpServer {
  const server = new McpServer({
    name: 'sp05-test-server',
    version: '1.0.0',
  });

  server.tool('echo', { message: z.string() }, async ({ message }) => ({
    content: [{ type: 'text', text: message }],
  }));

  server.tool('add', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
  }));

  server.tool('slow', { delayMs: z.number() }, async ({ delayMs }) => {
    await new Promise((r) => setTimeout(r, delayMs));
    return { content: [{ type: 'text', text: 'done' }] };
  });

  return server;
}

// ---------------------------------------------------------------------------
// stdio transport helpers
// ---------------------------------------------------------------------------

export function createStdioClient(): { client: Client; transport: StdioClientTransport } {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_SCRIPT],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'sp05-stdio-client', version: '1.0.0' });
  return { client, transport };
}

// ---------------------------------------------------------------------------
// in-process transport helpers
// ---------------------------------------------------------------------------

export async function createInProcessPair(): Promise<{
  client: Client;
  server: McpServer;
  closeAll: () => Promise<void>;
}> {
  const server = createTestServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'sp05-inmemory-client', version: '1.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    server,
    closeAll: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ---------------------------------------------------------------------------
// benchmark runners
// ---------------------------------------------------------------------------

/** calls echo tool once and returns round-trip ms */
async function callEcho(client: Client, msg = 'ping'): Promise<number> {
  const t0 = hrtMs();
  await client.callTool({ name: 'echo', arguments: { message: msg } });
  return hrtMs() - t0;
}

export async function benchmarkStdio(): Promise<BenchmarkResult> {
  // cold start — spawn + connect + first tool call
  const coldT0 = hrtMs();
  const { client, transport } = createStdioClient();
  await client.connect(transport);
  await client.callTool({ name: 'echo', arguments: { message: 'cold' } });
  const coldStartMs = hrtMs() - coldT0;

  // warm start — average of 10 calls on existing connection
  const warmTimes: number[] = [];
  for (let i = 0; i < 10; i++) {
    warmTimes.push(await callEcho(client, `warm-${i}`));
  }
  const warmStartMs = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  // concurrent — 3 parallel calls
  const concT0 = hrtMs();
  await Promise.all([
    client.callTool({ name: 'echo', arguments: { message: 'c1' } }),
    client.callTool({ name: 'echo', arguments: { message: 'c2' } }),
    client.callTool({ name: 'echo', arguments: { message: 'c3' } }),
  ]);
  const concurrentMs = hrtMs() - concT0;

  // memory stability over 100 sequential calls
  global.gc?.();
  const memBaseline = memKb();
  for (let i = 0; i < 100; i++) {
    await client.callTool({ name: 'echo', arguments: { message: `mem-${i}` } });
  }
  global.gc?.();
  const memAfter = memKb();
  const memoryDriftPct = ((memAfter - memBaseline) / memBaseline) * 100;

  await client.close();

  return {
    mode: 'stdio',
    coldStartMs,
    warmStartMs,
    concurrentMs,
    memoryBaselineKb: memBaseline,
    memoryAfter100Kb: memAfter,
    memoryDriftPct,
  };
}

export async function benchmarkInProcess(): Promise<BenchmarkResult> {
  // cold start — create server + transport + first call
  const coldT0 = hrtMs();
  const { client, closeAll } = await createInProcessPair();
  await client.callTool({ name: 'echo', arguments: { message: 'cold' } });
  const coldStartMs = hrtMs() - coldT0;

  // warm start
  const warmTimes: number[] = [];
  for (let i = 0; i < 10; i++) {
    warmTimes.push(await callEcho(client, `warm-${i}`));
  }
  const warmStartMs = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  // concurrent
  const concT0 = hrtMs();
  await Promise.all([
    client.callTool({ name: 'echo', arguments: { message: 'c1' } }),
    client.callTool({ name: 'echo', arguments: { message: 'c2' } }),
    client.callTool({ name: 'echo', arguments: { message: 'c3' } }),
  ]);
  const concurrentMs = hrtMs() - concT0;

  // memory over 100 calls
  global.gc?.();
  const memBaseline = memKb();
  for (let i = 0; i < 100; i++) {
    await client.callTool({ name: 'echo', arguments: { message: `mem-${i}` } });
  }
  global.gc?.();
  const memAfter = memKb();
  const memoryDriftPct = ((memAfter - memBaseline) / memBaseline) * 100;

  await closeAll();

  return {
    mode: 'in-process',
    coldStartMs,
    warmStartMs,
    concurrentMs,
    memoryBaselineKb: memBaseline,
    memoryAfter100Kb: memAfter,
    memoryDriftPct,
  };
}

/**
 * HTTP/SSE transport benchmark.
 *
 * The MCP SDK's StreamableHttpClientTransport requires a real HTTP server.
 * For the spike we simulate this by standing up a local HTTP server in-process
 * and connecting the client to it. This validates the transport layer overhead
 * without needing a separate deployed service.
 */
export async function benchmarkHttp(): Promise<BenchmarkResult> {
  // import http lazily to avoid top-level side effects in non-http tests
  const { createServer } = await import('node:http');
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );

  const server = createTestServer();

  // map of session-id → transport (simple single-session for spike)
  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();

  const httpServer = createServer(async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // new session
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
    await server.connect(transport);
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await transport.handleRequest(req, res);
    if (transport.sessionId) sessions.set(transport.sessionId, transport);
  });

  // start server on random port
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address()!;
  const port = typeof addr === 'string' ? 0 : addr.port;
  const baseUrl = new URL(`http://127.0.0.1:${port}/mcp`);

  // cold start
  const coldT0 = hrtMs();
  const clientTransport = new StreamableHTTPClientTransport(baseUrl);
  const client = new Client({ name: 'sp05-http-client', version: '1.0.0' });
  await client.connect(clientTransport);
  await client.callTool({ name: 'echo', arguments: { message: 'cold' } });
  const coldStartMs = hrtMs() - coldT0;

  // warm start
  const warmTimes: number[] = [];
  for (let i = 0; i < 10; i++) {
    warmTimes.push(await callEcho(client, `warm-${i}`));
  }
  const warmStartMs = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;

  // concurrent
  const concT0 = hrtMs();
  await Promise.all([
    client.callTool({ name: 'echo', arguments: { message: 'c1' } }),
    client.callTool({ name: 'echo', arguments: { message: 'c2' } }),
    client.callTool({ name: 'echo', arguments: { message: 'c3' } }),
  ]);
  const concurrentMs = hrtMs() - concT0;

  // memory
  global.gc?.();
  const memBaseline = memKb();
  for (let i = 0; i < 100; i++) {
    await client.callTool({ name: 'echo', arguments: { message: `mem-${i}` } });
  }
  global.gc?.();
  const memAfter = memKb();
  const memoryDriftPct = ((memAfter - memBaseline) / memBaseline) * 100;

  await client.close();
  for (const t of sessions.values()) await t.close();
  await server.close();
  httpServer.close();

  return {
    mode: 'http',
    coldStartMs,
    warmStartMs,
    concurrentMs,
    memoryBaselineKb: memBaseline,
    memoryAfter100Kb: memAfter,
    memoryDriftPct,
  };
}
