---
id: TSD-HITL-GATEWAY
title: HITL Gateway Specification
status: Draft
version: 2.0.0
owner: '@owner'
last_updated: '2026-03-09'
parent: ../../03-architecture/platform-core-add.md
domain: core
---

# HITL Gateway Specification

**Platform Core – Human-in-the-Loop Approval System**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v2.0.0 | 2026-03-09 | Sprint 2 Implementation | Rewrite §2–10 to match Sprint 2 code; add RBAC, replay stores |
| v1.1.0 | 2026-02-03 | Document Consolidation | Merged comprehensive schemas from root spec |
| v1.0.0 | 2026-02-03 | Multi-Model Consensus | Initial creation |

---

## 1. Overview

The HITL Gateway pauses automated workflows for human approval and resumes upon decision. This is a unique differentiator that cannot be bought as SaaS.

**FRD Reference**: FR-CORE-HITL-001 to FR-CORE-HITL-006

**Package**: `@aptivo/hitl-gateway`

### 1.1 Phase 1 Scope (Sprint 2)

| Feature | Sprint 2 | Phase 2+ |
|---------|----------|----------|
| Single approver | ✅ | ✅ |
| Token-based approval (JWT HS256) | ✅ | ✅ |
| First-writer-wins (DB unique constraint) | ✅ | ✅ |
| Replay prevention (ReplayStore) | ✅ | ✅ |
| RBAC middleware (role + permission checks) | ✅ | ✅ |
| Session revocation | ✅ | ✅ |
| Multi-approver/quorum | ❌ | ✅ |
| Sequential approval | ❌ | ✅ |
| Escalation policies | ❌ | ✅ |
| Request changes | ❌ | ✅ |

### 1.2 Module Structure

```
packages/hitl-gateway/src/
├── tokens/          # JWT generation, verification, hashing (HITL-03, HITL-04)
├── events/          # Event signing, envelope types (SP-14)
├── replay/          # ReplayStore interface + InMemory/Redis implementations (CF-03)
├── request/         # Create request service (HITL-05)
├── decision/        # Approve/reject decision service (HITL-06)
├── workflow/        # Inngest step factory + event schemas (HITL-07)
├── notifications/   # Novu notification adapter (HITL-08)
├── auth/            # RBAC middleware + session revocation (ID-02, HITL-11)
└── index.ts
```

---

## 2. Inngest Integration (HITL-07)

### 2.1 Event Contract

```typescript
// event names
export const HITL_EVENTS = {
  APPROVAL_REQUESTED: 'hitl/approval.requested',   // trigger
  DECISION_RECORDED:  'hitl/decision.recorded',     // response
} as const;

// trigger event data
interface HitlApprovalRequestData {
  workflowId: string;
  workflowStepId?: string;
  domain: string;
  actionType: string;
  summary: string;
  details?: Record<string, unknown>;
  approverId: string;
  ttlSeconds?: number;
}

// response event data
interface HitlDecisionRecordedData {
  requestId: string;
  decision: 'approved' | 'rejected';
  approverId: string;
  decidedAt: string;  // ISO timestamp
}
```

### 2.2 Workflow Factory

The Inngest function is created via a factory that accepts injected dependencies:

```typescript
function createHitlApprovalFunction(
  inngest: Inngest.Any,
  deps: HitlWorkflowDeps,
  config?: HitlWorkflowConfig,
);

interface HitlWorkflowDeps {
  createRequest: (input) => Promise<Result<CreateRequestResult, RequestError>>;
  sendNotification?: (params) => Promise<void>;  // optional, fire-and-forget
}
```

### 2.3 Workflow Steps

1. `step.run('create-hitl-request')` — DB insert + token mint
2. `step.run('send-notification')` — Novu trigger (fire-and-forget, swallows errors)
3. `step.waitForEvent('wait-for-decision')` — pauses workflow
4. Decision API records decision → emits `hitl/decision.recorded`
5. Inngest resumes → approve / reject / timeout branch

### 2.4 Event Correlation

> **IMPORTANT**: Uses `if` expression, **not** `match`.
>
> The triggering event (`hitl/approval.requested`) does not have `data.requestId` — the requestId is created in step 1 and only exists in the decision event. The `if` expression references the async event's data:

```typescript
const decision = await step.waitForEvent('wait-for-decision', {
  event: HITL_EVENTS.DECISION_RECORDED,
  timeout: cfg.waitTimeout,
  if: `async.data.requestId == '${requestResult.requestId}'`,
});
```

