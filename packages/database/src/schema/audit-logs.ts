/**
 * AUD-01: Audit schema
 * @task AUD-01
 * @frd FR-CORE-AUD-001
 * @spec docs/04-specs/database.md §4.1
 *
 * Three tables:
 * - audit_logs: append-only, tamper-evident via hash chaining
 * - audit_chain_heads: tracks hash chain state per scope (FOR UPDATE serialization)
 * - audit_write_dlq: dead letter queue for failed async writes
 *
 * NO UPDATE/DELETE permissions on audit_logs.
 */

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// audit_logs — append-only, tamper-evident
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // actor
    userId: uuid('user_id'),
    actorType: varchar('actor_type', { length: 50 }).notNull(), // 'user' | 'system' | 'workflow'
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    // action
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 100 }).notNull(),
    resourceId: varchar('resource_id', { length: 255 }),
    // domain context
    domain: varchar('domain', { length: 50 }), // 'hr' | 'crypto' | 'core'
    // details (PII auto-masked before write)
    metadata: jsonb('metadata'),
    // tamper-evidence chain (ADD §9.3)
    previousHash: varchar('previous_hash', { length: 64 }),
    currentHash: varchar('current_hash', { length: 64 }).notNull(),
    // timing
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_user_id_idx').on(table.userId),
    index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
    index('audit_logs_timestamp_idx').on(table.timestamp),
    index('audit_logs_domain_idx').on(table.domain),
  ],
);

// ---------------------------------------------------------------------------
// audit_chain_heads — hash chain state per scope
// ---------------------------------------------------------------------------

export const auditChainHeads = pgTable('audit_chain_heads', {
  chainScope: varchar('chain_scope', { length: 255 }).primaryKey(), // 'global' default
  lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
  lastHash: varchar('last_hash', { length: 64 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// audit_write_dlq — failed audit writes for replay
// ---------------------------------------------------------------------------

export const dlqStatusEnum = pgEnum('dlq_status', [
  'pending',
  'retrying',
  'exhausted',
  'replayed',
]);

export const auditWriteDlq = pgTable(
  'audit_write_dlq',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    payload: jsonb('payload').notNull(),
    error: text('error').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    status: dlqStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_write_dlq_status_idx').on(table.status),
    index('audit_write_dlq_next_retry_idx').on(table.nextRetryAt),
  ],
);
