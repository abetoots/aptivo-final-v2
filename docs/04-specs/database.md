---
id: TSD-CORE-DATABASE
title: Database Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
parent: ../03-architecture/platform-core-add.md
---
# Database Specification

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

## 4. Platform Core Tables

> **Note:** These tables support the shared Platform Core services (HITL, LLM, Notifications, Audit). For detailed specifications, see:
> - [hitl-gateway.md](hitl-gateway.md) - HITL requests, decisions, policies
> - [llm-gateway.md](llm-gateway.md) - LLM usage logs, budget configs
> - [notification-bus.md](notification-bus.md) - Templates, logs, preferences

### 4.1 Audit Log (Tamper-Evident)

```typescript
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // actor
  userId: uuid('user_id').references(() => users.id),
  actorType: varchar('actor_type', { length: 50 }).notNull(), // 'user', 'system', 'workflow'
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  // action
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: uuid('resource_id'),
  // domain context
  domain: varchar('domain', { length: 50 }), // 'hr', 'crypto', 'core'
  // details
  metadata: jsonb('metadata'),
  // tamper-evidence chain (ADD Section 9.3)
  previousHash: varchar('previous_hash', { length: 64 }),
  currentHash: varchar('current_hash', { length: 64 }).notNull(),
  // timing
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  actorIdx: index('audit_logs_user_id_idx').on(table.userId),
  resourceIdx: index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
  timestampIdx: index('audit_logs_timestamp_idx').on(table.timestamp),
  domainIdx: index('audit_logs_domain_idx').on(table.domain),
}));

// NOTE: audit_logs table has NO UPDATE/DELETE permissions granted
// Partitioned by month for retention management
```

### 4.2 LLM Usage Logs

```typescript
export const llmUsageLogs = pgTable('llm_usage_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // workflow context
  workflowId: uuid('workflow_id'),
  workflowStepId: varchar('workflow_step_id', { length: 100 }),
  domain: varchar('domain', { length: 50 }).notNull(),
  // provider details
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  // token counts
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  // cost (USD)
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
  // request metadata
  requestType: varchar('request_type', { length: 50 }),
  latencyMs: integer('latency_ms'),
  // fallback tracking
  wasFallback: boolean('was_fallback').default(false),
  primaryProvider: varchar('primary_provider', { length: 50 }),
  // timing
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  workflowIdx: index('llm_usage_logs_workflow_id_idx').on(table.workflowId),
  domainIdx: index('llm_usage_logs_domain_idx').on(table.domain),
  timestampIdx: index('llm_usage_logs_timestamp_idx').on(table.timestamp),
  providerIdx: index('llm_usage_logs_provider_idx').on(table.provider),
}));
```

### 4.2b LLM Budget Configs

```typescript
export const llmBudgetConfigs = pgTable('llm_budget_configs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar('domain', { length: 50 }).notNull().unique(),
  // daily budget
  dailyLimitUsd: numeric('daily_limit_usd', { precision: 10, scale: 2 }).notNull(),
  dailyWarningThreshold: numeric('daily_warning_threshold', { precision: 3, scale: 2 }).default('0.90'),
  // monthly budget
  monthlyLimitUsd: numeric('monthly_limit_usd', { precision: 10, scale: 2 }).notNull(),
  monthlyWarningThreshold: numeric('monthly_warning_threshold', { precision: 3, scale: 2 }).default('0.90'),
  // behavior
  blockOnExceed: boolean('block_on_exceed').default(true),
  notifyOnWarning: boolean('notify_on_warning').default(true),
  // audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});
```

### 4.3 HITL Requests

```typescript
export const hitlStatusEnum = pgEnum('hitl_status', [
  'pending', 'approved', 'rejected', 'expired', 'canceled',
]);

export const hitlRequests = pgTable('hitl_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid('workflow_id').notNull(),
  workflowStepId: varchar('workflow_step_id', { length: 100 }),
  domain: varchar('domain', { length: 50 }).notNull(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  summary: text('summary').notNull(),
  details: jsonb('details'),
  approverId: uuid('approver_id').references(() => users.id).notNull(),
  status: hitlStatusEnum('status').default('pending').notNull(),
  // hash only — raw JWT never persisted (SP-11 security)
  tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => ({
  workflowIdx: index('hitl_requests_workflow_id_idx').on(table.workflowId),
  approverStatusIdx: index('hitl_requests_approver_status_idx').on(table.approverId, table.status),
  statusExpiresIdx: index('hitl_requests_status_expires_idx').on(table.status, table.tokenExpiresAt),
}));
```

