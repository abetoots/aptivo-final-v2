---
id: TSD-CORE-PATTERNS
title: Common Patterns Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
parent: ../03-architecture/platform-core-add.md
---
# Common Patterns Specification

---

## 1. Service Dependencies Interface

All service modules define dependencies explicitly using the dependency injection pattern:

```typescript
// common base dependencies - every service extends this
interface BaseDependencies {
  logger: Logger;
  cache: CacheClient;
  eventBus: EventBus;
}

interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

interface CacheClient {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
}

interface EventBus {
  publish<T>(subject: string, payload: T): Promise<void>;
  subscribe<T>(subject: string, handler: (payload: T) => Promise<void>): Promise<Subscription>;
}

interface Subscription {
  unsubscribe(): Promise<void>;
}
```

---

## 2. Result Type

All service operations return a `Result` type for explicit error handling:

```typescript
// discriminated union result type
type Result<T, E> = Success<T> | Failure<E>;

interface Success<T> {
  ok: true;
  value: T;
}

interface Failure<E> {
  ok: false;
  error: E;
}

// helper constructors
const ok = <T>(value: T): Success<T> => ({ ok: true, value });
const err = <E>(error: E): Failure<E> => ({ ok: false, error });

// type guard
const isOk = <T, E>(result: Result<T, E>): result is Success<T> => result.ok;
const isErr = <T, E>(result: Result<T, E>): result is Failure<E> => !result.ok;
```

---

## 3. Common Error Types

All services use these base error types as discriminated unions:

```typescript
// validation errors - client can fix
type ValidationError = {
  _tag: 'ValidationError';
  field: string;
  message: string;
  code?: string;
};

// entity not found
type NotFoundError = {
  _tag: 'NotFoundError';
  entity: string;
  id: string;
};

// duplicate/conflict
type DuplicateError = {
  _tag: 'DuplicateError';
  entity: string;
  field: string;
  value: string;
};

// database/persistence errors
type PersistenceError = {
  _tag: 'PersistenceError';
  operation: 'read' | 'write' | 'delete';
  cause: unknown;
};

// external service errors
type NetworkError = {
  _tag: 'NetworkError';
  service: string;
  operation: string;
  cause: unknown;
};

// timeout errors
type TimeoutError = {
  _tag: 'TimeoutError';
  service: string;
  timeoutMs: number;
};

// authorization errors
type AuthorizationError = {
  _tag: 'AuthorizationError';
  action: string;
  resource: string;
  reason: string;
};

// common base error union
type BaseError =
  | ValidationError
  | NotFoundError
  | DuplicateError
  | PersistenceError
  | NetworkError
  | TimeoutError
  | AuthorizationError;
```

---

## 4. API Error Mapping (RFC 7807)

All API endpoints map service errors to HTTP responses following RFC 7807 Problem Details:

```typescript
interface ProblemDetails {
  type: string;        // URI identifying error type
  title: string;       // human-readable summary
  status: number;      // HTTP status code
  detail?: string;     // human-readable explanation
  instance?: string;   // URI to specific occurrence
  traceId?: string;    // correlation ID for debugging
  // extension fields per error type
  field?: string;      // for ValidationError
  entity?: string;     // for NotFoundError
}

// error type URIs (relative to API base)
const ERROR_TYPES = {
  VALIDATION: '/errors/validation',
  NOT_FOUND: '/errors/not-found',
  DUPLICATE: '/errors/duplicate',
  INTERNAL: '/errors/internal',
  NETWORK: '/errors/external-service',
  TIMEOUT: '/errors/timeout',
  UNAUTHORIZED: '/errors/unauthorized',
  FORBIDDEN: '/errors/forbidden',
} as const;
```

### Error to HTTP Status Mapping

| Error Type | HTTP Status | Response Body |
|------------|-------------|---------------|
| ValidationError | 400 | `{ type, title, status, detail, field }` |
| NotFoundError | 404 | `{ type, title, status, entity, instance }` |
| DuplicateError | 409 | `{ type, title, status, detail }` |
| AuthorizationError | 403 | `{ type, title, status, detail }` |
| PersistenceError | 500 | `{ type, title, status, traceId }` (log actual error) |
| NetworkError | 502 | `{ type, title, status, detail }` |
| TimeoutError | 504 | `{ type, title, status, detail }` |

---

## 5. Event Patterns

