---
id: TSD-HITL-GATEWAY
title: HITL Gateway Specification
status: Draft
version: 3.0.0
owner: '@owner'
last_updated: '2026-03-17'
parent: ../../03-architecture/platform-core-add.md
domain: core
---

# HITL Gateway Specification

**Platform Core – Human-in-the-Loop Approval System**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v3.0.0 | 2026-03-17 | Sprint 11 (HITL2-09) | Multi-approver model: §12 rewrite, new §15–18 (quorum, sequential, request-changes, orchestrator) |
| v2.0.0 | 2026-03-09 | Sprint 2 Implementation | Rewrite §2–10 to match Sprint 2 code; add RBAC, replay stores |
| v1.1.0 | 2026-02-03 | Document Consolidation | Merged comprehensive schemas from root spec |
| v1.0.0 | 2026-02-03 | Multi-Model Consensus | Initial creation |

---

## 1. Overview

The HITL Gateway pauses automated workflows for human approval and resumes upon decision. This is a unique differentiator that cannot be bought as SaaS.

**FRD Reference**: FR-CORE-HITL-001 to FR-CORE-HITL-006

**Package**: `@aptivo/hitl-gateway`

### 1.1 Feature Matrix

| Feature | Sprint 2 (Phase 1) | Sprint 11 (Phase 2, delivered) |
|---------|----------|-----------|
| Single approver | ✅ | ✅ |
| Token-based approval (JWT HS256) | ✅ | ✅ |
| First-writer-wins (DB unique constraint) | ✅ | ✅ |
| Replay prevention (ReplayStore) | ✅ | ✅ |
| RBAC middleware (role + permission checks) | ✅ | ✅ |
| Session revocation | ✅ | ✅ |
| Multi-approver/quorum | ❌ | ✅ (§15) |
| Sequential approval | ❌ | ✅ (§16) |
| Escalation policies (timeout) | ❌ | ✅ (§16.3) |
| Request changes | ❌ | ✅ (§17) |
| Approval policies (DB-persisted) | ❌ | ✅ (§12) |
| Per-approver token join table | ❌ | ✅ (§15.2) |
| Parent/child workflow orchestration | ❌ | ✅ (§18) |

### 1.2 Module Structure

