---
id: TSD-CORE-AUDIT
title: Audit Service Technical Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-03-12'
parent: ../../03-architecture/platform-core-add.md
---
# Audit Service Technical Specification

**Package**: `@aptivo/audit`
**ADD Reference**: [platform-core-add.md](../../03-architecture/platform-core-add.md) §9, §14.3

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-03-12 | Initial TSD — extracted from ADD §9 and implementation |

---

## 1. Overview

The audit service provides tamper-evident, append-only logging with hash chaining for integrity verification, PII masking, and dead-letter queue (DLQ) support for failed async writes. It is a core platform service — all state-changing operations across domains emit audit events.

**Key properties**:
- Append-only: no UPDATE or DELETE on `audit_logs` table
- Hash-chained: each entry includes `previousHash` and `currentHash` for sequential integrity
- Serialized: `SELECT ... FOR UPDATE` on chain heads prevents concurrent write races
- PII-masked: configurable field-level redaction before persistence
- DLQ-backed: failed async writes are queued for exponential-backoff retry

---

## 2. Service Interface

### 2.1 AuditService

```typescript
interface AuditService {
  emit(event: AuditEventInput): Promise<Result<AuditRecord, AuditError>>;
}
```

**Factory**: `createAuditService(deps: AuditServiceDeps): AuditService`

```typescript
interface AuditServiceDeps {
  store: AuditStore;
  masking: MaskingConfig;
  chainScope?: string; // default: 'global'
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}
```

### 2.2 AuditEventInput

```typescript
interface AuditEventInput {
  actor: { id: string; type: 'user' | 'system' | 'workflow' };
  action: string;
  resource: { type: string; id: string };
  domain?: string;        // 'crypto' | 'hr' | 'core'
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
```

### 2.3 AuditRecord (returned on success)

```typescript
interface AuditRecord {
  id: string;
  previousHash: string | null;
  currentHash: string;
  sequence: number;
  timestamp: Date;
}
```

### 2.4 AuditError (tagged union)

```typescript
type AuditError =
  | { _tag: 'ValidationError'; message: string }
  | { _tag: 'PersistenceError'; operation: string; cause: unknown }
  | { _tag: 'ChainIntegrityError'; expected: string; actual: string };
```

---

## 3. Store Interface

### 3.1 AuditStore

```typescript
interface AuditStore {
  lockChainHead(scope: string): Promise<ChainHead | null>;
  updateChainHead(scope: string, seq: number, hash: string): Promise<void>;
  insert(record: InsertAuditLog): Promise<{ id: string }>;
}
```

> **Transaction contract**: implementations MUST run `lockChainHead → insert → updateChainHead` within a single database transaction. The Drizzle adapter provides `withTransaction()` for this purpose.

### 3.2 TransactionalAuditStore

```typescript
interface TransactionalAuditStore extends AuditStore {
  withTransaction<T>(fn: (store: AuditStore) => Promise<T>): Promise<T>;
}
```

### 3.3 ChainHead

```typescript
interface ChainHead {
  lastSeq: number;
  lastHash: string;
}
```

### 3.4 InsertAuditLog

```typescript
interface InsertAuditLog {
  userId: string | null;
  actorType: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  domain?: string | null;
  metadata: Record<string, unknown> | null;
  previousHash: string | null;
  currentHash: string;
}
```

---

## 4. Hash Chaining

Each audit log entry computes `currentHash` from:
- The `previousHash` (from chain head, or `null` for first entry)
- The entry's content fields (actor, action, resource, metadata, timestamp)

**Chain integrity verification**: sequential reads can verify `entry[n].previousHash === entry[n-1].currentHash`. Breaks indicate tampering or missed entries.

**Serialization**: `lockChainHead(scope)` acquires a row-level lock via `SELECT ... FOR UPDATE` on `audit_chain_heads`. This ensures only one writer proceeds at a time per chain scope.

**Auto-seeding**: if no chain head exists for a scope, the first write creates the initial entry with `lastSeq = 0`.

**Hash function**: `computeAuditHash()` — exported from `@aptivo/audit` for external verification.

---

## 5. PII Masking

### 5.1 MaskingConfig

```typescript
interface MaskingConfig {
  redactFields: string[];  // replaced with '[REDACTED]'
  hashFields: string[];    // replaced with HMAC hash
  hashSalt: string;
}
```

### 5.2 DEFAULT_MASKING_CONFIG

```typescript
const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  redactFields: ['email', 'phone', 'ssn', 'address', 'dateOfBirth'],
  hashFields: [],
  hashSalt: 'aptivo-audit-mask',
};
```

Masking is applied to `metadata` before persistence via `maskMetadata()`. Fields matching `redactFields` are replaced with `'[REDACTED]'`; fields matching `hashFields` are replaced with `HMAC(value, salt)`.

---

## 6. Async Audit Writer

For non-blocking audit writes, the async writer publishes events to Inngest for durable processing.

### 6.1 AsyncAuditWriter

```typescript
interface AsyncAuditWriter {
  emit(event: AuditEventInput): Promise<Result<void, AsyncAuditError>>;
}
```

**Factory**: `createAsyncAuditWriter(sender, options?)`

```typescript
function createAsyncAuditWriter(
  sender: AuditEventSender,
  options?: { timeoutMs?: number; logger?: AsyncAuditWriterLogger },
): AsyncAuditWriter
```

- Default timeout: 5,000ms
- Validates event against Zod schema before publishing
- Never throws; returns `Result.err(AsyncAuditError)` on failure

### 6.2 AsyncAuditError