> **Phase 1:** Inngest handles all event-driven workflow orchestration. The event envelope and naming conventions below are transport-agnostic and apply regardless of the underlying event system.
> **Phase 2+:** If inter-service pub/sub beyond Inngest is needed, evaluate NATS JetStream or similar.

### 5.1 Event Naming Convention

All events follow the pattern: `{domain}.{entity}.{action}`

```
aptivo.candidate.created
aptivo.candidate.status-changed
aptivo.interview.scheduled
aptivo.contract.signed
aptivo.workflow.triggered
aptivo.workflow.step-completed
```

### 5.2 Event Schemas

All events must include a standard envelope:

```typescript
// event envelope schema
interface EventEnvelope<T> {
  id: string;           // ULID for ordering
  type: string;         // event type (subject)
  source: string;       // originating service
  time: string;         // ISO 8601 timestamp
  dataContentType: 'application/json';
  data: T;              // domain-specific payload
  correlationId?: string;
  causationId?: string;
}

// example: candidate status changed
interface CandidateStatusChangedPayload {
  candidateId: string;
  previousStatus: CandidateStatus;
  newStatus: CandidateStatus;
  changedBy: string;
  reason?: string;
}

// zod schema for validation
import { z } from 'zod';

const EventEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    id: z.string().ulid(),
    type: z.string(),
    source: z.string(),
    time: z.string().datetime(),
    dataContentType: z.literal('application/json'),
    data: dataSchema,
    correlationId: z.string().optional(),
    causationId: z.string().optional(),
  });

const CandidateStatusChangedSchema = EventEnvelopeSchema(
  z.object({
    candidateId: z.string().uuid(),
    previousStatus: CandidateStatusSchema,
    newStatus: CandidateStatusSchema,
    changedBy: z.string().uuid(),
    reason: z.string().optional(),
  })
);
```

### 5.3 Event Schema Compatibility Rules

**Compatibility Mode**: All event schemas follow **backward-compatible evolution** by default.

**What is a non-breaking change** (allowed within same event name):
- Adding a new **optional** field with a default value
- Adding a new optional field to the `data` payload
- Adding a new event type to the catalog
- Widening a type (e.g., string enum → string)

**What is a breaking change** (requires new event name with version suffix):
- Removing a field from the envelope or data payload
- Renaming a field
- Changing a field's type (e.g., string → number)
- Adding a new **required** field
- Changing the semantics of an existing field (e.g., `status` values change meaning)

**Breaking change process**:
1. Create new event name with version suffix (e.g., `aptivo.candidate.status-changed.v2`)
2. Publish both old and new events during migration window
3. Consumers subscribe to new event and verify
4. Deprecate old event after all consumers migrated (minimum 30 days)
5. Remove old event publishing after deprecation period

**Rollout order**: Consumer-first for backward-compatible changes; for breaking changes (new event name), deploy consumers that handle both old and new events first, then deploy producer with new event.

**Rollback safety**: All non-breaking changes are inherently rollback-safe (old consumers ignore new optional fields). Breaking changes use dual-publishing, so rolling back the producer resumes old event format; consumers already handle both.

**Schema validation**: All event payloads SHOULD be validated with Zod schemas at publish time. Invalid payloads are logged as errors and dropped (not published) to prevent schema drift. See §5.2 for schema definitions.

**Dead-letter handling**: Events that fail consumer processing after Inngest retry exhaustion are logged with full payload to the audit trail as `system.event.dlq` events for manual investigation. Alerting triggers on DLQ event rate > 0 for any event type.

> **Phase 1 note**: Phase 1 is a monolith — producer and consumer deploy atomically. Schema compatibility rules are documented now to establish conventions and enable safe Phase 2 service decomposition.

### 5.4 Event Catalog

| Event | Payload Fields | Publishers | Subscribers |
|-------|---------------|------------|-------------|
| `aptivo.candidate.created` | candidateId, email, source | Candidate Service | Analytics, Email |
| `aptivo.candidate.status-changed` | candidateId, previousStatus, newStatus, changedBy | Candidate Service | Email, Workflow Engine |
| `aptivo.interview.scheduled` | interviewId, candidateId, scheduledAt, interviewers | Interview Service | Calendar, Email |
| `aptivo.interview.completed` | interviewId, candidateId, outcome | Interview Service | Candidate Service, Analytics |
| `aptivo.contract.generated` | contractId, candidateId, type | Contract Service | Email |
| `aptivo.contract.signed` | contractId, candidateId, signedAt | Contract Service | HR, Payroll (future) |
| `aptivo.workflow.triggered` | workflowId, triggerId, context | Workflow Engine | Workflow Engine |
| `aptivo.workflow.step-completed` | workflowId, stepId, result | Workflow Engine | Workflow Engine, Analytics |

