/**
 * HITL-02: Decision Schema
 * @task HITL-02
 * @frd FR-CORE-HITL-003
 * @spec docs/04-specs/platform-core/hitl-gateway.md
 */

import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
    // single-decision enforcement: unique constraint = first-writer-wins
    requestId: uuid('request_id')
      .references(() => hitlRequests.id, { onDelete: 'cascade' })
      .notNull(),
    approverId: uuid('approver_id')
      .references(() => users.id)
      .notNull(),
    decision: hitlDecisionEnum('decision').notNull(),
    comment: text('comment'),
    channel: varchar('channel', { length: 50 }).notNull(),
    // audit metadata
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    // timing
    decidedAt: timestamp('decided_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // first-writer-wins: only one decision per request
    uniqueIndex('hitl_decisions_request_id_idx').on(table.requestId),
    index('hitl_decisions_approver_idx').on(table.approverId),
  ]
);
