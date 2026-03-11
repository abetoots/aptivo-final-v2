/**
 * S6-INF-HR: HR domain schema
 * @task S6-INF-HR
 * @frd docs/02-requirements/hr-domain-frd.md §2.1
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { files } from './file-storage.js';
import { users } from './users.js';

// -- candidates --

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    phone: varchar('phone', { length: 50 }),
    resumeFileId: uuid('resume_file_id').references(() => files.id),
    skills: jsonb('skills').default([]),
    status: varchar('status', { length: 20 }).default('active'),
    consentStatus: varchar('consent_status', { length: 20 }).default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('candidates_email_idx').on(table.email),
    index('candidates_status_idx').on(table.status),
  ],
);

// -- applications --

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id).notNull(),
    positionId: uuid('position_id'),
    source: varchar('source', { length: 50 }),
    currentStage: varchar('current_stage', { length: 30 }).notNull().default('received'),
    appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('applications_candidate_id_idx').on(table.candidateId),
    index('applications_current_stage_idx').on(table.currentStage),
  ],
);

// -- interviews --

export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id').references(() => applications.id).notNull(),
    interviewerId: uuid('interviewer_id').references(() => users.id),
    dateTime: timestamp('date_time', { withTimezone: true }).notNull(),
    location: varchar('location', { length: 500 }),
    type: varchar('type', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('scheduling'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('interviews_application_id_idx').on(table.applicationId),
    index('interviews_status_idx').on(table.status),
  ],
);

// -- interview feedback --

export const interviewFeedback = pgTable('interview_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  interviewId: uuid('interview_id').references(() => interviews.id).notNull().unique(),
  rating: integer('rating').notNull(),
  strengths: text('strengths'),
  concerns: text('concerns'),
  recommendation: varchar('recommendation', { length: 20 }).notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
});

// -- consent records --

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id).notNull(),
    consentType: varchar('consent_type', { length: 50 }).notNull(),
    consentDate: timestamp('consent_date', { withTimezone: true }).notNull().defaultNow(),
    consentText: text('consent_text').notNull(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (table) => [
    index('consent_records_candidate_id_idx').on(table.candidateId),
  ],
);

// -- positions --

export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 200 }).notNull(),
    clientId: uuid('client_id'),
    requirements: jsonb('requirements').default([]),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    slaBusinessDays: integer('sla_business_days').default(30),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('positions_status_idx').on(table.status),
  ],
);

// -- contracts --

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id).notNull(),
    templateSlug: varchar('template_slug', { length: 100 }).notNull(),
    terms: jsonb('terms').default({}),
    version: integer('version').default(1),
    status: varchar('status', { length: 30 }).notNull().default('drafting'),
    complianceFlags: jsonb('compliance_flags').default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('contracts_candidate_id_idx').on(table.candidateId),
    index('contracts_status_idx').on(table.status),
  ],
);
