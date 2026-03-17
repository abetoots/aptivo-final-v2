/**
 * HITL2-02: Per-Approver Token Join Table
 * @task HITL2-02
 *
 * stores per-approver token hashes for multi-approver hitl requests.
 * each row links a request to an approver with their unique token hash.
 */

import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { hitlRequests } from './hitl-requests.js';
import { users } from './users.js';

export const hitlRequestTokens = pgTable('hitl_request_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requestId: uuid('request_id').references(() => hitlRequests.id, { onDelete: 'cascade' }).notNull(),
  approverId: uuid('approver_id').references(() => users.id).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('hitl_request_tokens_request_approver_idx').on(table.requestId, table.approverId),
]);