```typescript
type AsyncAuditError =
  | { _tag: 'PublishTimeout'; timeoutMs: number }
  | { _tag: 'PublishFailed'; cause: unknown }
  | { _tag: 'ValidationFailed'; issues: string[] };
```

### 6.3 Event Schema

Event name: `'audit/event.published'` (constant: `AUDIT_EVENT_NAME`)

Validated by Zod schema in `AUDIT_EVENT_SCHEMAS` — rejects malformed events before publish.

---

## 7. Dead-Letter Queue (DLQ)

### 7.1 DlqStore

```typescript
interface DlqStore {
  insert(entry: DlqEntry): Promise<void>;
  getPending(limit: number): Promise<DlqEntry[]>;
  markRetrying(id: string): Promise<void>;
  markExhausted(id: string): Promise<void>;
  markReplayed(id: string): Promise<void>;
  incrementAttempt(id: string, nextRetryAt?: Date): Promise<void>;
}
```

### 7.2 DlqEntry

```typescript
interface DlqEntry {
  id?: string;
  payload: AuditEventInput;
  error: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  status: 'pending' | 'retrying' | 'exhausted' | 'replayed';
}
```

### 7.3 Inngest Processing Functions

**processAuditEvent** — triggered by `audit/event.published`:
1. Attempts to write audit event via `step.run('write-audit', ...)`
2. On success: returns `Result<AuditRecord, AuditError>`
3. On failure: persists to DLQ with exponential backoff schedule, returns `{ dlq: true }`

**replayDlqEvents** — triggered by Inngest cron (`*/5 * * * *`):
1. Fetches pending entries where `nextRetryAt <= now()`
2. For each: mark retrying → attempt write → increment attempt on failure
3. Entries exceeding `maxAttempts` are marked `'exhausted'`

**Exponential backoff**: `delay = 1000ms * 2^(attemptCount - 1)` — 1s, 2s, 4s for default 3 attempts.

---

## 8. Database Schema

### 8.1 audit_logs

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `user_id` | uuid | nullable |
| `actor_type` | varchar(50) | NOT NULL — 'user' \| 'system' \| 'workflow' |
| `ip_address` | varchar(45) | nullable |
| `user_agent` | text | nullable |
| `action` | varchar(100) | NOT NULL |
| `resource_type` | varchar(100) | NOT NULL |
| `resource_id` | varchar(255) | nullable |
| `domain` | varchar(50) | nullable — 'hr' \| 'crypto' \| 'core' |
| `metadata` | jsonb | nullable — PII auto-masked |
| `previous_hash` | varchar(64) | nullable (null for first entry) |
| `current_hash` | varchar(64) | NOT NULL |
| `timestamp` | timestamp | NOT NULL, default `now()` |

**Indexes**: `user_id`, `(resource_type, resource_id)`, `timestamp`, `domain`
**Permissions**: append-only — no UPDATE or DELETE

### 8.2 audit_chain_heads

| Column | Type | Constraints |
|--------|------|-------------|
| `chain_scope` | varchar(255) | PK — default 'global' |
| `last_seq` | bigint | NOT NULL, default 0 |
| `last_hash` | varchar(64) | NOT NULL |
| `updated_at` | timestamp | NOT NULL, default `now()` |

### 8.3 audit_write_dlq

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `payload` | jsonb | NOT NULL — original `AuditEventInput` |
| `error` | text | NOT NULL — serialized error |
| `attempt_count` | integer | NOT NULL, default 0 |
| `max_attempts` | integer | NOT NULL, default 3 |
| `next_retry_at` | timestamp | nullable |
| `status` | dlq_status enum | NOT NULL, default 'pending' |
| `created_at` | timestamp | NOT NULL, default `now()` |
| `updated_at` | timestamp | NOT NULL, default `now()` |

**Indexes**: `status`, `next_retry_at`

---

## 9. Configuration

| Parameter | Default | Source |
|-----------|---------|--------|
| Chain scope | `'global'` | `AuditServiceDeps.chainScope` |
| Async writer timeout | 5,000ms | `createAsyncAuditWriter` options |
| DLQ batch size | 10 | `createReplayDlqEvents` options |
| DLQ max attempts | 3 | `createProcessAuditEvent` options |
| DLQ base backoff | 1,000ms | `dlq-processor.ts` constant |
| Retention period | 7 years | ADD §9.4 policy |

---

## 10. Composition Root Wiring

```typescript
// apps/web/src/lib/services.ts
export const getAuditStore = lazy(() =>
  createDrizzleAuditStore(db()),
);
export const getDlqStore = lazy(() =>
  createDrizzleDlqStore(db()),
);
export const getAuditService = lazy(() =>
  createAuditService({
    store: getAuditStore(),
    masking: DEFAULT_MASKING_CONFIG,
  }),
);
export const getProcessAuditEventFn = lazy(() =>
  createProcessAuditEvent(getAuditService(), getDlqStore()),
);
export const getReplayDlqEventsFn = lazy(() =>
  createReplayDlqEvents(getAuditService(), getDlqStore()),
);
```

---

## 11. Phase 2 Pointers

- **S2-W5**: PII read audit trail — extend `AuditEventInput` to capture read operations on PII-bearing resources. Requires new action types and middleware hooks for read paths.
- **T3-E3**: Cryptographic hash-chaining — Phase 3+. Current hash chaining provides sequential integrity; full tamper-proofness requires Merkle tree or blockchain-style verification.
- **Burn-rate alerting (S5-W17)**: DLQ `pending` count is an SLO input via `getAuditDlqPendingCount()` — see [ADD §16.3](../../03-architecture/platform-core-add.md).
