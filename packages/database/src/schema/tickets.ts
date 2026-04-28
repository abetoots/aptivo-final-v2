/**
 * S17-CT-1: Case-tracking ticket schema.
 *
 * First-class ticket entity for Epic 4 (case tracking). Each ticket
 * may optionally reference a workflow definition (the underlying
 * automation that drives it), an owner user, and the department it
 * was opened on behalf of. Soft-close semantics — `DELETE` sets
 * `closedAt` + `status='closed'` rather than removing the row, so
 * the audit trail and SLA history stay intact.
 *
 * Migration is reversible (nothing else FKs into `tickets` yet);
 * down-migration drops the table cleanly.
 */

import {
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
import { departments } from './departments.js';
import { workflowDefinitions } from './workflow-definitions.js';

export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'in_progress',
  'escalated',
  'closed',
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // optional automation linkage — caller may open a free-form ticket
    // without binding it to a workflow definition; CT-3 escalation
    // wires its own state separately so this field stays loose.
    workflowDefinitionId: uuid('workflow_definition_id').references(
      () => workflowDefinitions.id,
    ),
    status: ticketStatusEnum('status').notNull().default('open'),
    priority: ticketPriorityEnum('priority').notNull().default('medium'),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    ownerUserId: uuid('owner_user_id')
      .references(() => users.id)
      .notNull(),
    // S17-B1: department attribution mirrors llm_usage_logs.departmentId.
    // Nullable for callers without a resolved department; reporting
    // queries (CT-4) can scope by it when present.
    departmentId: uuid('department_id').references(() => departments.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    // populated by the soft-close path; queryable for SLA-honoured-after
    // analytics in CT-4.
    closedAt: timestamp('closed_at', { withTimezone: true }),
    // S17-CT-3: escalation state. Null until the first advance() —
    // see TicketEscalationState in the case-tracking service for the
    // shape (currentTier, chain, history). JSONB so the chain
    // definition can grow per-priority without schema churn; the
    // service is the only writer.
    escalationState: jsonb('escalation_state'),
  },
  (table) => ({
    // hot-path filters from /api/tickets list
    statusIdx: index('tickets_status_idx').on(table.status),
    ownerIdx: index('tickets_owner_user_id_idx').on(table.ownerUserId),
    departmentIdx: index('tickets_department_id_idx').on(table.departmentId),
    // CT-4 reporting bucket queries
    createdAtIdx: index('tickets_created_at_idx').on(table.createdAt),
  }),
);
