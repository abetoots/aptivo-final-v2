/**
 * P1.5-04: MCP registry drizzle adapter tests
 * @task P1.5-04
 *
 * unit tests with mocked drizzle client for:
 * - createDrizzleMcpRegistryAdapter (getServer, getServerByName, getTool, getAllowlist)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleMcpRegistryAdapter } from '../src/adapters/mcp-registry-drizzle';

// ---------------------------------------------------------------------------
// mock drizzle builder helpers
// ---------------------------------------------------------------------------

function createMockQueryBuilder(resolvedValue: unknown = []) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};

  // terminal methods
  builder.returning = vi.fn().mockResolvedValue(resolvedValue);

  // chaining methods
  builder.values = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockResolvedValue(resolvedValue);
  builder.from = vi.fn().mockReturnValue(builder);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);

  return builder;
}

function createMockDb(overrides?: {
  selectResult?: unknown;
}) {
  const selectBuilder = createMockQueryBuilder(overrides?.selectResult ?? []);

  // select().from() returns builder with .where() as terminal
  const fromResult = {
    where: vi.fn().mockResolvedValue(overrides?.selectResult ?? []),
  };
  selectBuilder.from = vi.fn().mockReturnValue(fromResult);

  const db = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn().mockReturnValue(createMockQueryBuilder()),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(createMockQueryBuilder()),
    transaction: vi.fn(),
    // expose for assertions
    _selectBuilder: selectBuilder,
    _fromResult: fromResult,
  };

  return db;
}

// ---------------------------------------------------------------------------
// test data
// ---------------------------------------------------------------------------

const SERVER_ROW = {
  id: 'srv-uuid-001',
  name: 'test-server',
  transport: 'stdio',
  command: '/usr/bin/test-mcp',
  args: ['--mode', 'production'],
  envAllowlist: ['API_KEY', 'SECRET'],
  maxConcurrent: 5,
  isEnabled: true,
  healthCheckUrl: null,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
};

const DISABLED_SERVER_ROW = {
  ...SERVER_ROW,
  id: 'srv-uuid-002',
  name: 'disabled-server',
  isEnabled: false,
};

const TOOL_ROW = {
  id: 'tool-uuid-001',
  serverId: 'srv-uuid-001',
  name: 'analyze-code',
  description: 'analyzes code for issues',
  inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
  maxResponseBytes: 1_048_576,
  cacheTtlSeconds: 300,
  isEnabled: true,
  createdAt: new Date('2026-03-01'),
};

const DISABLED_TOOL_ROW = {
  ...TOOL_ROW,
  id: 'tool-uuid-002',
  name: 'disabled-tool',
  isEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// getServer
// ===========================================================================

describe('createDrizzleMcpRegistryAdapter', () => {
  describe('getServer', () => {
    it('returns McpServerRecord when found and enabled', async () => {
      const db = createMockDb({ selectResult: [SERVER_ROW] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getServer('srv-uuid-001');

      expect(result).toEqual({
        id: 'srv-uuid-001',
        name: 'test-server',
        transport: 'stdio',
        command: '/usr/bin/test-mcp',
        args: ['--mode', 'production'],
        envAllowlist: ['API_KEY', 'SECRET'],
        maxConcurrent: 5,
        isEnabled: true,
      });
    });

    it('returns null when server is disabled', async () => {
      // enabled filter in the query means disabled rows are excluded
      const db = createMockDb({ selectResult: [] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getServer('srv-uuid-002');

      expect(result).toBeNull();
    });

    it('returns null when server is not found', async () => {
      const db = createMockDb({ selectResult: [] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getServer('nonexistent-id');

      expect(result).toBeNull();
    });

    it('defaults null args to empty array', async () => {
      const rowWithNullArgs = { ...SERVER_ROW, args: null };
      const db = createMockDb({ selectResult: [rowWithNullArgs] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getServer('srv-uuid-001');

      expect(result!.args).toEqual([]);
    });

    it('defaults null envAllowlist to empty array', async () => {
      const rowWithNullEnv = { ...SERVER_ROW, envAllowlist: null };
      const db = createMockDb({ selectResult: [rowWithNullEnv] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getServer('srv-uuid-001');

      expect(result!.envAllowlist).toEqual([]);
    });
  });

  // =========================================================================
  // getServerByName
  // =========================================================================

  describe('getServerByName', () => {
    it('returns McpServerRecord when found by name', async () => {
      const db = createMockDb({ selectResult: [SERVER_ROW] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getServerByName('test-server');

      expect(result).toEqual({
        id: 'srv-uuid-001',
        name: 'test-server',
        transport: 'stdio',
        command: '/usr/bin/test-mcp',
        args: ['--mode', 'production'],
        envAllowlist: ['API_KEY', 'SECRET'],
        maxConcurrent: 5,
        isEnabled: true,
      });
    });

    it('returns null when name not found', async () => {
      const db = createMockDb({ selectResult: [] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getServerByName('nonexistent-server');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getTool
  // =========================================================================

  describe('getTool', () => {
    it('returns McpToolRecord when found and enabled', async () => {
      const db = createMockDb({ selectResult: [TOOL_ROW] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getTool('srv-uuid-001', 'analyze-code');

      expect(result).toEqual({
        id: 'tool-uuid-001',
        serverId: 'srv-uuid-001',
        name: 'analyze-code',
        description: 'analyzes code for issues',
        inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
        maxResponseBytes: 1_048_576,
        cacheTtlSeconds: 300,
        isEnabled: true,
      });
    });

    it('returns null when tool is disabled', async () => {
      // enabled filter in query excludes disabled tools
      const db = createMockDb({ selectResult: [] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getTool('srv-uuid-001', 'disabled-tool');

      expect(result).toBeNull();
    });

    it('returns null when tool is not found', async () => {
      const db = createMockDb({ selectResult: [] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getTool('srv-uuid-001', 'nonexistent-tool');

      expect(result).toBeNull();
    });

    it('maps null description to undefined', async () => {
      const rowWithNullDesc = { ...TOOL_ROW, description: null };
      const db = createMockDb({ selectResult: [rowWithNullDesc] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getTool('srv-uuid-001', 'analyze-code');

      expect(result!.description).toBeUndefined();
    });

    it('maps null inputSchema to undefined', async () => {
      const rowWithNullSchema = { ...TOOL_ROW, inputSchema: null };
      const db = createMockDb({ selectResult: [rowWithNullSchema] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getTool('srv-uuid-001', 'analyze-code');

      expect(result!.inputSchema).toBeUndefined();
    });

    it('maps null cacheTtlSeconds to null in output', async () => {
      const rowWithNullTtl = { ...TOOL_ROW, cacheTtlSeconds: null };
      const db = createMockDb({ selectResult: [rowWithNullTtl] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getTool('srv-uuid-001', 'analyze-code');

      expect(result!.cacheTtlSeconds).toBeNull();
    });
  });

  // =========================================================================
  // getAllowlist
  // =========================================================================

  describe('getAllowlist', () => {
    it('returns array of McpServerConfig for enabled servers', async () => {
      const rows = [
        SERVER_ROW,
        {
          ...SERVER_ROW,
          id: 'srv-uuid-003',
          name: 'second-server',
          command: '/usr/bin/second-mcp',
          args: [],
          envAllowlist: [],
          maxConcurrent: 2,
        },
      ];
      const db = createMockDb({ selectResult: rows });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getAllowlist();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'test-server',
        command: '/usr/bin/test-mcp',
        args: ['--mode', 'production'],
        allowedEnv: ['API_KEY', 'SECRET'],
        maxConcurrent: 5,
      });
      expect(result[1]).toEqual({
        name: 'second-server',
        command: '/usr/bin/second-mcp',
        args: [],
        allowedEnv: [],
        maxConcurrent: 2,
      });
    });

    it('returns empty array when no enabled servers exist', async () => {
      const db = createMockDb({ selectResult: [] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getAllowlist();

      expect(result).toEqual([]);
    });

    it('defaults null args and envAllowlist to empty arrays', async () => {
      const rowWithNulls = { ...SERVER_ROW, args: null, envAllowlist: null };
      const db = createMockDb({ selectResult: [rowWithNulls] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      const result = await adapter.getAllowlist();

      expect(result[0]!.args).toEqual([]);
      expect(result[0]!.allowedEnv).toEqual([]);
    });

    it('calls select on the db client', async () => {
      const db = createMockDb({ selectResult: [] });
      const adapter = createDrizzleMcpRegistryAdapter(db);

      await adapter.getAllowlist();

      expect(db.select).toHaveBeenCalledOnce();
    });
  });
});
