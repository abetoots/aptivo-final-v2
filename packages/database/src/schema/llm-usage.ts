/**
 * FW-02 / LLM-01: LLM Usage Logs Schema
 * @task LLM-01
 * @spec docs/04-specs/platform-core/llm-gateway.md §3.1
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { departments } from './departments.js';

export const llmUsageLogs = pgTable(
  'llm_usage_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // workflow context
    workflowId: uuid('workflow_id'),
    workflowStepId: varchar('workflow_step_id', { length: 100 }),
    domain: varchar('domain', { length: 50 }).notNull(),
    // provider details
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    // token counts
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    // cost (USD) — precision 10, scale 6 per TSD
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
    // request metadata
    requestType: varchar('request_type', { length: 50 }),
    latencyMs: integer('latency_ms'),
    // fallback tracking
    wasFallback: boolean('was_fallback').default(false),
    primaryProvider: varchar('primary_provider', { length: 50 }),
    // timing
    timestamp: timestamp('timestamp', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // FA3-01: nullable department attribution. The stamping middleware
    // that populates this is an S17 task — S16 ships the column so the
    // department-spend reporting can be wired without a breaking
    // migration later. Pre-commit review (Codex §1) caught the missing
    // FK: without it, a bad writer could stamp orphan department IDs
    // that still count in aggregates. The FK blocks that.
    departmentId: uuid('department_id').references(() => departments.id),
  },
  (table) => [
    index('llm_usage_logs_workflow_id_idx').on(table.workflowId),
    index('llm_usage_logs_domain_idx').on(table.domain),
    index('llm_usage_logs_timestamp_idx').on(table.timestamp),
    index('llm_usage_logs_provider_idx').on(table.provider),
    index('llm_usage_logs_department_id_idx').on(table.departmentId),
  ]
);
