/**
 * FS-01: File Storage Schema
 * @task FS-01
 * @frd FR-CORE-BLOB-001, FR-CORE-BLOB-002
 * @spec docs/06-sprints/sprint-3-plan.md
 */

import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const files = pgTable(
  'files',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    key: varchar('key', { length: 500 }).notNull().unique(),
    bucket: varchar('bucket', { length: 100 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    uploadedBy: uuid('uploaded_by').notNull(),
    scanResult: varchar('scan_result', { length: 50 }), // 'clean' | 'infected' | null
    scanSignature: varchar('scan_signature', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('files_status_idx').on(table.status),
    index('files_uploaded_by_idx').on(table.uploadedBy),
  ],
);

export const fileEntityLinks = pgTable(
  'file_entity_links',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('file_entity_links_file_idx').on(table.fileId),
    index('file_entity_links_entity_idx').on(
      table.entityType,
      table.entityId,
    ),
    uniqueIndex('file_entity_links_unique_idx').on(
      table.fileId,
      table.entityType,
      table.entityId,
    ),
  ],
);
