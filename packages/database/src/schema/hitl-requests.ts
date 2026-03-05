/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const hitlStatusEnum = pgEnum('hitl_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
  'canceled',
]);

export const hitlRequests = pgTable(
  'hitl_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workflowId: varchar('workflow_id', { length: 255 }).notNull(),
    status: hitlStatusEnum('status').default('pending').notNull(),
    token: varchar('token', { length: 512 }).notNull().unique(),
    tokenHash: varchar('token_hash', { length: 255 }),
    tokenExpiresAt: timestamp('token_expires_at', {
      withTimezone: true,
    }).notNull(),
    actionType: varchar('action_type', { length: 100 }).notNull(),
    summary: text('summary').notNull(),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('hitl_requests_workflow_id_idx').on(table.workflowId),
    index('hitl_requests_status_idx').on(table.status),
    uniqueIndex('hitl_requests_token_idx').on(table.token),
  ]
);