### 2.5 Return-Value-Based Flow

Uses the safeSagaStep pattern (coding guidelines §8b) — no try/catch around `step.run()`. Each step returns a discriminated result:

```typescript
const requestResult = await step.run('create-hitl-request', async () => {
  const result = await deps.createRequest(data);
  if (!result.ok) {
    return { success: false as const, error: result.error._tag + ': ' + ... };
  }
  return { success: true as const, requestId: result.value.requestId, ... };
});

if (!requestResult.success) {
  return { status: 'error', requestId: '', error: requestResult.error };
}
```

### 2.6 Result Types

```typescript
type HitlApprovalResult =
  | { status: 'approved'; requestId: string; approverId: string; decidedAt: string }
  | { status: 'rejected'; requestId: string; approverId: string; decidedAt: string }
  | { status: 'expired'; requestId: string }
  | { status: 'error'; requestId: string; error: string };
```

---

## 3. Token Security (HITL-03, HITL-04, CF-03)

### 3.1 JWT Claims

All HITL tokens are JWT HS256 with the following claims:

```typescript
interface HitlTokenPayload {
  requestId: string;  // binds token to specific request
  action: string;     // 'approve' | 'reject' | 'decide' (wildcard)
  channel: string;    // delivery channel
  exp: number;        // standard expiration
  iat: number;        // issued-at
  jti: string;        // unique ID for replay prevention
  aud: string;        // audience (e.g. 'hitl-approval')
  iss: string;        // issuer (e.g. 'aptivo-hitl-gateway')
}
```

### 3.2 Token Generation

```typescript
function generateHitlToken(
  options: TokenGenerationOptions,
  signingSecret: string,
): Promise<Result<TokenGenerationResult, { reason: string; message: string }>>;

interface TokenGenerationResult {
  token: string;       // the signed JWT (sent to approver, NEVER stored)
  tokenHash: string;   // SHA-256 hex hash (stored in DB as char(64))
  jti: string;
  expiresAt: Date;
}
```

**Security invariants:**
- Secret must be >= 32 characters
- TTL hard-capped at 3600 seconds (1 hour)
- Token hash stored in DB; raw JWT never persisted
- Single `action: 'decide'` token permits both approve and reject

### 3.3 Token Verification

```typescript
function verifyHitlToken(
  token: string,
  secrets: string | string[],           // dual-key rotation support
  options: { audience: string; issuer: string },
  replayStore?: ReplayStore,            // optional (CF-03)
): Promise<Result<HitlTokenPayload, { reason: TokenRejectionReason; message: string }>>;
```

**Rejection reasons**: `expired`, `invalid-signature`, `invalid-audience`, `invalid-issuer`, `replayed-jti`, `malformed`

**Dual-key rotation**: When `secrets` is an array, verification tries each key in order. This enables zero-downtime secret rotation: `[newKey, oldKey]`.

### 3.4 Replay Prevention (CF-03 — Go/No-Go C1)

```typescript
interface ReplayStore {
  claimOnce(key: string, ttlSeconds: number): Promise<
    { ok: true } | { ok: false; reason: 'duplicate' | 'store-error' }
  >;
}
```

**Implementations:**
- `InMemoryReplayStore` — Map + setTimeout cleanup (tests, single-instance)
- `RedisReplayStore` — `SET key "1" NX EX ttlSeconds` (multi-instance production)

**TTL policy:** JTI key TTL = remaining token lifetime (`exp - now`), ensuring auto-cleanup.

**Fail-closed:** Store errors return `{ ok: false, reason: 'store-error' }` → token rejected.

---

## 4. Request Service (HITL-05)

### 4.1 Create Request

```typescript
function createRequest(
  input: unknown,
  deps: RequestServiceDeps,
): Promise<Result<CreateRequestResult, RequestError>>;

interface RequestServiceDeps {
  store: RequestStore;
  config: RequestServiceConfig;
}

interface RequestStore {
  insert(record: HitlRequestRecord): Promise<{ id: string }>;
}
```

### 4.2 Request Creation Flow

1. **Validate** input via Zod schema (`CreateRequestInputSchema`)
2. **Generate requestId** first (`crypto.randomUUID()`) so the token binds to it
3. **Mint JWT** with `action: 'decide'` (wildcard — permits both approve and reject)
4. **Persist** record with `tokenHash` (SHA-256 of JWT), never raw token
5. **Return** requestId, token, tokenHash, approveUrl, rejectUrl

