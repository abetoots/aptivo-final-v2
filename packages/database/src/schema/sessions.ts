/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    token: varchar('token', { length: 512 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked: boolean('revoked').default(false).notNull(),
    deviceInfo: jsonb('device_info'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    uniqueIndex('sessions_token_idx').on(table.token),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ]
);
