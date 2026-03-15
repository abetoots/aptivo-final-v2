/**
 * P1.5-04: MCP registry drizzle adapter
 * @task P1.5-04
 *
 * replaces the hardcoded null registry and empty allowlist in the
 * composition root with real database-backed lookups against
 * mcpServers and mcpTools tables.
 */

import { eq, and } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { mcpServers } from '../schema/mcp-registry.js';
import { mcpTools } from '../schema/mcp-registry.js';

// ---------------------------------------------------------------------------
// record types (aligned with @aptivo/mcp-layer ToolRegistry interface)
// ---------------------------------------------------------------------------

export interface McpServerRecord {
  id: string;
  name: string;
  transport: string;
  command: string;
  args: string[];
  envAllowlist: string[];
  maxConcurrent: number;
  isEnabled: boolean;
}

export interface McpToolRecord {
  id: string;
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  maxResponseBytes: number;
  cacheTtlSeconds: number | null;
  isEnabled: boolean;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  allowedEnv?: string[];
  maxConcurrent?: number;
}

// ---------------------------------------------------------------------------
// adapter interface
// ---------------------------------------------------------------------------

export interface McpRegistryAdapter {
  getServer(serverId: string): Promise<McpServerRecord | null>;
  getServerByName(name: string): Promise<McpServerRecord | null>;
  getTool(serverId: string, toolName: string): Promise<McpToolRecord | null>;
  getAllowlist(): Promise<McpServerConfig[]>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDrizzleMcpRegistryAdapter(db: DrizzleClient): McpRegistryAdapter {
  // map a db row from mcpServers to McpServerRecord
  function mapServerRow(r: typeof mcpServers.$inferSelect): McpServerRecord {
    return {
      id: r.id,
      name: r.name,
      transport: r.transport,
      command: r.command,
      args: r.args ?? [],
      envAllowlist: r.envAllowlist ?? [],
      maxConcurrent: r.maxConcurrent,
      isEnabled: r.isEnabled,
    };
  }

  // map a db row from mcpTools to McpToolRecord
  function mapToolRow(r: typeof mcpTools.$inferSelect): McpToolRecord {
    return {
      id: r.id,
      serverId: r.serverId,
      name: r.name,
      description: r.description ?? undefined,
      inputSchema: (r.inputSchema as Record<string, unknown>) ?? undefined,
      maxResponseBytes: r.maxResponseBytes,
      cacheTtlSeconds: r.cacheTtlSeconds,
      isEnabled: r.isEnabled,
    };
  }

  return {
    async getServer(serverId) {
      const rows = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, serverId), eq(mcpServers.isEnabled, true)));

      const row = rows[0];
      return row ? mapServerRow(row) : null;
    },

    async getServerByName(name) {
      const rows = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.name, name), eq(mcpServers.isEnabled, true)));

      const row = rows[0];
      return row ? mapServerRow(row) : null;
    },

    async getTool(serverId, toolName) {
      const rows = await db
        .select()
        .from(mcpTools)
        .where(
          and(
            eq(mcpTools.serverId, serverId),
            eq(mcpTools.name, toolName),
            eq(mcpTools.isEnabled, true),
          ),
        );

      const row = rows[0];
      return row ? mapToolRow(row) : null;
    },

    async getAllowlist() {
      const rows = await db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.isEnabled, true));

      return rows.map((r: typeof mcpServers.$inferSelect): McpServerConfig => ({
        name: r.name,
        command: r.command,
        args: r.args ?? [],
        allowedEnv: r.envAllowlist ?? [],
        maxConcurrent: r.maxConcurrent,
      }));
    },
  };
}
