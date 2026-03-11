/**
 * @testcase SP-05-COMP-001 through SP-05-COMP-006
 * @requirements FR-CORE-MCP-001 through FR-CORE-MCP-005
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-05
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  SP_05_CONFIG,
  createStdioClient,
  createInProcessPair,
  createTestServer,
  benchmarkStdio,
  benchmarkInProcess,
  benchmarkHttp,
} from '../src/sp-05-mcp-transport.js';
import type { BenchmarkResult } from '../src/sp-05-mcp-transport.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('SP-05: MCP Transport', () => {
  it('has correct spike configuration', () => {
    expect(SP_05_CONFIG.name).toBe('SP-05: MCP Transport');
    expect(SP_05_CONFIG.risk).toBe('CRITICAL');
    expect(SP_05_CONFIG.validations).toHaveLength(6);
  });

  // -----------------------------------------------------------------------
  // 1. stdio transport connection establishment
  // -----------------------------------------------------------------------
  describe('stdio transport', () => {
    it('establishes connection and discovers tools', async () => {
      const { client, transport } = createStdioClient();
      await client.connect(transport);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['add', 'echo', 'slow']);

      await client.close();
    });

    it('invokes tool and parses response', async () => {
      const { client, transport } = createStdioClient();
      await client.connect(transport);

      const result = await client.callTool({
        name: 'echo',
        arguments: { message: 'hello from stdio' },
      });

      expect(result.content).toEqual([
        { type: 'text', text: 'hello from stdio' },
      ]);

      await client.close();
    });

    it('handles concurrent tool calls', async () => {
      const { client, transport } = createStdioClient();
      await client.connect(transport);

      const results = await Promise.all([
        client.callTool({ name: 'add', arguments: { a: 1, b: 2 } }),
        client.callTool({ name: 'add', arguments: { a: 3, b: 4 } }),
        client.callTool({ name: 'echo', arguments: { message: 'concurrent' } }),
      ]);

      expect(results[0].content).toEqual([{ type: 'text', text: '3' }]);
      expect(results[1].content).toEqual([{ type: 'text', text: '7' }]);
      expect(results[2].content).toEqual([{ type: 'text', text: 'concurrent' }]);

      await client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 2. server lifecycle management (start/stop)
  // -----------------------------------------------------------------------
  describe('server lifecycle', () => {
    it('starts and stops cleanly via stdio', async () => {
      const { client, transport } = createStdioClient();
      await client.connect(transport);

      // verify alive
      const result = await client.callTool({
        name: 'echo',
        arguments: { message: 'alive' },
      });
      expect(result.content).toEqual([{ type: 'text', text: 'alive' }]);

      // close should not throw
      await client.close();
    });

    it('starts and stops cleanly via in-process', async () => {
      const { client, closeAll } = await createInProcessPair();

      const result = await client.callTool({
        name: 'echo',
        arguments: { message: 'alive' },
      });
      expect(result.content).toEqual([{ type: 'text', text: 'alive' }]);

      await closeAll();
    });
  });

  // -----------------------------------------------------------------------
  // 3. tool discovery and capability listing
  // -----------------------------------------------------------------------
  describe('tool discovery', () => {
    it('lists all tools with correct schemas', async () => {
      const { client, closeAll } = await createInProcessPair();

      const { tools } = await client.listTools();
      expect(tools).toHaveLength(3);

      const echo = tools.find((t) => t.name === 'echo');
      expect(echo).toBeDefined();
      expect(echo!.inputSchema).toBeDefined();

      const add = tools.find((t) => t.name === 'add');
      expect(add).toBeDefined();

      const slow = tools.find((t) => t.name === 'slow');
      expect(slow).toBeDefined();

      await closeAll();
    });
  });

  // -----------------------------------------------------------------------
  // 4. tool invocation and response parsing
  // -----------------------------------------------------------------------
  describe('tool invocation', () => {
    it('parses echo response correctly', async () => {
      const { client, closeAll } = await createInProcessPair();

      const result = await client.callTool({
        name: 'echo',
        arguments: { message: 'test-msg' },
      });

      expect(result.content).toEqual([{ type: 'text', text: 'test-msg' }]);
      await closeAll();
    });

    it('parses add response correctly', async () => {
      const { client, closeAll } = await createInProcessPair();

      const result = await client.callTool({
        name: 'add',
        arguments: { a: 42, b: 58 },
      });

      expect(result.content).toEqual([{ type: 'text', text: '100' }]);
      await closeAll();
    });
  });

  // -----------------------------------------------------------------------
  // 5. error handling for server crashes
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('reports error for unknown tool', async () => {
      const { client, closeAll } = await createInProcessPair();

      // mcp sdk returns { isError: true } for unknown tools instead of throwing
      const result = await client.callTool({ name: 'nonexistent', arguments: {} });
      expect(result.isError).toBe(true);

      await closeAll();
    });

    it('handles server close gracefully', async () => {
      const server = createTestServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'crash-test', version: '1.0.0' });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      // verify working
      const result = await client.callTool({
        name: 'echo',
        arguments: { message: 'before-close' },
      });
      expect(result.content).toEqual([{ type: 'text', text: 'before-close' }]);

      // close server-side transport (simulates crash)
      await server.close();

      // client call should fail
      await expect(
        client.callTool({ name: 'echo', arguments: { message: 'after-close' } }),
      ).rejects.toThrow();

      await client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 6. connection timeout behavior
  // -----------------------------------------------------------------------
  describe('timeout behavior', () => {
    it('completes slow tool within timeout', async () => {
      const { client, closeAll } = await createInProcessPair();

      const result = await client.callTool({
        name: 'slow',
        arguments: { delayMs: 50 },
      });

      expect(result.content).toEqual([{ type: 'text', text: 'done' }]);
      await closeAll();
    });

    it('can abort long-running tool via AbortSignal', async () => {
      const { client, closeAll } = await createInProcessPair();
      const controller = new AbortController();

      // start a slow call and abort it quickly
      const promise = client.callTool(
        { name: 'slow', arguments: { delayMs: 10_000 } },
        undefined,
        { signal: controller.signal },
      );

      // abort after 50ms
      setTimeout(() => controller.abort(), 50);

      await expect(promise).rejects.toThrow();
      await closeAll();
    });
  });

  // -----------------------------------------------------------------------
  // benchmarks — run all three modes and validate thresholds
  // -----------------------------------------------------------------------
  describe('transport benchmarks', () => {
    const results: BenchmarkResult[] = [];

    it('benchmarks in-process (bundled local) transport', async () => {
      const r = await benchmarkInProcess();
      results.push(r);

      expect(r.coldStartMs).toBeLessThan(SP_05_CONFIG.thresholds.inProcess.coldMs);
      expect(r.warmStartMs).toBeLessThan(SP_05_CONFIG.thresholds.inProcess.warmMs);
    }, 30_000);

    it('benchmarks stdio transport', async () => {
      const r = await benchmarkStdio();
      results.push(r);

      expect(r.coldStartMs).toBeLessThan(SP_05_CONFIG.thresholds.stdio.coldMs);
      expect(r.warmStartMs).toBeLessThan(SP_05_CONFIG.thresholds.stdio.warmMs);
    }, 60_000);

    it('benchmarks HTTP (StreamableHttp) transport', async () => {
      const r = await benchmarkHttp();
      results.push(r);

      expect(r.coldStartMs).toBeLessThan(SP_05_CONFIG.thresholds.http.coldMs);
      expect(r.warmStartMs).toBeLessThan(SP_05_CONFIG.thresholds.http.warmMs);
    }, 30_000);

    afterAll(() => {
      if (results.length === 0) return;

      // print decision matrix
      console.log('\n=== SP-05 Transport Benchmark Results ===\n');
      console.log(
        '| Mode        | Cold Start | Warm Start | 3x Concurrent | Mem Drift |',
      );
      console.log(
        '|-------------|------------|------------|---------------|-----------|',
      );
      for (const r of results) {
        console.log(
          `| ${r.mode.padEnd(11)} | ${r.coldStartMs.toFixed(1).padStart(7)}ms | ${r.warmStartMs.toFixed(1).padStart(7)}ms | ${r.concurrentMs.toFixed(1).padStart(10)}ms | ${r.memoryDriftPct.toFixed(1).padStart(6)}% |`,
        );
      }
      console.log('');
    });
  });
});