```
packages/hitl-gateway/src/
├── tokens/          # JWT generation, verification, hashing (HITL-03, HITL-04)
├── events/          # Event signing, envelope types (SP-14)
├── replay/          # ReplayStore interface + InMemory/Redis implementations (CF-03)
├── request/         # Create request service (HITL-05, HITL2-02)
│   ├── multi-request-service.ts   # multi-approver request creation (HITL2-02)
│   └── multi-request-types.ts     # input schema, result/error types, RequestTokenStore
├── decision/        # Approve/reject decision service (HITL-06, HITL2-03)
│   ├── multi-decision-service.ts  # per-approver decisions with quorum evaluation (HITL2-03)
│   └── multi-decision-types.ts    # input schema, MultiDecisionResult, MultiDecisionError
├── policy/          # Approval policy model + evaluation engines (HITL2-01, HITL2-03, HITL2-04)
│   ├── policy-types.ts            # ApprovalPolicy schema, ApprovalPolicyStore interface
│   ├── quorum-engine.ts           # M-of-N threshold evaluation (HITL2-03)
│   └── sequential-chain.ts        # ordered approval chain runner (HITL2-04)
├── workflow/        # Inngest step factory + event schemas (HITL-07, HITL2-06)
│   ├── event-schemas.ts           # HITL + orchestration event contracts
│   ├── orchestrator.ts            # parent/child workflow coordination (HITL2-06)
│   └── orchestrator-types.ts      # ChildResult, OrchestrationResult, OrchestratorError
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

## 12. Approval Policy Engine (Sprint 11)

**FRD Reference**: FR-CORE-HITL-004

**Implementation**: `packages/hitl-gateway/src/policy/policy-types.ts`

### 12.1 Policy Types

| Type | Description | Sprint |
|------|-------------|--------|
| `single` | One approver decides | Sprint 2 ✅ |
| `quorum` | M-of-N threshold (e.g., 2 of 3 approve) | Sprint 11 ✅ |
| `sequential` | Ordered approval chain | Sprint 11 ✅ |

### 12.2 Policy Schema

```typescript
// packages/database/src/schema/approval-policies.ts
export const approvalPolicies = pgTable('approval_policies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull().unique(),
  type: approvalPolicyTypeEnum('type').notNull(),  // 'single' | 'quorum' | 'sequential'
  threshold: integer('threshold'),                  // null for single/sequential
  approverRoles: jsonb('approver_roles').notNull().$type<string[]>(),
  maxRetries: integer('max_retries').notNull().default(3),
  timeoutSeconds: integer('timeout_seconds').notNull().default(86400),
  escalationPolicy: jsonb('escalation_policy').$type<EscalationPolicy | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### 12.3 Validation Rules

The `ApprovalPolicySchema` enforces the following constraints:

| Constraint | Rule |
|------------|------|
| Quorum requires threshold | `type === 'quorum'` must have `threshold >= 1` |
| Threshold ceiling | `threshold <= approverRoles.length` |
| Non-quorum rejects threshold | `type !== 'quorum'` must not set `threshold` |
| Escalation requires target | `escalationPolicy.timeoutAction === 'escalate'` requires `escalateToRole` |
| Max retries cap | `maxRetries` clamped to 0–10 |
| Timeout range | `timeoutSeconds` between 60 (1 min) and 604,800 (7 days) |

### 12.4 Escalation Policy

```typescript
interface EscalationPolicy {
  timeoutAction: 'skip' | 'escalate' | 'reject';  // behavior when current approver times out
  escalateToRole?: string;                          // required when timeoutAction = 'escalate'
}
```

### 12.5 Store Interface

```typescript
interface ApprovalPolicyStore {
  create(policy: Omit<ApprovalPolicyRecord, 'id' | 'createdAt'>): Promise<ApprovalPolicyRecord>;
  findById(id: string): Promise<ApprovalPolicyRecord | null>;
  findByName(name: string): Promise<ApprovalPolicyRecord | null>;
  list(): Promise<ApprovalPolicyRecord[]>;
}
```

**Implementation**: `packages/database/src/adapters/approval-policy-store.ts`

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

**Delivered in Sprint 11:**
- ✅ Multi-approver with quorum (§15)
- ✅ Sequential approval chains (§16)
- ✅ Timeout escalation (§16.3)
- ✅ Request changes with bounded retries (§17)
- ✅ Approval policies persisted in DB (§12)
- ✅ Per-approver token join table (§15.2)
- ✅ Parent/child workflow orchestration (§18)

**Remaining (Phase 2 Sprint 13+):**
- Delegation (approve on behalf of)
- Parallel child workflow execution (serial only in Sprint 11 — see §18.5)
- Approval dashboard with filtering
- RBAC cache eviction strategy (MED-4 tech debt)

---

## 15. Multi-Approver Request Flow (Sprint 11)

**Task**: HITL2-02

**Implementation**: `packages/hitl-gateway/src/request/multi-request-service.ts`

### 15.1 Overview

The multi-approver flow extends the single-approver model to support M-of-N quorum and sequential chain policies. Each approver receives a unique JWT token bound to their identity, preventing cross-approver impersonation.

### 15.2 Per-Approver Token Join Table

```typescript
// packages/database/src/schema/hitl-request-tokens.ts
export const hitlRequestTokens = pgTable('hitl_request_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requestId: uuid('request_id').references(() => hitlRequests.id, { onDelete: 'cascade' }).notNull(),
  approverId: uuid('approver_id').references(() => users.id).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('hitl_request_tokens_request_approver_idx').on(table.requestId, table.approverId),
]);
```

### 15.3 Request Creation Sequence

1. **Validate** input via `CreateMultiApproverRequestInputSchema` (Zod)
2. **Fetch policy** from `ApprovalPolicyStore.findById(policyId)`
3. **Validate approver count** against policy threshold (quorum: `approverIds.length >= threshold`)
4. **Generate requestId** via `crypto.randomUUID()`
5. **Mint first token** and persist request record with backward-compatible `approverId` + `tokenHash`
6. **Mint per-approver tokens** — one JWT per approver with `approverId` as a claim
7. **Bulk insert** token records into `hitl_request_tokens`
8. **Return** `{ requestId, policyId, approvers: [{ approverId, token, tokenHash, approveUrl, rejectUrl }] }`

### 15.4 Input Schema

```typescript
const CreateMultiApproverRequestInputSchema = z.object({
  workflowId: z.string().uuid(),
  workflowStepId: z.string().max(100).optional(),
  domain: z.string().min(1).max(50),
  actionType: z.string().min(1).max(100),
  summary: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  approverIds: z.array(z.string().uuid()).min(1),
  policyId: z.string().uuid(),
  ttlSeconds: z.number().int().min(1).max(3600).default(900),
});
```

### 15.5 Error Types

| Error Tag | Cause |
|-----------|-------|
| `ValidationError` | Invalid input |
| `PolicyNotFoundError` | Policy ID does not exist |
| `PolicyValidationError` | Approver count < quorum threshold |
| `TokenGenerationError` | JWT signing failed |
| `PersistenceError` | DB insert failed |

### 15.6 Backward Compatibility

The `hitl_requests` table retains its `approverId` and `tokenHash` columns. For multi-approver requests, the first approver is stored as the primary approver. The `policyId` column is nullable — existing single-approver requests continue to work without a policy.

---

## 16. Sequential Chain Logic (Sprint 11)

**Task**: HITL2-04

**Implementation**: `packages/hitl-gateway/src/policy/sequential-chain.ts`

### 16.1 Overview

Sequential chains require approvers to decide in a defined order. The `approverRoles` array in the policy specifies the sequence. Only the current approver is active; their token is minted on-demand when the previous approver completes.

### 16.2 Chain Evaluation Algorithm

The `createSequentialChainRunner().evaluateChain()` method walks the `approverRoles` array:

1. For each role in order, find a matching decision (by `role` or `approverId`)
2. If no decision exists for the current role → chain is **pending** at that step
3. If the decision is `rejected` → chain is **rejected** (short-circuit)
4. If the decision is `request_changes` → chain is **paused** at the current step
5. If the decision is `approved` → advance to the next step
6. If all steps are approved → chain is **approved**

```typescript
interface ChainState {
  currentStep: number;       // 0-indexed position in approverRoles
  currentRole: string | null; // null when chain is complete
  isComplete: boolean;
  aggregate: 'pending' | 'approved' | 'rejected';
  completedSteps: number;
  totalSteps: number;
}
```

### 16.3 Timeout Escalation

When the current approver's token expires without a decision, the escalation policy determines the next action:

| `timeoutAction` | Behavior |
|-----------------|----------|
| `skip` | Advance to the next approver in the chain |
| `escalate` | Assign to the role specified by `escalateToRole` |
| `reject` | Short-circuit the chain with rejection |

### 16.4 Helper Methods

```typescript
// get the next approver role (null if chain complete/rejected)
getNextApprover(decisions, policy): Result<string | null, ChainError>

// check if a specific approver's turn has arrived
isApproverActive(approverId, decisions, policy): Result<boolean, ChainError>
```

---

## 17. Request Changes Flow (Sprint 11)

**Task**: HITL2-05

### 17.1 Overview

Approvers can respond with `request_changes` instead of `approved` or `rejected`. This does **not** finalize the request — instead it transitions the request to `changes_requested` status and allows the requestor to resubmit.

### 17.2 Decision Enum Extension

The `hitl_decision` enum now includes three values:

```sql
CREATE TYPE hitl_decision AS ENUM ('approved', 'rejected', 'request_changes');
```

The `hitl_status` enum now includes `changes_requested`:

```sql
CREATE TYPE hitl_status AS ENUM ('pending', 'approved', 'rejected', 'expired', 'canceled', 'changes_requested');
```

### 17.3 Event Contract

```typescript
// packages/hitl-gateway/src/workflow/event-schemas.ts
interface HitlChangesRequestedData {
  requestId: string;
  approverId: string;
  comment: string;      // required for request_changes decisions
  retryCount: number;   // current count after the decision
  decidedAt: string;    // ISO timestamp
}

const HITL_EVENTS = {
  APPROVAL_REQUESTED: 'hitl/approval.requested',
  DECISION_RECORDED: 'hitl/decision.recorded',
  CHANGES_REQUESTED: 'hitl/changes.requested',   // new in Sprint 11
} as const;
```

### 17.4 Bounded Retries

The `maxRetries` field on the approval policy (default 3, max 10) limits re-submissions:

1. Approver submits `request_changes` with a required `comment`
2. Request status transitions to `changes_requested`
3. `retryCount` increments on the request record
4. If `retryCount >= maxRetries` → request is **rejected** (cannot resubmit again)
5. On resubmit, a new token is minted and the request transitions back to `pending`

### 17.5 Workflow Result Extension

```typescript
type HitlApprovalResult =
  | { status: 'approved'; ... }
  | { status: 'rejected'; ... }
  | { status: 'changes_requested'; requestId: string; approverId: string; decidedAt: string; comment: string }
  | { status: 'expired'; ... }
  | { status: 'error'; ... };
```

---

## 18. Parent/Child Workflow Orchestration (Sprint 11)

**Task**: HITL2-06

**FRD Reference**: FR-CORE-WFE-007

**Implementation**: `packages/hitl-gateway/src/workflow/orchestrator.ts`

### 18.1 Overview

Parent workflows can spawn child workflows via Inngest events and wait for their completion. Correlation is achieved through `parentWorkflowId` in event data. The orchestrator is decoupled from Inngest internals via abstract interfaces (`EventSender`, `WorkflowStep`).

### 18.2 Event Contract

```typescript
// packages/hitl-gateway/src/workflow/event-schemas.ts
const ORCHESTRATION_EVENTS = {
  CHILD_SPAWNED: 'workflow/child.spawned',
  CHILD_COMPLETED: 'workflow/child.completed',
} as const;

interface ChildSpawnedEvent {
  parentWorkflowId: string;
  childWorkflowId: string;
  childEventName: string;
  spawnedAt: string;        // ISO timestamp
}

interface ChildCompletedEvent {
  parentWorkflowId: string;
  childWorkflowId: string;
  result: unknown;          // child's return value
  completedAt: string;      // ISO timestamp
}
```

### 18.3 Orchestrator API

```typescript
const orchestrator = createWorkflowOrchestrator({ eventSender });

// spawn a child by emitting its trigger event with parent correlation
await orchestrator.spawnChild(parentWorkflowId, childWorkflowId, childEventName, childEventData);

// wait for N children to complete, with per-child timeout
const result = await orchestrator.waitForChildren(step, config, expectedChildren);

// called by child workflows to signal completion to parent
await orchestrator.completeChild(parentWorkflowId, childWorkflowId, result);
```

### 18.4 Event Correlation

`waitForChildren` uses `step.waitForEvent` with an `if` expression that matches both `parentWorkflowId` and `childWorkflowId`:

```typescript
const event = await step.waitForEvent(`wait-child-${childId}`, {
  event: 'workflow/child.completed',
  timeout: config.childTimeout,
  if: `async.data.parentWorkflowId == '${config.parentWorkflowId}' && async.data.childWorkflowId == '${childId}'`,
});
```

### 18.5 Known Limitations

| Limitation | Detail | Resolution |
|------------|--------|------------|
| Serial waiting | Children are awaited sequentially in a `for` loop — no parallel fan-out | Sprint 13: parallel child execution |
| Timeout partial results | If child N times out, subsequent children are still awaited | Consumer decides whether to abort early |

### 18.6 Result Types

```typescript
interface OrchestrationResult {
  parentWorkflowId: string;
  children: ChildResult[];     // per-child status + result
  allCompleted: boolean;
  completedCount: number;
  timedOutCount: number;
}

interface ChildResult {
  childWorkflowId: string;
  status: 'completed' | 'timed_out';
  result?: unknown;
}
```

---

## 19. Quorum Evaluation Algorithm (Sprint 11)

**Task**: HITL2-03

**Implementation**: `packages/hitl-gateway/src/policy/quorum-engine.ts`

### 19.1 Overview

The quorum engine evaluates a set of individual decisions against a policy's threshold to determine aggregate status. It supports an optional `actualApproverCount` override for cases where the request has a different number of approvers than the policy's `approverRoles.length`.

### 19.2 Algorithm

Given `threshold` (M), `totalApprovers` (N), and a list of decisions:

| Condition | Aggregate | Finalized? |
|-----------|-----------|------------|
| `approvalsCount >= threshold` | `approved` | Yes |
| `rejectionsCount > (totalApprovers - threshold)` | `rejected` | Yes |
| Otherwise | `pending` | No |

The rejection rule ensures early termination: when enough approvers have rejected that it is mathematically impossible to reach the threshold, the request is rejected without waiting for remaining approvers.

### 19.3 Result Type

```typescript
interface QuorumResult {
  aggregate: 'pending' | 'approved' | 'rejected';
  approvalsCount: number;
  rejectionsCount: number;
  threshold: number;
  totalApprovers: number;
  isFinalized: boolean;
}
```

### 19.4 Multi-Decision Service Integration

The `createMultiDecisionService` (HITL2-03) orchestrates per-approver decision recording with quorum evaluation:

1. **Validate** input via `RecordMultiApproverDecisionInputSchema`
2. **Fetch request** — reject if not found or already finalized
3. **Verify per-approver token** via `RequestTokenStore.findByRequestAndApprover`
4. **Idempotency check** — reject if this approver already decided
5. **Insert** individual decision record
6. **Evaluate quorum** via `quorumEngine.evaluate(allDecisions, policy)`
7. **Optimistic lock** — `UPDATE hitl_requests SET status = $1 WHERE id = $2 AND status = 'pending'`
8. **Emit event** only if this approver's decision triggered finalization (`affected > 0`)
9. If `affected === 0` — another approver finalized first; re-read actual state

This first-finalizer-wins pattern ensures exactly one `hitl/decision.recorded` event per request finalization, even under concurrent approvals.

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
| Multi-Approver Token Security | platform-core-add.md | §4.7 |
| Parent/Child Orchestration | platform-core-add.md | §4.8 |

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

### Sprint 11 Implementation Evidence

| Task | Test File | Status |
|------|-----------|--------|
| HITL2-00 Session DELETE Blacklisting | `s11-hitl2-00-session-blacklist.test.ts` | Done |
| HITL2-01 Approval Policy Model | `s11-hitl2-01-approval-policy.test.ts` | Done |
| HITL2-02 Multi-Approver Request | `s11-hitl2-02-multi-request.test.ts` | Done |
| HITL2-03 Quorum Decision Engine | `s11-hitl2-03-quorum-engine.test.ts` | Done |
| HITL2-04 Sequential Chain | `s11-hitl2-04-sequential-chain.test.ts` | Done |
| HITL2-05 Request Changes | `s11-hitl2-05-request-changes.test.ts` | Done |
| HITL2-06 Parent/Child Orchestration | `s11-hitl2-06-parent-child.test.ts` | Done |
| HITL2-07 Domain Workflow Upgrades | `s11-hitl2-07-domain-workflows.test.ts` | Done |