---

## 6. Cache Patterns

### 6.1 Key Naming Convention

```
{service}:{entity}:{id}
{service}:{entity}:list:{hash}
{service}:stats:{period}
```

Examples:
- `candidate:profile:01HXYZ123` - single entity
- `candidate:list:abc123def` - list query (hash of query params)
- `candidate:stats:2025-01` - aggregation

### 6.2 Cache Invalidation

```typescript
// invalidation patterns
interface CacheInvalidation {
  // on entity update, invalidate entity + related lists
  onEntityUpdate(entity: string, id: string): Promise<void>;
  // on entity delete, invalidate entity + related lists
  onEntityDelete(entity: string, id: string): Promise<void>;
}

// implementation
const invalidateCandidate = async (cache: CacheClient, candidateId: string) => {
  await Promise.all([
    cache.del(`candidate:profile:${candidateId}`),
    cache.invalidatePattern('candidate:list:*'),
    cache.invalidatePattern('candidate:stats:*'),
  ]);
};
```

### 6.3 TTL Standards

| Cache Type | TTL | Rationale |
|------------|-----|-----------|
| Entity by ID | 10 min | Balance freshness with performance |
| List queries | 5 min | Lists change more frequently |
| Stats/aggregations | 1 hour | Expensive to compute, acceptable staleness |
| User permissions | 5 min | Security-sensitive, tight TTL (ADD §5.6.1) |
| IdP JWKS | 1 hour | Rarely changes, expensive to fetch |

### 6.4 Stale-Read Behavior

Every cache layer must document what happens when cached data is stale or the cache source is unavailable.

| Cache Type | On Cache Miss | On Redis Unavailable | Freshness SLO |
|------------|---------------|---------------------|---------------|
| Entity by ID | Fetch from PostgreSQL | **Bypass cache** — query database directly | Data ≤ 10 min stale; event-driven invalidation reduces typical staleness to seconds |
| List queries | Fetch from PostgreSQL | **Bypass cache** — query database directly | Data ≤ 5 min stale |
| Stats/aggregations | Recompute from database | **Bypass cache** — recompute (expensive but acceptable) | Data ≤ 1 hour stale |
| User permissions | Fetch from PostgreSQL | **Bypass cache** — query database directly | Data ≤ 5 min stale; **accepted risk**: revoked permissions propagate within 5 min (ADD §5.6.1). For immediate revocation (admin removal), use explicit cache purge via `invalidatePattern('*:permissions:*')` |
| IdP JWKS | Fetch from Supabase | **Serve stale** for up to 24h (stale-if-error) | Data ≤ 1 hour fresh; 24h grace on IdP outage |

> **Permission Cache Security Note**: In-memory permission caching (p-memoize, 5 min TTL per Coding Guidelines §4.6) means a revoked user retains access for up to 5 minutes. For HITL approvers, this is an accepted Phase 1 risk. Phase 2: add event-driven invalidation on `role.updated` / `role.deleted` events to clear the in-memory cache immediately.

> **Cold Start Behavior**: All caches use cache-aside (lazy population). After deployment or Redis restart, caches are empty. First requests for each key hit the database, causing temporarily elevated database load. Critical caches (JWKS) are populated on first auth request. No pre-warming is required in Phase 1.

---

## 7. Retry Patterns

### 7.1 Exponential Backoff

```typescript
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// calculate delay for attempt n (0-indexed)
const calculateDelay = (attempt: number, config: RetryConfig): number => {
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
};
```

### 7.2 Service-Specific Retry Policies

| Service | Max Attempts | Base Delay | Max Delay | Notes |
|---------|--------------|------------|-----------|-------|
| Payment Gateway | 3 | 1s | 10s | Idempotency key required |
| Email Service | 2 | 500ms | 2s | Non-critical, fail gracefully |
| Calendar Service | 1 | - | - | User-initiated, no retry |
| File Storage | 3 | 2s | 15s | Linear backoff |
| Accounting Sync | 5 | 5s | 60s | Async queue, can wait |

---

## 8. Saga Patterns

For distributed transactions, use the saga pattern with compensating actions.

### 8.1 Saga Definition (YAML)