> **CRITICAL**: The requestId is generated **before** the token so the JWT's `requestId` claim matches the DB record. This was a critical bug (CRITICAL-1) fixed in Sprint 2 review.

### 4.3 Approval URLs

Both URLs include the token as a query parameter:

```
{baseUrl}/hitl/{requestId}?action=approve&token={urlEncodedToken}
{baseUrl}/hitl/{requestId}?action=reject&token={urlEncodedToken}
```

> The same token is used for both URLs. The `action` query param is a UI hint; the actual authorization comes from the JWT's `action: 'decide'` claim which permits either decision.

### 4.4 Result

```typescript
interface CreateRequestResult {
  requestId: string;
  tokenHash: string;
  token: string;           // raw JWT — sent to approver
  tokenExpiresAt: Date;
  approveUrl: string;
  rejectUrl: string;
}
```

---

## 5. Decision Service (HITL-06)

### 5.1 Record Decision

```typescript
function recordDecision(
  input: unknown,
  deps: DecisionServiceDeps,
): Promise<Result<RecordDecisionResult, DecisionError>>;

interface DecisionServiceDeps {
  store: DecisionStore;
  config: DecisionServiceConfig;
  replayStore?: ReplayStore;
  eventEmitter?: DecisionEventEmitter;
}

interface DecisionStore {
  getRequest(requestId: string): Promise<RequestSnapshot | null>;
  getDecisionByRequestId(requestId: string): Promise<ExistingDecision | null>;
  insertDecisionAndUpdateRequest(
    decision: HitlDecisionRecord,
    newStatus: 'approved' | 'rejected',
  ): Promise<{ id: string }>;
}
```

### 5.2 Decision Flow

1. **Validate** input via Zod schema
2. **Verify token** (signature, expiry, replay, audience, issuer)
3. **Check token binding**: `tokenResult.value.requestId === data.requestId`
4. **Enforce action claim**: `decide` tokens allow any decision; specific tokens (`approve`/`reject`) are restricted to their action
5. **Fetch request** from store
6. **Check expiry**: `request.tokenExpiresAt < now` → RequestExpiredError
7. **Check status**: if not `pending`, check for idempotent re-submission
8. **Atomic insert**: decision record + request status update in one transaction
9. **Emit event**: `hitl/decision.recorded` via `DecisionEventEmitter` (fire-and-forget)

### 5.3 Token Binding & Action Enforcement

> **CRITICAL**: The decision service verifies that the token was issued for this specific request **and** that the token's action claim permits the submitted decision.

```typescript
// token-to-request binding (CRITICAL-2)
if (tokenResult.value.requestId !== data.requestId) {
  return Result.err({ _tag: 'TokenVerificationError', reason: 'invalid-binding' });
}

// action enforcement (HIGH-2)
const tokenAction = tokenResult.value.action;
if (tokenAction !== 'decide') {
  const expectedAction = data.decision === 'approved' ? 'approve' : 'reject';
  if (tokenAction !== expectedAction) {
    return Result.err({ _tag: 'TokenVerificationError', reason: 'invalid-action' });
  }
}
```

### 5.4 First-Writer-Wins

Concurrent decisions on the same request are resolved by the DB unique constraint on `hitl_decisions.request_id`. Only the first successful insert wins; subsequent attempts receive `ConflictError`.

### 5.5 Idempotency

If a request is already resolved and the same approver submits the same decision, the service returns the existing decision (200) instead of an error. This prevents double-click issues.

```typescript
// idempotency: same approver + same decision = return existing
if (existing.approverId === request.approverId && existing.decision === data.decision) {
  return Result.ok({ decisionId: existing.id, ... });
}
// different approver or different decision = conflict
return Result.err({ _tag: 'RequestAlreadyResolvedError', existingStatus: request.status });
```

---

## 6. Notification Integration (HITL-08)

### 6.1 Novu Adapter

```typescript
function sendApprovalNotification(
  params: ApprovalNotificationParams,
  client: NovuClient,
  config?: NotificationAdapterConfig,
): Promise<Result<{ transactionId: string }, NotificationError>>;

interface NovuClient {
  trigger(workflowId: string, payload: unknown): Promise<{ transactionId?: string }>;
}
```

**Key patterns:**
- `transactionId = requestId` for Novu dedup (SP-04 pattern)
- Fire-and-forget: delivery failures return `Result.err`, never throw
- Template variables: `approverName`, `summary`, `approveUrl`, `rejectUrl`, `expiresAt`, `requestId`

