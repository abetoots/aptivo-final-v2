/**
 * HITL-01: Approval Request Schema
 * @task HITL-01
 * @frd FR-CORE-HITL-001
 * @spec docs/04-specs/platform-core/hitl-gateway.md
 */

import {
  char,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

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
    // workflow context
    workflowId: uuid('workflow_id').notNull(),
    workflowStepId: varchar('workflow_step_id', { length: 100 }),
    domain: varchar('domain', { length: 50 }).notNull(),
    // request content
    actionType: varchar('action_type', { length: 100 }).notNull(),
    summary: text('summary').notNull(),
    details: jsonb('details'),
    // assignee
    approverId: uuid('approver_id')
      .references(() => users.id)
      .notNull(),
    // status
    status: hitlStatusEnum('status').default('pending').notNull(),
    // token — hash only, raw JWT never persisted (SP-11 security requirement)
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    tokenExpiresAt: timestamp('token_expires_at', {
      withTimezone: true,
    }).notNull(),
    // timing
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('hitl_requests_workflow_id_idx').on(table.workflowId),
    index('hitl_requests_approver_status_idx').on(
      table.approverId,
      table.status
    ),
    index('hitl_requests_status_expires_idx').on(
      table.status,
      table.tokenExpiresAt
    ),
  ]
);
