/**
 * LLM-02: Budget Config Schema
 * @task LLM-02
 * @spec docs/04-specs/platform-core/llm-gateway.md §3.2
 */

import {
  boolean,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const llmBudgetConfigs = pgTable('llm_budget_configs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  domain: varchar('domain', { length: 50 }).notNull().unique(),
  // daily budget
  dailyLimitUsd: numeric('daily_limit_usd', { precision: 10, scale: 2 }).notNull(),
  dailyWarningThreshold: numeric('daily_warning_threshold', { precision: 3, scale: 2 }).default('0.90'),
  // monthly budget
  monthlyLimitUsd: numeric('monthly_limit_usd', { precision: 10, scale: 2 }).notNull(),
  monthlyWarningThreshold: numeric('monthly_warning_threshold', { precision: 3, scale: 2 }).default('0.90'),
  // behavior
  blockOnExceed: boolean('block_on_exceed').default(true),
  notifyOnWarning: boolean('notify_on_warning').default(true),
  // audit
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
