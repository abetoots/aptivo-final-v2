/**
 * @testcase MCP-07-MS-001 through MCP-07-MS-008
 * @task MCP-07
 *
 * Tests the mock MCP server fixture tools via InMemoryTransportAdapter:
 * - echo, slow, error, oversized tools
 * - listTools returns all 4
 * - lifecycle (connect, close)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTransportAdapter } from '../src/transport/in-memory-adapter.js';
import { ALL_MOCK_TOOLS } from './fixtures/mock-mcp-tools.js';

describe('MCP-07: Mock MCP Server', () => {
  let adapter: InMemoryTransportAdapter;

  beforeEach(async () => {
    adapter = new InMemoryTransportAdapter('mock-server', ALL_MOCK_TOOLS);
    await adapter.connect();
  });

  it('listTools returns all 4 mock tools', async () => {
    const result = await adapter.listTools();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.map((t) => t.name).sort();
      expect(names).toEqual(['echo', 'error', 'oversized', 'slow']);
    }
  });

  describe('echo tool', () => {
    it('returns input as-is', async () => {
      const result = await adapter.callTool('echo', { key: 'value', num: 42 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual({ key: 'value', num: 42 });
        expect(result.value.isError).toBe(false);
      }
    });
  });

  describe('slow tool', () => {
    it('delays response by configurable ms', async () => {
      const start = performance.now();
      const result = await adapter.callTool('slow', { delayMs: 50 });
      const elapsed = performance.now() - start;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toEqual({ delayed: true, delayMs: 50 });
        expect(elapsed).toBeGreaterThanOrEqual(40); // some timing tolerance
      }
    });
  });

  describe('error tool', () => {
    it('returns isError=true with error message', async () => {
      const result = await adapter.callTool('error', { message: 'custom failure' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isError).toBe(true);
        expect(result.value.content).toBe('custom failure');
      }
    });

    it('uses default message when none provided', async () => {
      const result = await adapter.callTool('error', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isError).toBe(true);
        expect(result.value.content).toBe('mock error');
      }
    });
  });

  describe('oversized tool', () => {
    it('returns response of configurable size', async () => {
      const result = await adapter.callTool('oversized', { sizeBytes: 5000 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = (result.value.content as { data: string }).data;
        expect(data.length).toBe(5000);
      }
    });

    it('defaults to 2MB response', async () => {
      const result = await adapter.callTool('oversized', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = (result.value.content as { data: string }).data;
        expect(data.length).toBe(2_000_000);
      }
    });
  });
});
