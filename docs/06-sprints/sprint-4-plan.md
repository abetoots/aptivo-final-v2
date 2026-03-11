# Sprint 4 Implementation Plan: Audit Service + Notification Bus

**Theme**: "Every action recorded, every user notified"
**Duration**: 2 weeks (Week 9–10)
**Total Story Points**: 19 (8 tasks) + 2.5 (carry-forward) = 21.5 SP
**Packages**: `@aptivo/audit` (new) + `@aptivo/notifications` (new) + `@aptivo/database` + `@aptivo/mcp-layer` (carry-forward) + `@aptivo/file-storage` (carry-forward)
**FRD Coverage**: FR-CORE-AUD-001, FR-CORE-NOTIF-001, FR-CORE-HITL-006 (completion)
**WARNING Closure**: T1-W21 (audit sync → async with timeout + DLQ)

---

## Executive Summary

Sprint 4 delivers the final foundational platform services:

1. **Audit Service** — Tamper-evident, append-only logging with SHA-256 hash chaining. Writes are async via Inngest to keep critical paths non-blocking (T1-W21). PII auto-masked before write via config-driven field rules.
2. **Notification Bus** — Generalized notification dispatch extending the existing HITL-08 Novu adapter into a standalone package. Supports email + chat channels, domain-scoped templates with Zod-validated variable substitution, per-channel opt-out, and delivery retry logging.

Architecture constraints resolved in [SPRINT_4_PLAN_MULTI_REVIEW.md](./SPRINT_4_PLAN_MULTI_REVIEW.md) and enforced in this plan:

- Global hash chain scope with `SELECT ... FOR UPDATE` serialization (extensible to per-domain)
- Inngest for async audit writes + DLQ (no BullMQ)
- Compatibility shim for HITL-08 → NotificationService migration
- Safe `{{var}}` template engine with Zod schema validation (no eval)
- Config-driven PII masking at field level

### Multi-Model Consensus

This plan was produced via multi-model synthesis (Claude Opus 4.6 lead + Gemini 3 Flash Preview + Codex/GPT). All three models agree on:

- 3-phase execution: Foundation → Services → Reliability
- Inngest async audit writes with DB-backed DLQ
- `createAuditService(deps)` and `createNotificationService(deps)` factory patterns
- Compatibility shim for HITL notification migration (not full move)
- Sprint 3 carry-forward: absorb only 3 small items (~2.5 SP), defer AgentKit + S3 to Sprint 5
- 21.5 SP is comfortable — preserves the deliberate buffer from phase-1-sprint-plan.md

---

## 1. Task Breakdown

### Phase 1: Audit Foundation (Days 1–4)

#### AUD-01: Audit Schema (2 SP)

**Description**: Implement `audit_logs` Drizzle table (from database.md §4.1), `audit_chain_heads` for hash chain state, and `audit_write_dlq` for failed writes.

**Acceptance Criteria**:
- [ac] `audit_logs` table: id, userId, actorType, ipAddress, userAgent, action, resourceType, resourceId, domain, metadata (JSONB), previousHash, currentHash, timestamp — per database.md §4.1
- [ac] `audit_chain_heads` table: chainScope (PK), lastSeq (bigint), lastHash (varchar 64), updatedAt
- [ac] `audit_write_dlq` table: id, payload (JSONB), error (text), attemptCount, nextRetryAt, status, createdAt, updatedAt
- [ac] Indexes on userId, resourceType+resourceId, timestamp, domain
- [ac] No UPDATE/DELETE permissions on `audit_logs` (documented in schema comment)
- [ac] Schema exported from `@aptivo/database`

**Files**:
- Create: `packages/database/src/schema/audit-logs.ts`
- Modify: `packages/database/src/schema/index.ts`, `packages/database/src/index.ts`

**Dependencies**: None

**Reuse Assessment**: **50%** — column layout from database.md; chain_heads and DLQ are new.

