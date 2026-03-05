/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

import {
  boolean,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    externalId: varchar('external_id', { length: 255 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('users_external_id_idx').on(table.externalId),
    index('users_email_idx').on(table.email),
  ]
);
