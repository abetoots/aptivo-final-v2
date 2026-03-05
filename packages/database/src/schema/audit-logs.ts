/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Audit logs table (tamper-evident).
 *
 * This table is designed to be append-only. No UPDATE or DELETE
 * permissions should be granted on it. Each row links to the
 * previous via `previousHash` / `currentHash` forming a
 * hash-chain for tamper detection.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id'),
    actorType: varchar('actor_type', { length: 50 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 100 }).notNull(),
    resourceId: varchar('resource_id', { length: 255 }).notNull(),
    metadata: jsonb('metadata'),
    previousHash: varchar('previous_hash', { length: 64 }),
    currentHash: varchar('current_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('audit_logs_user_id_idx').on(table.userId),
    index('audit_logs_resource_idx').on(
      table.resourceType,
      table.resourceId
    ),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ]
);
