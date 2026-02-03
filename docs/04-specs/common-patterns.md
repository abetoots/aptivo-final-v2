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

## 5. Event Bus Patterns (NATS JetStream)

### 5.1 Subject Naming Convention

All events follow the pattern: `{domain}.{entity}.{action}`

```
aptivo.candidate.created
aptivo.candidate.status-changed
aptivo.interview.scheduled
aptivo.contract.signed
aptivo.workflow.triggered
aptivo.workflow.step-completed
```

### 5.2 JetStream Configuration

```typescript
// stream configuration for domain events
const STREAMS = {
  APTIVO_EVENTS: {
    name: 'APTIVO_EVENTS',
    subjects: ['aptivo.>'],
    retention: 'limits' as const,
    maxAge: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
    maxBytes: 1024 * 1024 * 1024, // 1GB
    storage: 'file' as const,
    replicas: 3,
    duplicates: 60_000_000_000, // 60 second dedup window
  },
};

// consumer configuration for services
const createConsumerConfig = (serviceName: string, filterSubject: string) => ({
  durable_name: `${serviceName}-consumer`,
  filter_subject: filterSubject,
  ack_policy: 'explicit' as const,
  ack_wait: 30_000_000_000, // 30 seconds
  max_deliver: 5,
  deliver_policy: 'all' as const,
});
```

### 5.3 Event Schemas (JSON Schema)

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
| User permissions | 15 min | Security-sensitive, moderate TTL |
| IdP JWKS | 1 hour | Rarely changes, expensive to fetch |

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
| Result Testing | 05c-ReaderResult-Guide.md | Full Guide |
| Event Patterns | hr/workflow-automation.md | Event Catalog |
