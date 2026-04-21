/**
 * FA3-01: Department entity schema.
 *
 * Introduces departments as a first-class org concept (separate from the
 * llm-gateway's domain axis). Budget configs and LLM usage rows link
 * back here via FK / nullable column respectively. Added in Sprint 16;
 * department-ID stamping on llm_usage_logs rows is an S17 task, so for
 * S16 the `departmentId` column on llm_usage_logs stays nullable and
 * `getSpendReport` returns `coverageLevel: 'none'` until stamping lands.
 */

import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 120 }).notNull(),
  ownerUserId: uuid('owner_user_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
