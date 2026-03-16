/**
 * ID-01: RBAC Schema
 * @task ID-01
 * @frd FR-CORE-ID-002
 * @spec docs/02-requirements/platform-core-frd.md §9
 *
 * Core roles: admin, user, viewer (platform-wide).
 * Domain roles (e.g. trader, recruiter) are extensible via the domain column.
 * Active role = revokedAt IS NULL.
 */

import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    // null = platform-wide; set to domain name for domain-scoped roles
    domain: varchar('domain', { length: 50 }),
    // audit
    grantedBy: uuid('granted_by')
      .references(() => users.id)
      .notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('user_roles_user_id_idx').on(table.userId),
    index('user_roles_role_domain_idx').on(table.role, table.domain),
    // prevent duplicate active role assignments per user+role+domain
    // note: NULL domain (platform-wide) treated as distinct by PG — app layer guards this
    uniqueIndex('user_roles_active_unique_idx')
      .on(table.userId, table.role, table.domain)
      .where(sql`revoked_at IS NULL`),
  ]
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    role: varchar('role', { length: 50 }).notNull(),
    permission: varchar('permission', { length: 100 }).notNull(),
  },
  (table) => [
    index('role_permissions_role_idx').on(table.role),
    uniqueIndex('role_permissions_role_permission_idx').on(
      table.role,
      table.permission
    ),
  ]
);

// webauthn/passkey credentials (ID2-04)
export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    credentialId: varchar('credential_id', { length: 512 }).notNull(),
    publicKey: varchar('public_key', { length: 2048 }).notNull(),
    counter: integer('counter').notNull().default(0),
    transports: varchar('transports', { length: 255 }), // comma-separated
    friendlyName: varchar('friendly_name', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('webauthn_user_id_idx').on(table.userId),
    uniqueIndex('webauthn_credential_id_idx').on(table.credentialId),
  ],
);