### 6.2 Workflow Integration Factory

```typescript
function createSendNotification(
  client: NovuClient,
  config?: NotificationAdapterConfig,
): (params: { requestId, approverId, summary, approveUrl, rejectUrl, expiresAt }) => Promise<void>;
```

Returns a function compatible with `HitlWorkflowDeps.sendNotification`. Throws on failure so the workflow step catches and returns `{ sent: false }`.

---

## 7. RBAC Middleware (ID-02)

### 7.1 RbacService

```typescript
class RbacService {
  constructor(store: RbacStore, config?: RbacConfig);

  requireRole(userId: string, role: string, domain?: string | null): Promise<AuthzResult>;
  requirePermission(userId: string, permission: string, domain?: string | null): Promise<AuthzResult>;
  clearCache(): void;
}

type AuthzResult =
  | { allowed: true }
  | { allowed: false; reason: string };
```

### 7.2 Store Interface

```typescript
interface RbacStore {
  getUserRoles(userId: string, domain?: string | null): Promise<RoleRecord[]>;
  getRolePermissions(role: string): Promise<RolePermissionRecord[]>;
}
```

### 7.3 Key Behaviors

| Behavior | Implementation |
|----------|---------------|
| **Default-deny** | No roles = denied |
| **Fail-closed** | Store errors return empty roles/permissions → access denied |
| **Domain-scoped** | `domain` column filters roles; `null` = platform-wide |
| **Platform-wide override** | Admin with `domain=null` satisfies any domain check |
| **Permission walk** | user → roles → role_permissions → check permission string |
| **Cache** | In-memory with configurable TTL (default 60s) |

### 7.4 RBAC Schema

