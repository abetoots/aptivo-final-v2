/**
 * FEAT-01: Workflow Definition Schema
 * @task FEAT-01
 *
 * stores workflow definition configurations for the crud api.
 */

import { pgTable, uuid, varchar, integer, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const workflowStatusEnum = pgEnum('workflow_definition_status', ['draft', 'active', 'archived']);

export const workflowDefinitions = pgTable('workflow_definitions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 200 }).notNull(),
  version: integer('version').notNull().default(1),
  domain: varchar('domain', { length: 50 }).notNull(),
  description: varchar('description', { length: 1000 }),
  steps: jsonb('steps').notNull().$type<WorkflowStep[]>(),
  status: workflowStatusEnum('status').notNull().default('draft'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export interface WorkflowStep {
  id: string;
  type: 'action' | 'decision' | 'hitl' | 'notification' | 'wait';
  name: string;
  config: Record<string, unknown>;
  nextSteps?: string[]; // ids of next steps
}
