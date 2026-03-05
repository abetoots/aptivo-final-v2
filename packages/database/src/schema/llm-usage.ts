/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import {
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const llmUsageLogs = pgTable(
  'llm_usage_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workflowId: varchar('workflow_id', { length: 255 }),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    costUsd: numeric('cost_usd', { precision: 18, scale: 4 }).notNull(),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('llm_usage_logs_workflow_id_idx').on(table.workflowId),
    index('llm_usage_logs_created_at_idx').on(table.createdAt),
  ]
);
