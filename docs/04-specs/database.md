---
id: SPEC-MKJP625C
title: Database Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
---
# Database Specification

**Parent:** [04-Technical-Specifications.md](index.md)

---

## 1. Database Standards

### 1.1 Primary Key Convention

All tables use **UUID v7** (time-sortable) or **ULID** for primary keys:

```typescript
import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// standard primary key definition
const id = uuid('id').primaryKey().default(sql`gen_random_uuid()`);

// alternative: ULID stored as text (26 chars)
const ulidId = text('id', { length: 26 }).primaryKey();
```

**Rationale:**
- UUID v7/ULID are time-sortable, improving index performance
- 128-bit IDs prevent overflow in high-volume tables
- No sequential ID exposure (security)
- Supports future sharding/distribution

### 1.2 Timestamp Conventions

All tables include audit timestamps:

```typescript
// standard audit columns
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

// soft delete support (optional)
const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};
```

### 1.3 Monetary Values

Use `numeric(18, 4)` for all monetary columns:

```typescript
import { numeric } from 'drizzle-orm/pg-core';

// monetary columns
const amount = numeric('amount', { precision: 18, scale: 4 }).notNull();
const currency = varchar('currency', { length: 3 }).notNull().default('PHP');
```

**Rationale:**
- 18 digits supports values up to 999,999,999,999,999.9999
- 4 decimal places for fractional currency and FX conversions
- Avoids floating-point precision issues

### 1.4 Enum Handling

Use PostgreSQL enums via Drizzle:

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

// define enum type
export const candidateStatusEnum = pgEnum('candidate_status', [
  'new',
  'screening',
  'interviewing',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
]);

// use in table
const status = candidateStatusEnum('status').default('new').notNull();
```

---

## 2. Entity Schemas

### 2.1 Users Table (System Users)

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  externalId: varchar('external_id', { length: 255 }).notNull().unique(), // IdP subject
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 512 }),
  isActive: boolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  externalIdIdx: index('users_external_id_idx').on(table.externalId),
  emailIdx: index('users_email_idx').on(table.email),
}));
```

### 2.2 Candidates Table

```typescript
export const candidateStatusEnum = pgEnum('candidate_status', [
  'new',
  'screening',
  'interviewing',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
]);

export const candidates = pgTable('candidates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // basic info
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 50 }),
  // status
  status: candidateStatusEnum('status').default('new').notNull(),
  // documents
  resumeFileId: uuid('resume_file_id').references(() => files.id),
  // metadata
  source: varchar('source', { length: 100 }), // e.g., 'linkedin', 'referral', 'direct'
  referredById: uuid('referred_by_id').references(() => users.id),
  tags: text('tags').array(),
  notes: text('notes'),
  // audit
  ...timestamps,
  ...softDelete,
}, (table) => ({
  emailIdx: uniqueIndex('candidates_email_idx').on(table.email),
  statusIdx: index('candidates_status_idx').on(table.status),
  createdAtIdx: index('candidates_created_at_idx').on(table.createdAt),
}));
```

### 2.3 Interviews Table

```typescript
export const interviewTypeEnum = pgEnum('interview_type', [
  'screening',
  'technical',
  'behavioral',
  'panel',
  'final',
]);

export const interviewStatusEnum = pgEnum('interview_status', [
  'scheduled',
  'in_progress',
  'completed',
  'canceled',
  'no_show',
  'rescheduled',
]);

export const interviews = pgTable('interviews', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  candidateId: uuid('candidate_id').references(() => candidates.id).notNull(),
  type: interviewTypeEnum('type').notNull(),
  status: interviewStatusEnum('status').default('scheduled').notNull(),
  // scheduling
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').default(60).notNull(),
  location: varchar('location', { length: 500 }), // URL or address
  // external references
  calendarEventId: varchar('calendar_event_id', { length: 255 }),
  meetingLink: varchar('meeting_link', { length: 500 }),
  // outcome
  outcome: varchar('outcome', { length: 50 }), // 'pass', 'fail', 'maybe'
  outcomeNotes: text('outcome_notes'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  // audit
  ...timestamps,
}, (table) => ({
  candidateIdx: index('interviews_candidate_id_idx').on(table.candidateId),
  scheduledAtIdx: index('interviews_scheduled_at_idx').on(table.scheduledAt),
  statusIdx: index('interviews_status_idx').on(table.status),
}));
```

