/**
 * MCP-01: Tool Registry Schema
 * @task MCP-01
 * @frd FR-CORE-MCP-001
 * @spec docs/06-sprints/sprint-3-plan.md
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const mcpServers = pgTable(
  'mcp_servers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 100 }).notNull().unique(),
    transport: varchar('transport', { length: 10 }).notNull(), // 'stdio' | 'http'
    command: varchar('command', { length: 500 }).notNull(),
    args: jsonb('args').$type<string[]>().default([]),
    envAllowlist: text('env_allowlist').array().default([]),
    maxConcurrent: integer('max_concurrent').notNull().default(3),
    isEnabled: boolean('is_enabled').notNull().default(true),
    healthCheckUrl: varchar('health_check_url', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('mcp_servers_name_idx').on(table.name),
  ],
);

export const mcpTools = pgTable(
  'mcp_tools',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    serverId: uuid('server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    inputSchema: jsonb('input_schema'),
    maxResponseBytes: integer('max_response_bytes')
      .notNull()
      .default(1_048_576), // 1MB default
    cacheTtlSeconds: integer('cache_ttl_seconds'), // null = no caching
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('mcp_tools_server_tool_idx').on(table.serverId, table.name),
  ],
);