```yaml
# example: candidate hiring saga
name: candidate-hiring
version: 1.0.0
description: Orchestrates the candidate hiring process

steps:
  - name: create-contract
    service: contract-service
    action: createContract
    input:
      candidateId: "{{ trigger.candidateId }}"
      type: "{{ trigger.contractType }}"
      salary: "{{ trigger.salary }}"
    output: contractId
    compensate:
      action: voidContract
      input:
        contractId: "{{ steps.create-contract.contractId }}"

  - name: send-offer
    service: email-service
    action: sendOfferEmail
    depends_on: [create-contract]
    input:
      candidateId: "{{ trigger.candidateId }}"
      contractId: "{{ steps.create-contract.contractId }}"
    # no compensation - email already sent

  - name: update-candidate-status
    service: candidate-service
    action: updateStatus
    depends_on: [send-offer]
    input:
      candidateId: "{{ trigger.candidateId }}"
      status: "offer"
    compensate:
      action: updateStatus
      input:
        candidateId: "{{ trigger.candidateId }}"
        status: "{{ trigger.previousStatus }}"

timeout: 300s  # 5 minutes total saga timeout
```

### 8.2 Saga Execution States

| State | Description | Transitions |
|-------|-------------|-------------|
| `pending` | Saga created, not started | → `running` |
| `running` | Steps executing | → `completed`, `compensating`, `failed` |
| `completed` | All steps succeeded | (terminal) |
| `compensating` | Rolling back due to failure | → `compensated`, `failed` |
| `compensated` | All compensations succeeded | (terminal) |
| `failed` | Unrecoverable failure | (terminal, requires manual intervention) |

### 8.3 Checkpoint and Recovery

Every saga executes as an Inngest function where each step maps to a `step.run()` call. Inngest checkpoints the result of each step, providing automatic crash recovery.

**Checkpoint Boundaries** (using candidate-hiring example):

| Step | Inngest Checkpoint | Side Effect | Data at Risk on Crash | Recovery |
|------|-------------------|-------------|----------------------|----------|
| `create-contract` | After `step.run('create-contract', ...)` returns | Contract row in DB | None — step result is checkpointed | Resume from checkpoint; contract is idempotent via deterministic ID |
| `send-offer` | After `step.run('send-offer', ...)` returns | Email sent via Novu | Between contract creation and email: contract exists but email not sent | Inngest retries `send-offer` step; Novu `transactionId` deduplicates |
| `update-candidate-status` | After `step.run('update-status', ...)` returns | Status updated in DB | Between email and status update: email sent but status stale | Inngest retries; status update is idempotent |

**Crash During Compensation**: If the process crashes during the compensation phase (rolling back a failed saga), Inngest resumes compensation from the last completed compensation step. Each compensation action must be idempotent.

**Stuck Saga Detection**: Monitor for sagas in `running` or `compensating` state exceeding the `timeout` (300s). Alert via Inngest function failure webhook or periodic Inngest dashboard check. Manual intervention: use Inngest dashboard to cancel or replay the stuck function.

**State Storage**: Inngest Cloud manages all saga state (step results, compensation progress). The application's PostgreSQL stores the business outcome (contract, candidate status) as the projection of completed steps.

---

## 9. Pagination Patterns

### 9.1 Default Sort Order for Stable Pagination

All cursor-paginated endpoints use a default sort order of `createdAt DESC, id ASC` (newest first, with `id` as tie-breaker for records with identical timestamps).

**Rationale**:
- `createdAt DESC` provides natural "newest first" ordering that users expect
- `id ASC` provides deterministic ordering for records created within the same timestamp (PostgreSQL timestamp precision may cause ties)
- Cursor encodes both `createdAt` and `id` to ensure stable pagination across pages

**Index requirement**: All paginated tables must have a composite index on `(created_at DESC, id ASC)` for efficient cursor-based queries.

**Override**: Endpoints that support explicit `sort` parameters may override the default. When sorting by a non-unique field, `id` is always appended as the final tie-breaker.

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Result Types | platform-core-frd.md | Section 4.2 (Error Handling Philosophy) |
| Event Bus | platform-core-frd.md | FR-CORE-WFE-004 (Trigger Types) |
| Saga Pattern | platform-core-frd.md | FR-CORE-WFE-005 (Failure Handling) |
| Caching | platform-core-add.md | Section 5 (Infrastructure) |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Result Usage | 05a-Coding-Guidelines.md | Error Handling |
| Result Testing | 05b-Testing-Strategies.md | Testing Guide |
| Event Patterns | hr/workflow-automation.md | Event Catalog |
