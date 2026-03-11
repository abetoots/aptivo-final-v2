/**
 * NOTIF-02: Notification schema
 * @task NOTIF-02
 * @frd FR-CORE-NOTIF-001
 * @spec database.md §4.6
 *
 * Tables:
 * - notification_templates — domain-scoped, channel-aware, versioned
 * - notification_preferences — per-user per-channel opt-out
 * - notification_deliveries — delivery attempt log
 *
 * NOTE: notification_templates columns follow database.md §4.6 exactly.
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  jsonb,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// notification_templates (database.md §4.6)
// ---------------------------------------------------------------------------

export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar('slug', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 50 }),
  version: integer('version').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  emailTemplate: jsonb('email_template'),
  telegramTemplate: jsonb('telegram_template'),
  pushTemplate: jsonb('push_template'),
  /** json schema-like definition for variable validation */
  variableSchema: jsonb('variable_schema'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notification_templates_domain_idx').on(table.domain),
  uniqueIndex('notification_templates_slug_version_idx').on(table.slug, table.version),
]);

// ---------------------------------------------------------------------------
// notification_preferences — per-user per-channel opt-out
// ---------------------------------------------------------------------------

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  channel: varchar('channel', { length: 50 }).notNull(),
  optedOut: boolean('opted_out').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('notification_prefs_user_channel_idx').on(table.userId, table.channel),
]);

// ---------------------------------------------------------------------------
// notification_deliveries — delivery attempt log
// ---------------------------------------------------------------------------

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending', 'delivered', 'failed', 'retrying', 'opted_out',
]);

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recipientId: uuid('recipient_id').notNull(),
  channel: varchar('channel', { length: 50 }).notNull(),
  templateSlug: varchar('template_slug', { length: 100 }).notNull(),
  transactionId: varchar('transaction_id', { length: 255 }),
  status: deliveryStatusEnum('status').default('pending').notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, (table) => [
  index('notification_deliveries_recipient_idx').on(table.recipientId),
  index('notification_deliveries_status_idx').on(table.status),
]);