**TDD Micro-Tasks**:
1. Red: Import `auditLogs` from `@aptivo/database` — fails (module not found)
2. Green: Define `pgTable('audit_logs', { ... })` with all columns per database.md §4.1
3. Red: Import `auditChainHeads` — fails
4. Green: Define `pgTable('audit_chain_heads', { ... })` with chainScope PK, lastSeq, lastHash
5. Red: Import `auditWriteDlq` — fails
6. Green: Define `pgTable('audit_write_dlq', { ... })` with status enum
7. Refactor: Add all indexes, export from barrel

**Schema Design**:

```typescript
// audit_chain_heads — tracks hash chain state per scope
export const auditChainHeads = pgTable('audit_chain_heads', {
  chainScope: varchar('chain_scope', { length: 255 }).primaryKey(), // 'global' default
  lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
  lastHash: varchar('last_hash', { length: 64 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// audit_write_dlq — failed audit writes for replay
export const dlqStatusEnum = pgEnum('dlq_status', ['pending', 'retrying', 'exhausted', 'replayed']);

export const auditWriteDlq = pgTable('audit_write_dlq', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  payload: jsonb('payload').notNull(),
  error: text('error').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  status: dlqStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

---

#### AUD-02: Audit Write Path (3 SP)

**Description**: Implement `createAuditService(deps)` factory with SHA-256 hash chaining, PII masking, and Result-based error handling.

**Acceptance Criteria**:
- [ac] `createAuditService(deps)` returns `AuditService` with `emit(event)` method
- [ac] `emit()` computes `currentHash = sha256(previousHash + JSON.stringify(event))` — tamper-evident chain
- [ac] Hash chain serialized via `SELECT ... FOR UPDATE` on `audit_chain_heads`
- [ac] PII fields in metadata auto-masked before write based on `MaskingConfig`
- [ac] Returns `Result<AuditRecord, AuditError>` — never throws
- [ac] Supports `actorType`: 'user' | 'system' | 'workflow'

**Files**:
- Create: `packages/audit/package.json`, `packages/audit/tsconfig.json`, `packages/audit/vitest.config.ts`
- Create: `packages/audit/src/types.ts` — AuditEventInput, AuditRecord, AuditError, AuditStore, MaskingConfig
- Create: `packages/audit/src/audit-service.ts` — createAuditService(deps)
- Create: `packages/audit/src/masking.ts` — maskMetadata(metadata, config)
- Create: `packages/audit/src/hashing.ts` — computeAuditHash(previousHash, event)
- Create: `packages/audit/src/index.ts` — barrel export

**Dependencies**: AUD-01

**Reuse Assessment**: **30%** — factory pattern from LLM/MCP gateways; hash chaining is new.

**TDD Micro-Tasks**:
1. Red: `createAuditService(deps).emit(event)` returns Result.ok with currentHash
2. Green: Implement emit() with hash computation + store.insert()
3. Red: `emit()` with PII fields (email, phone) stores them unmasked
4. Green: Add `maskMetadata()` call before insert
5. Red: Two concurrent `emit()` calls produce same previousHash (chain broken)
6. Green: Add `store.lockChainHead(scope)` + `store.updateChainHead()` in transaction
7. Red: Store error during insert returns Result.err
8. Green: Wrap store calls in try/catch, return `{ _tag: 'PersistenceError' }`
9. Refactor: Extract pure `computeAuditHash()` into hashing.ts

**Interface Design**:

```typescript
export interface AuditEventInput {
  actor: { id: string; type: 'user' | 'system' | 'workflow' };
  action: string;
  resource: { type: string; id: string };
  domain?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditRecord {
  id: string;
  previousHash: string | null;
  currentHash: string;
  sequence: number;
  timestamp: Date;
}

export type AuditError =
  | { _tag: 'ValidationError'; message: string }
  | { _tag: 'PersistenceError'; operation: string; cause: unknown }
  | { _tag: 'ChainIntegrityError'; expected: string; actual: string };

export interface AuditStore {
  lockChainHead(scope: string): Promise<{ lastSeq: number; lastHash: string } | null>;
  updateChainHead(scope: string, seq: number, hash: string): Promise<void>;
  insert(record: InsertAuditLog): Promise<{ id: string }>;
}

export interface MaskingConfig {
  /** field names to redact (e.g., ['email', 'phone', 'ssn']) */
  redactFields: string[];
  /** field names to hash with salt (e.g., ['userId']) */
  hashFields: string[];
  /** salt for hashed fields */
  hashSalt: string;
}

export interface AuditServiceDeps {
  store: AuditStore;
  masking: MaskingConfig;
  chainScope?: string; // default: 'global'
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

export interface AuditService {
  emit(event: AuditEventInput): Promise<Result<AuditRecord, AuditError>>;
}
```

---

### Phase 2: Notification & Middleware (Days 5–8)

#### NOTIF-01: NotificationService Adapter (3 SP)

**Description**: Create `@aptivo/notifications` package with a generalized notification dispatch interface. Implements `NovuNotificationAdapter` that wraps the existing HITL-08 Novu pattern. Adds subscriber management, per-channel opt-out enforcement, and delivery retry logging.

**Acceptance Criteria**:
- [ac] `NotificationAdapter` interface: `send(params)`, `upsertSubscriber(id, data)`
- [ac] `NovuNotificationAdapter` implements the interface with SDK-decoupled `NovuClient` injection
- [ac] Per-channel opt-out: checks `NotificationPreferenceStore` before sending
- [ac] Delivery retry: transient failures retried up to 3 times with backoff
- [ac] Delivery logging: all attempts recorded via `DeliveryLogStore`
- [ac] `createNotificationService(deps)` factory returns `NotificationService`

**Files**:
- Create: `packages/notifications/package.json`, `packages/notifications/tsconfig.json`, `packages/notifications/vitest.config.ts`
- Create: `packages/notifications/src/types.ts` — interfaces and error types
- Create: `packages/notifications/src/notification-service.ts` — createNotificationService(deps)
- Create: `packages/notifications/src/adapters/novu-adapter.ts` — NovuNotificationAdapter
- Create: `packages/notifications/src/index.ts` — barrel export

**Dependencies**: None (independent of Audit tasks)

**Reuse Assessment**: **60%** — extends HITL-08 `novu-adapter.ts` pattern. `NovuClient` interface, `NovuTriggerPayload`, error handling all reusable.

**TDD Micro-Tasks**:
1. Red: `createNotificationService(deps).send(params)` returns Result.ok with deliveryId
2. Green: Implement dispatch pipeline: validate → check opt-out → adapter.send() → log delivery
3. Red: Send to opted-out user still delivers
4. Green: Add preference gate — check `preferenceStore.isOptedOut(userId, channel)` before send
5. Red: Transient failure on first attempt loses notification
6. Green: Add retry loop with configurable maxAttempts + exponential backoff
7. Red: Failed delivery not logged
8. Green: Add `deliveryLogStore.record()` for every attempt (success or failure)
9. Refactor: Extract `NovuNotificationAdapter` into adapters/ directory

**Interface Design**:

```typescript
export interface NotificationParams {
  recipientId: string;
  channel: 'email' | 'telegram' | 'push';
  templateSlug: string;
  templateVersion?: number;
  variables: Record<string, unknown>;
  transactionId?: string; // for dedup
  domain?: string;
}

export type NotificationError =
  | { _tag: 'DeliveryFailed'; message: string; cause: unknown; attempts: number }
  | { _tag: 'InvalidParams'; message: string }
  | { _tag: 'RecipientOptedOut'; recipientId: string; channel: string }
  | { _tag: 'TemplateNotFound'; slug: string; version?: number }
  | { _tag: 'RenderError'; message: string };

export interface NotificationAdapter {
  send(params: AdapterSendParams): Promise<Result<{ id: string }, NotificationError>>;
  upsertSubscriber(id: string, data: SubscriberData): Promise<Result<void, NotificationError>>;
}

export interface NotificationPreferenceStore {
  isOptedOut(userId: string, channel: string): Promise<boolean>;
  setOptOut(userId: string, channel: string, optedOut: boolean): Promise<void>;
}

export interface DeliveryLogStore {
  record(log: DeliveryLogEntry): Promise<void>;
}

export interface NotificationServiceDeps {
  adapter: NotificationAdapter;
  preferenceStore: NotificationPreferenceStore;
  deliveryLogStore: DeliveryLogStore;
  templateRegistry: TemplateRegistry;
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

export interface NotificationService {
  send(params: NotificationParams): Promise<Result<{ deliveryId: string }, NotificationError>>;
  upsertSubscriber(id: string, data: SubscriberData): Promise<Result<void, NotificationError>>;
  setOptOut(userId: string, channel: string, optedOut: boolean): Promise<Result<void, NotificationError>>;
}
```

---

#### NOTIF-02: Domain Template Registry (2 SP)

**Description**: Implement template variable substitution with Zod schema validation and domain-scoped template management. Uses `notification_templates` schema from database.md §4.6.

**Acceptance Criteria**:
- [ac] `notification_templates` Drizzle table implemented per database.md §4.6
- [ac] `notification_preferences` table: userId, channel, optedOut, updatedAt
- [ac] `notification_deliveries` table: id, notificationId, recipientId, channel, templateSlug, status, attempts, lastError, createdAt, deliveredAt
- [ac] `TemplateRegistry` interface: `resolve(slug, version?, channel?)` returns rendered template
- [ac] Variable substitution: safe `{{var}}` replacement with Zod schema validation per template
- [ac] Missing required variable → `RenderError`
- [ac] Channel-aware: different template bodies for email vs telegram

**Files**:
- Create: `packages/database/src/schema/notifications.ts` — templates, preferences, deliveries tables
- Modify: `packages/database/src/schema/index.ts`, `packages/database/src/index.ts`
- Create: `packages/notifications/src/templates/template-registry.ts` — TemplateRegistry
- Create: `packages/notifications/src/templates/template-renderer.ts` — safe {{var}} engine

**Dependencies**: NOTIF-01

**Reuse Assessment**: **40%** — template schema from database.md; substitution engine is new.

**TDD Micro-Tasks**:
1. Red: Import `notificationTemplates` from `@aptivo/database` — fails
2. Green: Define tables per database.md §4.6 + preferences + deliveries
3. Red: `templateRegistry.resolve('unknown-slug')` doesn't return TemplateNotFound
4. Green: Implement resolve() with store lookup + active version selection
5. Red: `render(template, { name: 'Alice' })` doesn't substitute `{{name}}`
6. Green: Implement safe regex-based `{{var}}` replacement
7. Red: `render(template, {})` with required variable doesn't error
8. Green: Add Zod schema validation — parse variables against template's schema before render
9. Refactor: Add channel-aware template selection (emailTemplate vs telegramTemplate)

**Schema Design**:

```typescript
// notification_preferences — per-user per-channel opt-out
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  channel: varchar('channel', { length: 50 }).notNull(),
  optedOut: boolean('opted_out').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('notification_prefs_user_channel_idx').on(table.userId, table.channel),
]);

// notification_deliveries — delivery attempt log
export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending', 'delivered', 'failed', 'retrying',
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
```

---

#### AUD-03: Audit Middleware (3 SP)

**Description**: Auto-emit audit events for state-changing API routes. Wire HITL decisions and RBAC role changes into the audit trail, completing FR-CORE-HITL-006.

**Acceptance Criteria**:
- [ac] `createAuditMiddleware(auditService)` HOC wraps route handlers for POST/PATCH/DELETE
- [ac] Auto-captures: actor (from auth context), action (HTTP method + route), resource (from request body/params), ipAddress, userAgent
- [ac] HITL `recordDecision` emits audit event with approver identity, decision, rationale, and original request context
- [ac] RBAC role grant/revoke emits audit event with granter, grantee, role, domain
- [ac] Audit failures are non-blocking (fire-and-forget with error logging)

**Files**:
- Create: `packages/audit/src/middleware/audit-middleware.ts` — createAuditMiddleware()
- Create: `packages/audit/src/middleware/action-mapper.ts` — maps HTTP methods to audit actions

**Dependencies**: AUD-02

**Reuse Assessment**: **20%** — middleware pattern is new; action mapping is bespoke.

**TDD Micro-Tasks**:
1. Red: POST request through middleware produces no audit event
2. Green: Implement middleware that extracts actor/action/resource and calls `auditService.emit()`
3. Red: HITL decision not audited with full context
4. Green: Add HITL-specific audit event builder — includes requestId, decision, comment, originalSummary
5. Red: RBAC role change not audited
6. Green: Add RBAC audit event builder — includes granterId, granteeId, role, domain, action (grant/revoke)
7. Red: Audit service error blocks the request
8. Green: Wrap `emit()` in fire-and-forget with `logger.warn()` on failure
9. Refactor: Extract action-mapper for HTTP method → audit action translation

---

### Phase 3: Reliability & Integration (Days 8–10)

#### AUD-04: Async Write + DLQ (2 SP)

**Description**: Wrap audit writes in an Inngest function for non-blocking execution (T1-W21). Implement DLQ for failed writes with bounded retries and exponential backoff.

**Acceptance Criteria**:
- [ac] API calls `inngest.send('audit/event.published', { data: auditEventInput })`
- [ac] Inngest function `processAuditEvent` calls `auditService.emit()` as durable step
- [ac] 5s publish timeout budget — non-blocking on caller
- [ac] Failure after 3 retries persists to `audit_write_dlq` table
- [ac] Inngest reprocessor function `replayDlqEvents` processes DLQ entries with exponential backoff
- [ac] High-priority alert when DLQ count exceeds threshold (wiring deferred to Sprint 5 INT-04)

**Files**:
- Create: `packages/audit/src/async/async-audit-writer.ts` — createAsyncAuditWriter(inngest, auditService)
- Create: `packages/audit/src/async/dlq-processor.ts` — DLQ replay Inngest function
- Create: `packages/audit/src/async/event-schemas.ts` — Zod schemas for audit events (same pattern as MCP-09)

**Dependencies**: AUD-02, Inngest

**Reuse Assessment**: **40%** — Inngest function pattern from SP-02; event validation from MCP-09 `createValidatedSender()`.

**TDD Micro-Tasks**:
1. Red: `asyncWriter.emit(event)` blocks for > 100ms
2. Green: Implement fire-and-forget `inngest.send()` with 5s timeout via `Promise.race`
3. Red: Inngest function doesn't call `auditService.emit()`
4. Green: Implement `processAuditEvent` Inngest function with `step.run('write-audit', () => auditService.emit(data))`
5. Red: Failed write after 3 retries vanishes
6. Green: Add DLQ persistence on retry exhaustion — insert into `audit_write_dlq`
7. Red: DLQ entries never reprocessed
8. Green: Implement `replayDlqEvents` scheduled function with exponential backoff
9. Refactor: Add `createValidatedSender()` pattern for audit event schema validation

---

#### AUD-05: Audit Unit Tests (2 SP)

**Description**: Comprehensive test suite for audit service including hash chaining correctness, PII masking, concurrent write safety, DLQ behavior, and middleware integration.

**Acceptance Criteria**:
- [ac] Hash chaining: sequential events produce valid chain; chain break detected
- [ac] PII masking: configured fields are redacted/hashed; unconfigured fields pass through
- [ac] Concurrent writes: serialized via chain head locking (mock store verifies lock-before-read pattern)
- [ac] DLQ: failed writes persisted; replay function processes entries correctly
- [ac] Middleware: POST/PATCH/DELETE produce audit events; GET does not; failures non-blocking
- [ac] Coverage: 80%+ across all audit modules

**Files**:
- Create: `packages/audit/tests/aud-02-write-path.test.ts`
- Create: `packages/audit/tests/aud-03-middleware.test.ts`
- Create: `packages/audit/tests/aud-04-async-dlq.test.ts`

**Dependencies**: AUD-01 through AUD-04

---

#### NOTIF-03: Notification Tests + HITL Migration (2 SP)

**Description**: Test suite for notification service + compatibility shim to route existing HITL-08 notifications through the new NotificationService.

**Acceptance Criteria**:
- [ac] Email + telegram channel delivery via NovuNotificationAdapter
- [ac] Per-channel opt-out enforcement (opted-out user → RecipientOptedOut error)
- [ac] Delivery retry: transient failure → retry up to 3 times → log all attempts
- [ac] Template rendering: valid substitution, missing variable error, channel-aware
- [ac] HITL compatibility: `createSendNotification()` routes through NotificationService
- [ac] Coverage: 80%+ across all notification modules

**Files**:
- Create: `packages/notifications/tests/notif-01-service.test.ts`
- Create: `packages/notifications/tests/notif-02-templates.test.ts`
- Create: `packages/notifications/tests/notif-03-hitl-compat.test.ts`

**Dependencies**: NOTIF-01, NOTIF-02

---

### Sprint 3 Carry-Forward (Parallel Track)

#### CF-04: Data Deletion Inngest Wrapper (1 SP)

**Description**: Wrap `executeDataDeletion()` from `@aptivo/mcp-layer/workflows` in Inngest function with `step.run()` calls per deletion step. Closes S4-W9.

**Acceptance Criteria**:
- [ac] Inngest function `processDataDeletion` calls `executeDataDeletion(userId, deps)` with each step wrapped in `step.run()`
- [ac] Step checkpoints enable recovery on partial failure
- [ac] Event schema validated via `createValidatedSender()` pattern

**Files**:
- Create: `packages/mcp-layer/src/workflows/data-deletion-function.ts`

**Dependencies**: MCP-10 (existing)

---

#### CF-05: Scanner Circuit Breaker + Error Classification Wiring (1.5 SP)

**Description**: Compose `CircuitBreaker` around `ClamAvScanner.scan()` for production resilience. Wire `classifyMcpError()` into `CircuitBreakerRegistry` config via `shouldRecordFailure`.

**Acceptance Criteria**:
- [ac] `createResilientScanner(scanner, breaker)` wraps scan calls with circuit breaker
- [ac] Scanner timeout/unavailable → circuit breaker records failure; clean/infected results → no recording
- [ac] MCP wrapper's `CircuitBreakerRegistry` uses `shouldRecordFailure: (err) => classifyMcpError(err) === 'transient'`

**Files**:
- Create: `packages/file-storage/src/scanner/resilient-scanner.ts`
- Modify: `packages/mcp-layer/src/wrapper/mcp-wrapper.ts` — wire shouldRecordFailure

**Dependencies**: FS-03 (existing), MCP-04 (existing)

---

## 2. Dependency Graph

```
Phase 1 (Days 1-4):
  AUD-01 ─────→ AUD-02 ─────→ AUD-03 (Phase 2)
                    │
                    └────────→ AUD-04 (Phase 3)
                                  │
                                  └→ AUD-05

Phase 2 (Days 5-8):
  NOTIF-01 ────→ NOTIF-02 ───→ NOTIF-03 (Phase 3)

Parallel (Days 1-10):
  CF-04 (independent)
  CF-05 (independent)
```

**Critical path**: AUD-01 → AUD-02 → AUD-03 → AUD-05
**Parallel tracks**: NOTIF-* is fully independent of AUD-*. CF-* items are independent of both.

### Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | AUD-01 (2), AUD-02 (3), AUD-04 (2), CF-04 (1) | 8 |
| **Web Dev 1** | AUD-03 (3), AUD-05 (2), CF-05 (1.5) | 6.5 |
| **Web Dev 2** | NOTIF-01 (3), NOTIF-02 (2), NOTIF-03 (2) | 7 |
| **Total** | | **21.5 SP** |

---

## 3. Architectural Decisions

### Q1: Hash Chaining Concurrency

**Decision**: Global chain scope with row-level locking.

`audit_chain_heads` has a single row with `chain_scope = 'global'`. Before each write:

```sql
SELECT last_seq, last_hash FROM audit_chain_heads WHERE chain_scope = 'global' FOR UPDATE;
-- compute: current_hash = sha256(last_hash + event_data)
INSERT INTO audit_logs (..., previous_hash, current_hash);
UPDATE audit_chain_heads SET last_seq = last_seq + 1, last_hash = current_hash;
COMMIT;
```

The `FOR UPDATE` lock serializes concurrent writes within a single transaction. This is correct for Sprint 4 volumes. If contention appears, partition by domain in Sprint 5.

### Q2: Async Write Architecture

**Decision**: Inngest durable functions.

```
API → inngest.send('audit/event.published') → [Inngest] → processAuditEvent → auditService.emit()
                                                              ↓ (on failure)
                                                         audit_write_dlq → replayDlqEvents
```

- Inngest provides durable retries and is consistent with the platform's existing async patterns (HITL-07, MCP-10)
- BullMQ rejected: adds infrastructure dependency not already present
- Pure fire-and-forget rejected: compliance logs cannot tolerate silent loss

### Q3: DLQ Implementation

**Decision**: Postgres-backed `audit_write_dlq` table.

- Failed writes after 3 Inngest retries → persist full payload + error + retry metadata
- `replayDlqEvents` Inngest cron function processes pending entries with exponential backoff
- Alert threshold wiring deferred to Sprint 5 (INT-04 / S5-W16)

### Q4: HITL-08 Migration Strategy

**Decision**: Compatibility shim.

- Keep `hitl-gateway/src/notifications/` public API unchanged
- Internally, `createSendNotification()` routes to `NotificationService.send()` with HITL-specific template
- HITL tests continue passing without modification
- Full migration (remove shim, direct NotificationService usage) in Sprint 5

### Q5: Template Variable Substitution

**Decision**: Safe `{{var}}` with Zod validation.

```typescript
function renderTemplate(body: string, variables: Record<string, unknown>, schema: z.ZodSchema): Result<string, RenderError> {
  const parsed = schema.safeParse(variables);
  if (!parsed.success) return Result.err({ _tag: 'RenderError', message: formatZodError(parsed.error) });
  return Result.ok(body.replace(/\{\{(\w+)\}\}/g, (_, key) => String(parsed.data[key] ?? '')));
}
```

- No eval/expression support (security)
- Channel-aware: email templates may include HTML; telegram uses markdown
- Missing required variable → `RenderError` (not silent empty string)

### Q6: PII Masking

**Decision**: Config-driven field-level masking.

```typescript
const DEFAULT_MASKING: MaskingConfig = {
  redactFields: ['email', 'phone', 'ssn', 'address', 'dateOfBirth'],
  hashFields: [],
  hashSalt: process.env.AUDIT_MASK_SALT ?? 'aptivo-audit-mask',
};
```

- Redacted fields → `'[REDACTED]'`
- Hashed fields → `sha256(salt + value)` (for correlation without exposure)
- Applied recursively to nested metadata objects
- `masking_version` tracking deferred to Sprint 5

---

## 4. Sprint 3 Carry-Forward Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| Data deletion Inngest wrapper | 1 | **Absorb** | Directly closes S4-W9; ~30 LOC |
| Scanner circuit breaker wiring | 1 | **Absorb** | Small hardening; composes existing code |
| `classifyMcpError` wiring | 0.5 | **Absorb** | Single-line config change |
| `AgentKitTransportAdapter` | 3 | **Defer → Sprint 5** | External SDK dep; integration scope |
| `S3StorageAdapter` | 3 | **Defer → Sprint 5** | External SDK dep; infrastructure testing |

**Total absorbed**: 2.5 SP. Sprint 4 total: 21.5 SP (71.6% capacity). Buffer preserved per phase-1-sprint-plan.md design.

---

## 5. Package Structure

```
packages/
├── audit/                    # @aptivo/audit (NEW)
│   ├── src/
│   │   ├── types.ts          # AuditEventInput, AuditRecord, AuditError, AuditStore, MaskingConfig
│   │   ├── audit-service.ts  # createAuditService(deps)
│   │   ├── hashing.ts        # computeAuditHash() — pure function
│   │   ├── masking.ts        # maskMetadata() — pure function
│   │   ├── middleware/
│   │   │   ├── audit-middleware.ts   # createAuditMiddleware()
│   │   │   └── action-mapper.ts     # HTTP method → audit action
│   │   ├── async/
│   │   │   ├── async-audit-writer.ts # createAsyncAuditWriter(inngest)
│   │   │   ├── dlq-processor.ts      # DLQ replay Inngest function
│   │   │   └── event-schemas.ts      # Zod schemas for audit events
│   │   └── index.ts
│   └── tests/
│       ├── aud-02-write-path.test.ts
│       ├── aud-03-middleware.test.ts
│       └── aud-04-async-dlq.test.ts
│
└── notifications/            # @aptivo/notifications (NEW)
    ├── src/
    │   ├── types.ts          # NotificationParams, NotificationError, interfaces
    │   ├── notification-service.ts  # createNotificationService(deps)
    │   ├── adapters/
    │   │   └── novu-adapter.ts      # NovuNotificationAdapter
    │   ├── templates/
    │   │   ├── template-registry.ts # TemplateRegistry
    │   │   └── template-renderer.ts # safe {{var}} engine
    │   └── index.ts
    └── tests/
        ├── notif-01-service.test.ts
        ├── notif-02-templates.test.ts
        └── notif-03-hitl-compat.test.ts
```

**Export paths**:
- `@aptivo/audit`: `.` (types + service), `/middleware`, `/async`
- `@aptivo/notifications`: `.` (types + service), `/adapters`, `/templates`

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hash chain lock contention under load | Low | Medium | Global scope with single writer; monitor lock wait time; partition by domain in Sprint 5 if needed |
| Inngest delay for compliance-critical audit logs | Medium | Medium | Monitor "time to audit" latency; DLQ ensures no silent loss; alert if > 10s |
| HITL notification regression during migration | Low | High | Compatibility shim preserves public API; existing HITL tests run unmodified |
| Template injection via {{var}} | Low | High | No eval; regex-only substitution; Zod schema validates variable types |
| DLQ accumulation without alerting | Medium | Medium | Schema + replay function in Sprint 4; alert wiring in Sprint 5 (INT-04) |

---

## 7. Definition of Done

- [ ] All state-changing actions produce immutable audit events *(FR-CORE-AUD-001)*
- [ ] Audit events are tamper-evident via SHA-256 hash chaining *(FR-CORE-AUD-001)*
- [ ] PII auto-masked in audit metadata based on configuration *(FR-CORE-AUD-001)*
- [ ] HITL decisions and RBAC role changes are audited with full context *(FR-CORE-HITL-006)*
- [ ] Audit writes are async with DLQ fallback *(T1-W21)*
- [ ] Platform notification service sends via email + chat *(FR-CORE-NOTIF-001)*
- [ ] Domain-scoped notification templates with Zod-validated variable substitution *(FR-CORE-NOTIF-001)*
- [ ] Users can opt out of notifications by channel *(FR-CORE-NOTIF-001)*
- [ ] Delivery failures retried and logged *(FR-CORE-NOTIF-001)*
- [ ] HITL notifications routed through NotificationService (compatibility shim) *(FR-CORE-HITL-006)*
- [ ] Sprint 3 carry-forward: data deletion Inngest wrapper, scanner CB, classifyMcpError wiring
- [ ] 80%+ test coverage across all new packages