### 2.4 Interview Interviewers (Join Table)

**Note:** This replaces the previous `interviewerIds` array for proper referential integrity.

```typescript
export const interviewInterviewers = pgTable('interview_interviewers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  interviewId: uuid('interview_id').references(() => interviews.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  role: varchar('role', { length: 50 }).default('interviewer'), // 'lead', 'interviewer', 'observer'
  // feedback
  feedbackSubmitted: boolean('feedback_submitted').default(false),
  feedbackSubmittedAt: timestamp('feedback_submitted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  interviewIdx: index('interview_interviewers_interview_id_idx').on(table.interviewId),
  userIdx: index('interview_interviewers_user_id_idx').on(table.userId),
  uniqueAssignment: uniqueIndex('interview_interviewers_unique').on(table.interviewId, table.userId),
}));
```

### 2.5 Interview Feedback Table

```typescript
export const recommendationEnum = pgEnum('recommendation', [
  'strong_yes',
  'yes',
  'maybe',
  'no',
  'strong_no',
]);

export const interviewFeedback = pgTable('interview_feedback', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  interviewId: uuid('interview_id').references(() => interviews.id, { onDelete: 'cascade' }).notNull(),
  interviewerId: uuid('interviewer_id').references(() => users.id).notNull(),
  // ratings
  rating: integer('rating').notNull(), // 1-5 scale
  recommendation: recommendationEnum('recommendation').notNull(),
  // qualitative feedback
  strengths: text('strengths'),
  concerns: text('concerns'),
  technicalNotes: text('technical_notes'),
  culturalFitNotes: text('cultural_fit_notes'),
  generalNotes: text('general_notes'),
  // audit
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (table) => ({
  interviewIdx: index('interview_feedback_interview_id_idx').on(table.interviewId),
  uniqueFeedback: uniqueIndex('interview_feedback_unique').on(table.interviewId, table.interviewerId),
}));
```

### 2.6 Contracts Table

```typescript
export const contractStatusEnum = pgEnum('contract_status', [
  'draft',
  'pending_review',
  'sent',
  'viewed',
  'signed',
  'declined',
  'expired',
  'voided',
]);

export const contractTypeEnum = pgEnum('contract_type', [
  'full_time',
  'part_time',
  'contractor',
  'intern',
  'consultant',
]);

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  candidateId: uuid('candidate_id').references(() => candidates.id).notNull(),
  // contract details
  type: contractTypeEnum('type').notNull(),
  status: contractStatusEnum('status').default('draft').notNull(),
  // dates
  startDate: date('start_date').notNull(),
  endDate: date('end_date'), // null for permanent
  // compensation
  salaryAmount: numeric('salary_amount', { precision: 18, scale: 4 }).notNull(),
  salaryCurrency: varchar('salary_currency', { length: 3 }).default('PHP').notNull(),
  salaryPeriod: varchar('salary_period', { length: 20 }).notNull(), // 'hourly', 'monthly', 'yearly'
  // documents
  contractFileId: uuid('contract_file_id').references(() => files.id),
  signedFileId: uuid('signed_file_id').references(() => files.id),
  // workflow
  sentAt: timestamp('sent_at', { withTimezone: true }),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  // versioning
  version: integer('version').default(1).notNull(),
  // audit
  ...timestamps,
}, (table) => ({
  candidateIdx: index('contracts_candidate_id_idx').on(table.candidateId),
  statusIdx: index('contracts_status_idx').on(table.status),
}));
```

### 2.7 Files Table (Object Storage References)

```typescript
export const files = pgTable('files', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // storage location
  bucket: varchar('bucket', { length: 100 }).notNull(),
  key: varchar('key', { length: 500 }).notNull(),
  // metadata
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  // checksums
  checksumSha256: varchar('checksum_sha256', { length: 64 }),
  // access control
  isPublic: boolean('is_public').default(false).notNull(),
  uploadedById: uuid('uploaded_by_id').references(() => users.id),
  // retention
  retentionUntil: timestamp('retention_until', { withTimezone: true }),
  // audit
  ...timestamps,
  ...softDelete,
}, (table) => ({
  bucketKeyIdx: uniqueIndex('files_bucket_key_idx').on(table.bucket, table.key),
}));
```

