/**
 * HITL2-01: Approval Policy Schema
 * @task HITL2-01
 *
 * stores approval policy configurations for multi-approver hitl flows.
 */

import { pgTable, uuid, varchar, integer, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const approvalPolicyTypeEnum = pgEnum('approval_policy_type', [
  'single',
  'quorum',
  'sequential',
]);

export const approvalPolicies = pgTable('approval_policies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull().unique(),
  type: approvalPolicyTypeEnum('type').notNull(),
  threshold: integer('threshold'), // null for single/sequential
  approverRoles: jsonb('approver_roles').notNull().$type<string[]>(),
  maxRetries: integer('max_retries').notNull().default(3),
  timeoutSeconds: integer('timeout_seconds').notNull().default(86400),
  escalationPolicy: jsonb('escalation_policy').$type<{
    timeoutAction: string;
    escalateToRole?: string;
  } | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
