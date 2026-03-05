/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { hitlRequests } from './hitl-requests.js';
import { users } from './users.js';

export const hitlDecisionEnum = pgEnum('hitl_decision', [
  'approved',
  'rejected',
]);

export const hitlDecisions = pgTable(
  'hitl_decisions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    requestId: uuid('request_id')
      .references(() => hitlRequests.id)
      .notNull(),
    approverId: uuid('approver_id')
      .references(() => users.id)
      .notNull(),
    decision: hitlDecisionEnum('decision').notNull(),
    comment: text('comment'),
    channel: varchar('channel', { length: 50 }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('hitl_decisions_request_id_idx').on(table.requestId)]
);