---

## 3. Workflow Tables

### 3.1 Workflow Definitions

```typescript
export const workflowStatusEnum = pgEnum('workflow_definition_status', [
  'draft',
  'active',
  'deprecated',
  'archived',
]);

export const workflowDefinitions = pgTable('workflow_definitions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: workflowStatusEnum('status').default('draft').notNull(),
  // definition
  triggerType: varchar('trigger_type', { length: 100 }).notNull(),
  triggerConfig: jsonb('trigger_config').$type<Record<string, unknown>>(),
  steps: jsonb('steps').$type<WorkflowStep[]>().notNull(),
  // versioning
  version: integer('version').default(1).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  // audit
  createdById: uuid('created_by_id').references(() => users.id),
  ...timestamps,
}, (table) => ({
  nameIdx: index('workflow_definitions_name_idx').on(table.name),
  statusIdx: index('workflow_definitions_status_idx').on(table.status),
}));
```

### 3.2 Workflow Executions

```typescript
export const executionStatusEnum = pgEnum('workflow_execution_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'canceled',
  'compensating',
  'compensated',
]);

export const workflowExecutions = pgTable('workflow_executions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  definitionId: uuid('definition_id').references(() => workflowDefinitions.id).notNull(),
  // execution state
  status: executionStatusEnum('status').default('pending').notNull(),
  currentStepIndex: integer('current_step_index').default(0),
  // context
  triggerData: jsonb('trigger_data').$type<Record<string, unknown>>(),
  stepResults: jsonb('step_results').$type<StepResult[]>().default([]),
  // correlation
  correlationId: varchar('correlation_id', { length: 100 }),
  // timing
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  // error handling
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
  // audit
  ...timestamps,
}, (table) => ({
  definitionIdx: index('workflow_executions_definition_id_idx').on(table.definitionId),
  statusIdx: index('workflow_executions_status_idx').on(table.status),
  correlationIdx: index('workflow_executions_correlation_id_idx').on(table.correlationId),
}));
```

---

## 4. Audit Tables

### 4.1 Audit Log

```typescript
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // actor
  userId: uuid('user_id').references(() => users.id),
  userEmail: varchar('user_email', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  // action
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id'),
  // details
  previousState: jsonb('previous_state'),
  newState: jsonb('new_state'),
  metadata: jsonb('metadata'),
  // timing
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('audit_logs_user_id_idx').on(table.userId),
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  occurredAtIdx: index('audit_logs_occurred_at_idx').on(table.occurredAt),
}));
```

---

## 5. Index Strategy

### 5.1 Index Guidelines

| Index Type | Use Case | Example |
|------------|----------|---------|
| **Primary Key** | Unique identifier | `id` column |
| **Unique** | Business uniqueness | `email`, `external_id` |
| **Foreign Key** | Relationship lookups | `candidate_id`, `user_id` |
| **Composite** | Multi-column queries | `(entity_type, entity_id)` |
| **Partial** | Filtered queries | `WHERE status = 'active'` |

### 5.2 Partial Index Examples

```typescript
// only index active candidates for faster listing
const activeCandidatesIdx = index('candidates_active_idx')
  .on(candidates.status, candidates.createdAt)
  .where(sql`deleted_at IS NULL`);

// only index pending workflows
const pendingWorkflowsIdx = index('workflow_executions_pending_idx')
  .on(workflowExecutions.status)
  .where(sql`status IN ('pending', 'running')`);
```

---

## 6. Migration Guidelines

### 6.1 Migration Naming

```
{timestamp}_{description}.ts
20250115120000_create_candidates_table.ts
20250115120100_add_interview_interviewers_join.ts
```

### 6.2 Migration Best Practices

1. **One concern per migration** - don't mix unrelated changes
2. **Backwards compatible** - avoid breaking changes to active columns
3. **Reversible** - include `down` migration when possible
4. **Data preservation** - migrate data before dropping columns
5. **Index separately** - create indexes in separate migrations for large tables
