/**
 * FA3-01: Department budget configuration schema.
 *
 * One config per department (uniqueness via FK + index). The shape
 * mirrors `llm_budget_configs` so operators see a familiar set of knobs
 * (monthly limit + warning threshold + block-on-exceed), but the
 * semantics are org-scoped rather than system-scoped.
 *
 * Notifications (`notifyOnWarning`) are plumbed here but the actual
 * alerting pipeline (FA3-02 in the original plan) was deferred to S17
 * per the Path A revision — this column exists so that wiring lands
 * later without a schema migration.
 */

import { boolean, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { departments } from './departments.js';

export const departmentBudgetConfigs = pgTable('department_budget_configs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  departmentId: uuid('department_id')
    .references(() => departments.id)
    .notNull()
    .unique(),
  monthlyLimitUsd: numeric('monthly_limit_usd', { precision: 10, scale: 2 }).notNull(),
  warningThreshold: numeric('warning_threshold', { precision: 3, scale: 2 }).default('0.90').notNull(),
  blockOnExceed: boolean('block_on_exceed').default(true).notNull(),
  notifyOnWarning: boolean('notify_on_warning').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