### 4.4 HITL Decisions

```typescript
export const hitlDecisionEnum = pgEnum('hitl_decision', [
  'approved', 'rejected',
]);

export const hitlDecisions = pgTable('hitl_decisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requestId: uuid('request_id').references(() => hitlRequests.id, { onDelete: 'cascade' }).notNull(),
  approverId: uuid('approver_id').references(() => users.id).notNull(),
  decision: hitlDecisionEnum('decision').notNull(),
  comment: text('comment'),
  channel: varchar('channel', { length: 50 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  requestIdx: uniqueIndex('hitl_decisions_request_id_idx').on(table.requestId),
  approverIdx: index('hitl_decisions_approver_idx').on(table.approverId),
}));
```

### 4.5 RBAC Tables (Sprint 2 — ID-01)

```typescript
export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  // null = platform-wide; set to domain name for domain-scoped roles
  domain: varchar('domain', { length: 50 }),
  // audit
  grantedBy: uuid('granted_by').references(() => users.id).notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  index('user_roles_user_id_idx').on(table.userId),
  index('user_roles_role_domain_idx').on(table.role, table.domain),
  // prevent duplicate active role assignments per user+role+domain
  uniqueIndex('user_roles_active_unique_idx')
    .on(table.userId, table.role, table.domain)
    .where(sql`revoked_at IS NULL`),
]);

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  role: varchar('role', { length: 50 }).notNull(),
  permission: varchar('permission', { length: 100 }).notNull(),
}, (table) => [
  index('role_permissions_role_idx').on(table.role),
  uniqueIndex('role_permissions_role_permission_idx').on(table.role, table.permission),
]);
```

**Core roles** (seeded): `admin`, `user`, `viewer`

**Domain roles** (extensible): e.g., `trader` in `crypto`, `recruiter` in `hr` — added via the `domain` column in Sprint 6-7.

**Active role check**: `revokedAt IS NULL`. The partial unique index prevents duplicate active assignments.

**Permission strings**: Colon-namespaced (e.g., `hitl:approve`, `llm:query`, `admin:users`).

---

### 4.6 Notification Templates

```typescript
export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 50 }),
  version: integer('version').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  emailTemplate: jsonb('email_template'),
  telegramTemplate: jsonb('telegram_template'),
  pushTemplate: jsonb('push_template'),
  ...timestamps,
});
```

### 4.7 Sessions (Platform Core Identity)

```typescript
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: varchar('token', { length: 512 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  deviceInfo: jsonb('device_info'),
  revoked: boolean('revoked').default(false).notNull(),
}, (table) => ({
  userIdx: index('sessions_user_id_idx').on(table.userId),
  tokenIdx: uniqueIndex('sessions_token_idx').on(table.token),
  expiresIdx: index('sessions_expires_at_idx').on(table.expiresAt),
}));
```

### 4.8 Authenticators (WebAuthn)

```typescript
export const authenticators = pgTable('authenticators', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  credentialId: varchar('credential_id', { length: 512 }).notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').default(0).notNull(),
  deviceName: varchar('device_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (table) => ({
  userIdx: index('authenticators_user_id_idx').on(table.userId),
  credentialIdx: uniqueIndex('authenticators_credential_id_idx').on(table.credentialId),
}));
```

---

## 5. HR Domain Tables

> **Note:** The following tables are in the `aptivo_hr` schema for domain isolation.

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

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Data model requirements | [platform-core-frd.md](../../02-requirements/platform-core-frd.md) | Section 8 (Data Model) |
| Candidate data model | [hr-domain-frd.md](../../02-requirements/hr-domain-frd.md) | Section 3 (Candidate Management) |
| Audit logging requirements | [platform-core-add.md](../../03-architecture/platform-core-add.md) | Section 9.3 (Tamper-Evident Logs) |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Schema implementation | [05a-Coding-Guidelines.md](../05-guidelines/05a-Coding-Guidelines.md) | Database Patterns |
| Migration procedures | [01-runbook.md](../06-operations/01-runbook.md) | Database Migrations |