See [database.md §4.8](../database.md#48-rbac-tables) for `user_roles` and `role_permissions` table definitions.

---

## 8. Session Revocation (HITL-11)

```typescript
function revokeSession(
  input: unknown,
  store: SessionStore,
): Promise<Result<RevokeSessionResult, RevocationError>>;

function isSessionRevoked(sessionId: string, store: SessionStore): Promise<boolean>;
```

**Key behaviors:**
- Only session owner or admin can revoke
- `isSessionRevoked()` is fail-closed: store errors → treated as revoked
- Optional `revokeAll` parameter revokes all sessions for a user

---

## 9. Error Types

### 9.1 Request Errors

```typescript
type RequestError =
  | { _tag: 'ValidationError'; message: string; errors: Array<{ field: string; message: string }> }
  | { _tag: 'TokenGenerationError'; message: string }
  | { _tag: 'DuplicateTokenError'; message: string }
  | { _tag: 'PersistenceError'; message: string; cause: unknown };
```

### 9.2 Decision Errors

```typescript
type DecisionError =
  | { _tag: 'ValidationError'; message: string; errors: Array<{ field: string; message: string }> }
  | { _tag: 'RequestNotFoundError'; requestId: string }
  | { _tag: 'RequestExpiredError'; requestId: string }
  | { _tag: 'RequestAlreadyResolvedError'; requestId: string; existingStatus: string }
  | { _tag: 'TokenVerificationError'; reason: string; message: string }
  | { _tag: 'ConflictError'; requestId: string; message: string }
  | { _tag: 'PersistenceError'; message: string; cause: unknown };
```

### 9.3 Notification Errors

```typescript
type NotificationError =
  | { _tag: 'DeliveryFailed'; message: string; cause: unknown }
  | { _tag: 'InvalidParams'; message: string };
```

### 9.4 Revocation Errors

```typescript
type RevocationError =
  | { _tag: 'SessionNotFound'; sessionId: string }
  | { _tag: 'Forbidden'; message: string }
  | { _tag: 'PersistenceError'; message: string; cause: unknown };
```

---

## 10. Database Schema

> See [database.md §4.3–4.4](../database.md#43-hitl-requests) for complete HITL table definitions and [§4.8](../database.md#48-rbac-tables) for RBAC tables.

**Key schema facts:**
- `hitl_requests.tokenHash` is `char(64)` — **raw JWT is never stored**
- `hitl_decisions.request_id` has a **unique index** enforcing first-writer-wins
- `hitl_requests.status` enum: `pending`, `approved`, `rejected`, `expired`, `canceled`
- `hitl_decisions.decision` enum: `approved`, `rejected`
- `user_roles` uses a partial unique index on `(userId, role, domain) WHERE revoked_at IS NULL` for active role enforcement

---

## 11. Expiry Handling

Token-based expiry is the primary mechanism:
- JWT `exp` claim enforces a hard cap (max 1 hour)
- `hitl_requests.tokenExpiresAt` is checked by the decision service before accepting decisions
- Inngest `waitForEvent` timeout (default 24h) is the workflow-level expiry

For orphaned requests (where the workflow timed out but the DB record wasn't updated), a scheduled cleanup function can be added:

```typescript
// scheduled job: expire orphaned pending requests
const expireOrphans = inngest.createFunction(
  { id: 'expire-hitl-requests' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    // find pending requests where tokenExpiresAt < now
    // update status to 'expired'
  }
);
```

---

## 12. Approval Policy Engine (Phase 2+)

> Phase 2+ feature. Sprint 2 implements single-approver only.

### 12.1 Policy Types

| Type | Description | Sprint |
|------|-------------|--------|
| `single` | One approver decides | Sprint 2 ✅ |
| `multi` | Quorum-based (e.g., 2 of 3 approve) | Phase 2+ |
| `sequential` | Ordered approval chain | Phase 2+ |

### 12.2 Schema (Deferred)

```typescript
// deferred to phase 2 — schema for reference
export const hitlPolicies = pgTable('hitl_policies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  type: hitlPolicyTypeEnum('type').default('single').notNull(),
  approvers: jsonb('approvers').$type<ApproverSpec[]>().notNull(),
  quorum: integer('quorum').default(1),
  expiryTTLMinutes: integer('expiry_ttl_minutes').default(15).notNull(),
  escalationEnabled: boolean('escalation_enabled').default(false),
  domain: varchar('domain', { length: 50 }),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps,
});
```

---

## 13. Audit Integration

### 13.1 Audited Events

| Event | Trigger | Metadata |
|-------|---------|----------|
| `HITL_REQUEST_CREATED` | Request created | actionType, domain |
| `HITL_DECISION_RECORDED` | Approver decides | decision, channel, approverId |
| `HITL_REQUEST_EXPIRED` | TTL exceeded | originalExpiry |
| `HITL_REQUEST_CANCELED` | Workflow canceled | reason |

> Full audit integration is Sprint 4 (AUD-03). Sprint 2 records decisions with channel and metadata but does not write to the audit_logs table.

---

## 14. Phase 2+ Roadmap

- Multi-approver with quorum (e.g., 2 of 3 must approve)
- Sequential approval chains
- Escalation policies (notify manager after X hours)
- Delegation (approve on behalf of)
- Request changes (does NOT resolve workflow, just records feedback)
- Approval dashboard with filtering
- RBAC cache eviction strategy (MED-4 tech debt)

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Pause Workflow for Human Decision | platform-core-frd.md | FR-CORE-HITL-001 |
| Approval Token Security | platform-core-frd.md | FR-CORE-HITL-002 |
| Approve/Reject Decisions | platform-core-frd.md | FR-CORE-HITL-003 |
| Approval Policies | platform-core-frd.md | FR-CORE-HITL-004 |
| Multi-Channel Notification | platform-core-frd.md | FR-CORE-HITL-005 |
| Audit HITL Actions | platform-core-frd.md | FR-CORE-HITL-006 |
| Role-Based Access Control | platform-core-frd.md | FR-CORE-ID-002 |
| Session Management | platform-core-frd.md | FR-CORE-ID-003 |
| HITL Gateway Architecture | platform-core-add.md | Section 4 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Trade Signal Approvals | crypto/workflow-engine.md | HITL integration |
| Contract Approvals | hr/workflow-automation.md | HITL integration |
| HITL Multi-Model Review | SPRINT_2_HITL_MULTI_REVIEW.md | Sign-off verdict |

### Sprint 2 Implementation Evidence

| Task | Tests | Status |
|------|-------|--------|
| HITL-03 Token Generation | 21 | Done |
| HITL-04 Token Verification | 21 | Done |
| CF-03 Replay Stores | 27 | Done |
| HITL-05 Request Service | 13 | Done |
| HITL-06 Decision Service | 18 | Done |
| HITL-07 Inngest Integration | 10 | Done |
| HITL-08 Novu Notifications | 13 | Done |
| HITL-09 Approval UI | — (UI) | Done |
| HITL-10 Integration Tests | 12 | Done |
| HITL-11 Session Revocation | 9 | Done |
| ID-01 RBAC Schema | — | Done |
| ID-02 RBAC Middleware | 13 | Done |
| **Total** | **157** | **All pass** |
