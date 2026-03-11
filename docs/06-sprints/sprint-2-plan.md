# Sprint 2 Implementation Plan: HITL Gateway + RBAC Foundation

**Theme**: "Humans approve, machines obey roles"
**Duration**: 2 weeks (Week 5–6)
**Total Story Points**: 41 (11 HITL tasks + 2 RBAC tasks + 1 carry-forward)
**Packages**: `@aptivo/hitl-gateway` + `@aptivo/database` + `apps/web` routes
**FRD Coverage**: FR-CORE-HITL-001 through HITL-006 (scope-limited), FR-CORE-ID-002, FR-CORE-ID-003 (partial)

---

## Executive Summary

Sprint 2 builds two subsystems:

1. **HITL Gateway** — The Human-in-the-Loop approval subsystem on top of Sprint 0's validated spike code (SP-02, SP-04, SP-11, SP-14). Core flow: workflow pauses via Inngest `step.waitForEvent()`, approver receives notification (Novu) with signed links, approver clicks approve/reject, decision recorded atomically, workflow resumes.
2. **RBAC Foundation** — Role-based access control schema and middleware (FR-CORE-ID-002). Without this, any authenticated user can access any API. The RBAC middleware is needed before Sprint 3 APIs go live.

Key security hardening: **CF-03** replaces in-memory `Set<string>` JTI/nonce stores with Redis SETNX + TTL for multi-instance replay protection (Go/No-Go condition C1).

### Multi-Model Consensus

This plan was produced via multi-model synthesis (Claude Opus 4.6 lead + Gemini 3 Flash + Codex). All three models agree on:

- 3-phase execution: Foundation → APIs → Integration
- Critical path: HITL-01/02 → HITL-03/04 → CF-03 → HITL-05/06 → HITL-07 → HITL-10
- CF-03 must be front-loaded (week 1) to unblock API development
- ReplayStore adapter interface with backward-compatible injection
- 41 SP is tight but achievable — RBAC tasks are mechanical and parallelizable

---

## 1. Task Breakdown

### Phase 1: Foundation & Security Hardening (Days 1–4)

#### HITL-01: Request Schema (2 SP)

**Description**: Define `hitl_requests` Drizzle schema for approval request lifecycle.

**Acceptance Criteria**:
- [ac] `hitl_requests` table with UUID PK, workflow binding, status enum, token hash, expiry
- [ac] Status lifecycle: `pending` → `approved` | `rejected` | `expired` | `canceled`
- [ac] Token hash stored as `char(64)` — raw token never persisted
- [ac] Schema exported from `@aptivo/database`

**Files**:
- Create: `packages/database/src/schema/hitl-requests.ts`
- Modify: `packages/database/src/schema/index.ts`, `packages/database/src/index.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: Import `hitlRequests` from `@aptivo/database` — fails (module not found)
2. Green: Define `pgTable('hitl_requests', { ... })` with all columns
3. Red: Assert `status` column has check constraint for valid enum values
4. Green: Add `varchar` with validation or pgEnum
5. Refactor: Extract schema to match existing patterns in `llm-usage.ts`

**Schema Design**:
```typescript
export const hitlRequests = pgTable('hitl_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // workflow context
  workflowId: uuid('workflow_id').notNull(),
  workflowStepId: varchar('workflow_step_id', { length: 100 }),
  domain: varchar('domain', { length: 50 }).notNull(),
  // request content
  actionType: varchar('action_type', { length: 100 }).notNull(),
  summary: text('summary').notNull(),
  details: jsonb('details'),
  // assignee
  approverId: uuid('approver_id').notNull(),
  // status
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  // token (hash only — never store raw JWT)
  tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  // timing
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  index('hitl_requests_workflow_id_idx').on(table.workflowId),
  index('hitl_requests_approver_status_idx').on(table.approverId, table.status),
  index('hitl_requests_status_expires_idx').on(table.status, table.tokenExpiresAt),
]);
```

---

#### HITL-02: Decision Schema (2 SP)

**Description**: Define `hitl_decisions` table for immutable, race-safe decision recording.

**Acceptance Criteria**:
- [ac] `hitl_decisions` table with FK to `hitl_requests`, decision enum, channel metadata
- [ac] `unique(request_id)` constraint enforces single-decision / first-writer-wins
- [ac] Decision includes channel, optional comment, audit metadata (IP, user agent)
- [ac] Schema exported from `@aptivo/database`

**Files**:
- Create: `packages/database/src/schema/hitl-decisions.ts`
- Modify: `packages/database/src/schema/index.ts`, `packages/database/src/index.ts`

**Dependencies**: HITL-01 (FK to `hitl_requests.id`)

**TDD Micro-Tasks**:
1. Red: Import `hitlDecisions` from `@aptivo/database` — fails
2. Green: Define `pgTable` with requestId FK and unique constraint
3. Red: Assert duplicate insert on same `request_id` throws conflict
4. Green: Add `.unique()` on `requestId`
5. Refactor: Add audit metadata columns (ipAddress, userAgent)

**Schema Design**:
```typescript
export const hitlDecisions = pgTable('hitl_decisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requestId: uuid('request_id').notNull().unique()
    .references(() => hitlRequests.id, { onDelete: 'cascade' }),
  approverId: uuid('approver_id').notNull(),
  decision: varchar('decision', { length: 20 }).notNull(), // 'approved' | 'rejected'
  comment: text('comment'),
  channel: varchar('channel', { length: 50 }).notNull(), // 'email' | 'slack' | 'web'
  // audit
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('hitl_decisions_approver_idx').on(table.approverId),
]);
```

---

#### HITL-03: Token Generation (3 SP)

**Description**: Harden and formalize JWT token generation from SP-11 spike code. Add adapter hooks for CF-03 replay store injection.

**Acceptance Criteria**:
- [ac] `generateHitlToken()` returns `Result<TokenGenerationResult, Error>`
- [ac] JWT includes `requestId`, `action`, `channel`, `jti`, `aud`, `iss`, `iat`, `exp`
- [ac] Returns `tokenHash` (SHA-256 hex) for DB storage
- [ac] Secret length >= 32 chars enforced; TTL hard-capped at 1 hour
- [ac] Dual-key rotation compatible

**Files**:
- Modify: `packages/hitl-gateway/src/tokens/jwt-manager.ts` (already exists — minor refinements)
- Modify: `packages/hitl-gateway/src/tokens/token-types.ts`
- Modify: `packages/hitl-gateway/tests/sp-11-token-security.test.ts`

**Dependencies**: None (existing spike code)

**Reuse Assessment**: **~90% reuse** — SP-11 `generateHitlToken()` is production-quality. Changes: add replay store injection point (for CF-03), verify claim completeness.

**TDD Micro-Tasks**:
1. Red: Test that token claims include all required fields
2. Green: Verify existing implementation covers all claims (it does)
3. Red: Test replay store is injectable (optional parameter)
4. Green: Add `replayStore?: ReplayStore` parameter to `verifyHitlToken()`
5. Refactor: Ensure backward compatibility (omitted store defaults to in-memory)

---

#### HITL-04: Token Verification (2 SP)

**Description**: Productionize verification path with structured rejection reasons and pluggable replay store.

**Acceptance Criteria**:
- [ac] `verifyHitlToken()` rejects expired, tampered, replayed, wrong-aud, wrong-iss tokens
- [ac] Returns structured `TokenRejectionReason` for audit logging
- [ac] Dual-key rotation: `[newKey, oldKey]` verification order
- [ac] Replay store injectable via optional parameter (backward compatible)

**Files**:
- Modify: `packages/hitl-gateway/src/tokens/jwt-manager.ts`
- Modify: `packages/hitl-gateway/tests/sp-11-token-security.test.ts`

**Dependencies**: HITL-03

**Reuse Assessment**: **~85% reuse** — SP-11 `verifyHitlToken()` handles all rejection paths. Changes: refactor replay check from module-level `Set` to injected `ReplayStore`.

**TDD Micro-Tasks**:
1. Red: Test with custom `ReplayStore` mock — fails (no injection point)
2. Green: Add optional `replayStore` parameter; default to in-memory
3. Red: Verify all existing tests still pass with default store
4. Green: Existing tests pass unchanged
5. Refactor: Clean up module-level `consumedJtis` Set → use default InMemoryReplayStore

---

#### CF-03: Redis-Backed Replay Stores (5 SP) — Go/No-Go C1

**Description**: Replace in-memory `Set<string>` for JTI (SP-11) and nonce (SP-14) tracking with Redis SETNX + TTL. Enable multi-instance deployment safety.

**Acceptance Criteria**:
- [ac] `ReplayStore` interface with `claimOnce(key, ttlSeconds)` method
- [ac] `InMemoryReplayStore` for tests (replaces module-level `Set`)
- [ac] `RedisReplayStore` with `SET key "1" NX EX ttlSeconds` atomic claim
- [ac] `verifyHitlToken()` and `verifyEventSignature()` accept optional `ReplayStore`
- [ac] Multi-worker concurrency test: 10 parallel `claimOnce()` calls → exactly 1 succeeds
- [ac] TTL auto-expiry: JTI key TTL = remaining token lifetime; nonce key TTL = remaining freshness window
- [ac] Fail-closed: store errors → rejection (not silent pass)
- [ac] All 39 existing SP-11/SP-14 tests pass without modification

**Files**:
- Create: `packages/hitl-gateway/src/replay/replay-store.ts` (interface)
- Create: `packages/hitl-gateway/src/replay/in-memory-replay-store.ts`
- Create: `packages/hitl-gateway/src/replay/redis-replay-store.ts`
- Create: `packages/hitl-gateway/src/replay/index.ts`
- Modify: `packages/hitl-gateway/src/tokens/jwt-manager.ts` (inject store)
- Modify: `packages/hitl-gateway/src/events/event-signer.ts` (inject store)
- Modify: `packages/hitl-gateway/src/index.ts` (re-export)
- Modify: `packages/hitl-gateway/package.json` (add `ioredis` dep)
- Create: `packages/hitl-gateway/tests/replay/replay-store.test.ts`
- Create: `packages/hitl-gateway/tests/replay/concurrency.test.ts`

**Dependencies**: HITL-03, HITL-04 (replay store injection points)

**Interface Design**:
```typescript
export interface ReplayStore {
  /**
   * Atomically claims a key. Returns ok:true on first claim, ok:false on duplicate.
   * TTL ensures auto-cleanup after the security window closes.
   * Fail-closed: store errors return ok:false with reason 'store-error'.
   */
  claimOnce(key: string, ttlSeconds: number): Promise<
    { ok: true } | { ok: false; reason: 'duplicate' | 'store-error' }
  >;
}
```

**Backward Compatibility Strategy**:
```typescript
// existing signature preserved — store is optional trailing parameter
export async function verifyHitlToken(
  token: string,
  secrets: string | string[],
  options: VerifyOptions,
  replayStore?: ReplayStore,  // new — defaults to InMemoryReplayStore
): Promise<Result<HitlTokenPayload, { reason: TokenRejectionReason; message: string }>>

export function verifyEventSignature<T>(
  event: SignedEvent<T>,
  secret: string,
  maxAgeMs?: number,
  replayStore?: ReplayStore,  // new — defaults to InMemoryReplayStore
): Result<T, { reason: RejectionReason; message: string }>
```

**TTL Policy**:
- JTI key: `exp - now` (remaining token lifetime, max 3600s)
- Nonce key: `maxAge - eventAge` (remaining freshness window, default max 300s)

**TDD Micro-Tasks**:
1. Red: Test `ReplayStore.claimOnce()` returns `{ ok: true }` first time
2. Green: Implement `InMemoryReplayStore` with Map + setTimeout cleanup
3. Red: Test duplicate claim returns `{ ok: false, reason: 'duplicate' }`
4. Green: Check-and-set in Map
5. Red: Test 10 concurrent `claimOnce()` calls — exactly 1 succeeds
6. Green: Implement `RedisReplayStore` with `SET key "1" NX EX ttl`
7. Red: Test TTL expiry — claim succeeds after TTL elapses
8. Green: Rely on Redis native EX behavior
9. Red: Test fail-closed — store error returns `{ ok: false, reason: 'store-error' }`
10. Green: Wrap Redis calls in try/catch
11. Refactor: Inject store into `verifyHitlToken()` and `verifyEventSignature()`
12. Verify: All 39 existing tests pass unchanged (default to in-memory)

---

### Phase 2: Core APIs & Notifications (Days 5–7)

#### HITL-05: Create Request API (3 SP)

**Description**: API to create HITL approval requests, mint tokens, and persist request state.

**Acceptance Criteria**:
- [ac] `POST /api/v1/hitl` creates request with `pending` status
- [ac] Zod-validated input (workflowId, domain, actionType, summary, approverId)
- [ac] Mints JWT token, stores only `tokenHash` in DB
- [ac] Returns request ID and approval/rejection action URLs
- [ac] RFC 7807 ProblemDetails on validation failure
- [ac] Authenticated (Supabase JWT required)

**Files**:
- Create: `apps/web/src/app/api/v1/hitl/route.ts`
- Create: `packages/hitl-gateway/src/request/request-service.ts`
- Create: `packages/hitl-gateway/src/request/request-types.ts`
- Create: `packages/hitl-gateway/src/request/index.ts`
- Create: `packages/hitl-gateway/tests/request/request-service.test.ts`

**Dependencies**: HITL-01 (schema), HITL-03 (token generation)

**TDD Micro-Tasks**:
1. Red: Test `createRequest()` returns Result with request ID and token
2. Green: Implement service with DB insert + token generation
3. Red: Test invalid input returns validation error
4. Green: Add Zod schema validation
5. Red: Test duplicate token hash returns conflict
6. Green: Handle unique constraint violation
7. Refactor: Extract shared ProblemDetails mapper

---

#### HITL-06: Approve/Reject APIs (3 SP)

**Description**: Decision endpoints with token verification, idempotency, and conflict handling.

**Acceptance Criteria**:
- [ac] `POST /api/v1/hitl/:requestId/approve` and `/reject` endpoints
- [ac] Token verification (signature, expiry, replay, audience)
- [ac] First-writer-wins: `unique(request_id)` on decisions table → 409 on conflict
- [ac] Idempotent: same approver + same decision on same request → 200 (not 409)
- [ac] 410 Gone on expired request
- [ac] Emits `hitl/decision.recorded` Inngest event on success (for HITL-07)
- [ac] Atomic: decision insert + request status update in single transaction

**Files**:
- Create: `apps/web/src/app/api/v1/hitl/[requestId]/approve/route.ts`
- Create: `apps/web/src/app/api/v1/hitl/[requestId]/reject/route.ts`
- Create: `packages/hitl-gateway/src/decision/decision-service.ts`
- Create: `packages/hitl-gateway/src/decision/decision-types.ts`
- Create: `packages/hitl-gateway/src/decision/index.ts`
- Create: `packages/hitl-gateway/tests/decision/decision-service.test.ts`

**Dependencies**: HITL-02 (decision schema), HITL-04 (token verification), CF-03 (replay store)

**TDD Micro-Tasks**:
1. Red: Test `recordDecision()` returns Result with decision record
2. Green: Implement transactional insert (decision + request status update)
3. Red: Test duplicate decision returns conflict error
4. Green: Handle unique constraint violation → map to 409
5. Red: Test 10 concurrent approve calls — exactly 1 succeeds
6. Green: Rely on DB unique constraint for atomicity
7. Red: Test expired request returns 410
8. Green: Check `tokenExpiresAt < now` before processing
9. Red: Test Inngest event emission on successful decision
10. Green: Add `inngest.send()` after transaction commit
11. Refactor: Share error mapping across approve/reject routes

---

#### HITL-08: Novu Notifications (3 SP)

**Description**: Trigger Novu notification with approval/rejection links when HITL request is created.

**Acceptance Criteria**:
- [ac] Novu trigger sends email with approve/reject action URLs
- [ac] Template variables: `{{approverName}}`, `{{summary}}`, `{{approveUrl}}`, `{{rejectUrl}}`, `{{expiresAt}}`
- [ac] `transactionId` uses request ID for dedup (SP-04 pattern)
- [ac] Delivery failures are logged but don't block request creation
- [ac] Fire-and-forget pattern (same as LLM usage logging)

**Files**:
- Create: `packages/hitl-gateway/src/notifications/novu-adapter.ts`
- Create: `packages/hitl-gateway/src/notifications/notification-types.ts`
- Create: `packages/hitl-gateway/src/notifications/index.ts`
- Create: `packages/hitl-gateway/tests/notifications/novu-adapter.test.ts`

**Dependencies**: HITL-05 (request creation provides context for notification)

**Reuse Assessment**: SP-04 patterns (template rendering, dedup, delivery tracking) reusable. Novu SDK adapter is new.

**TDD Micro-Tasks**:
1. Red: Test `sendApprovalNotification()` calls Novu trigger with correct template vars
2. Green: Implement with mock Novu client (SDK-decoupled, same pattern as LLM providers)
3. Red: Test dedup — same transactionId doesn't duplicate
4. Green: Use requestId as transactionId
5. Red: Test delivery failure returns Result.err but doesn't throw
6. Green: Wrap in try/catch, log error, return err

---

#### HITL-11: Session Revocation API (2 SP) — closes S1-W5

**Description**: Application-level session revocation endpoint enabling immediate session invalidation beyond Supabase defaults.

**Acceptance Criteria**:
- [ac] `POST /api/v1/auth/sessions/:sessionId/revoke` endpoint
- [ac] Optional `revokeAll=true` query parameter to revoke all user sessions
- [ac] Revoked sessions rejected by auth middleware on subsequent requests
- [ac] Only session owner or admin can revoke
- [ac] Closes WARNING S1-W5

**Files**:
- Create: `apps/web/src/app/api/v1/auth/sessions/[sessionId]/revoke/route.ts`
- Create: `packages/hitl-gateway/src/auth/session-revocation.ts`
- Create: `packages/hitl-gateway/tests/auth/session-revocation.test.ts`

**Dependencies**: None (decoupled from HITL token system — this is about Supabase auth sessions)

**TDD Micro-Tasks**:
1. Red: Test revoke endpoint returns 200 on valid session
2. Green: Implement Supabase admin `signOut()` call
3. Red: Test revoked session is rejected on next API call
4. Green: Add revocation check to auth middleware
5. Red: Test unauthorized revocation attempt returns 403
6. Green: Add ownership/admin check

---

### RBAC Foundation (Days 5–7, parallel with Phase 2)

#### ID-01: RBAC Schema (2 SP)

**Description**: Define role and permission tables for platform-wide access control.
**FRD**: FR-CORE-ID-002

**Acceptance Criteria**:
- [ac] `user_roles` table with user-to-role mapping, domain scoping, granted_by/granted_at audit columns
- [ac] Core roles seeded: `admin`, `user`, `viewer`
- [ac] Domain roles extensible via `domain` column (e.g., `trader`, `recruiter` in Sprint 6-7)
- [ac] `role_permissions` table mapping roles to permission strings (e.g., `hitl:approve`, `llm:query`, `admin:users`)
- [ac] Schema exported from `@aptivo/database`

**Files**:
- Create: `packages/database/src/schema/user-roles.ts`
- Create: `packages/database/src/schema/role-permissions.ts`
- Modify: `packages/database/src/schema/index.ts`, `packages/database/src/index.ts`

**Dependencies**: None

**Schema Design**:
```typescript
export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  domain: varchar('domain', { length: 50 }), // null = platform-wide
  grantedBy: uuid('granted_by').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  index('user_roles_user_id_idx').on(table.userId),
  index('user_roles_role_domain_idx').on(table.role, table.domain),
  // active role = revokedAt IS NULL
]);

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  role: varchar('role', { length: 50 }).notNull(),
  permission: varchar('permission', { length: 100 }).notNull(),
}, (table) => [
  index('role_permissions_role_idx').on(table.role),
  // unique(role, permission) prevents duplicate grants
]);
```

**TDD Micro-Tasks**:
1. Red: Import `userRoles` from `@aptivo/database` — fails (module not found)
2. Green: Define `pgTable('user_roles', { ... })` with all columns
3. Red: Assert `rolePermissions` table has unique constraint on `(role, permission)`
4. Green: Add unique index
5. Red: Verify core roles can be seeded (`admin`, `user`, `viewer`)
6. Green: Add seed script / migration with default roles and permissions

---

#### ID-02: RBAC Middleware (3 SP)

**Description**: Role-checking middleware for API routes with default-deny enforcement.
**FRD**: FR-CORE-ID-002

**Acceptance Criteria**:
- [ac] `requireRole(role)` middleware factory rejects requests from users without the specified role
- [ac] `requirePermission(permission)` middleware factory checks `role_permissions` mapping
- [ac] Default-deny: requests without a valid role assignment are rejected with 403
- [ac] Domain-scoped: middleware can check domain-specific roles (e.g., `trader` in `crypto` domain)
- [ac] Role checks query DB with caching (short TTL to balance freshness vs performance)
- [ac] HITL approval APIs (HITL-05, HITL-06) wired with `requirePermission('hitl:approve')`

**Files**:
- Create: `packages/hitl-gateway/src/auth/rbac-middleware.ts`
- Create: `packages/hitl-gateway/src/auth/rbac-types.ts`
- Create: `packages/hitl-gateway/tests/auth/rbac-middleware.test.ts`
- Modify: `apps/web/src/app/api/v1/hitl/route.ts` (add middleware)
- Modify: `apps/web/src/app/api/v1/hitl/[requestId]/approve/route.ts` (add middleware)
- Modify: `apps/web/src/app/api/v1/hitl/[requestId]/reject/route.ts` (add middleware)

**Dependencies**: ID-01 (role schema)

**TDD Micro-Tasks**:
1. Red: Test `requireRole('admin')` rejects user without admin role → 403
2. Green: Implement middleware that queries `user_roles` for active role
3. Red: Test `requireRole('admin')` allows user with admin role → passes through
4. Green: Return next() when role found
5. Red: Test `requirePermission('hitl:approve')` checks role → permission mapping
6. Green: Join `user_roles` + `role_permissions` in query
7. Red: Test domain-scoped role check — user has `trader` in `crypto` but not `hr`
8. Green: Add domain filter to role query
9. Red: Test role cache — second call within TTL doesn't hit DB
10. Green: Add in-memory cache with configurable TTL (default 60s)
11. Refactor: Wire middleware into HITL API routes

---

### Phase 3: Workflow Integration & UI (Days 8–10)

#### HITL-07: Inngest Integration (5 SP)

**Description**: Wire end-to-end pause/resume using Inngest `step.waitForEvent()` for HITL approval flows.

**Acceptance Criteria**:
- [ac] Inngest function creates HITL request via `step.run('create-hitl-request', ...)`
- [ac] Notification triggered via `step.run('send-notification', ...)`
- [ac] `step.waitForEvent('wait-for-decision', { event: 'hitl/decision.recorded', match: 'data.requestId', timeout: '24h' })` pauses workflow
- [ac] Approve path: workflow resumes with decision data
- [ac] Reject path: workflow branches to rejection handler
- [ac] Timeout path: `null` return → marks request as `expired`, runs cleanup
- [ac] Pre-wait steps are memoized (not re-executed on resume — SP-02 validated)
- [ac] Uses `safeSagaStep` pattern (coding guidelines §8b)

**Files**:
- Create: `packages/hitl-gateway/src/workflow/hitl-step.ts`
- Create: `packages/hitl-gateway/src/workflow/event-schemas.ts`
- Create: `packages/hitl-gateway/src/workflow/index.ts`
- Create: `packages/hitl-gateway/tests/workflow/hitl-step.test.ts`
- Modify: `apps/web/src/lib/inngest.ts` (register events)
- Modify: `apps/web/src/app/api/inngest/route.ts` (register function)

**Dependencies**: HITL-05, HITL-06

**Reuse Assessment**: SP-02 `waitForEvent` pattern directly reusable. Event names/contracts migrate from spike namespace to production.

**Event Flow**:
```
1. Trigger event: 'workflow/step.requires-approval'
2. step.run('create-hitl-request') → DB insert + token mint
3. step.run('send-notification') → Novu trigger (fire-and-forget)
4. step.waitForEvent('wait-for-decision', {
     event: 'hitl/decision.recorded',
     match: 'data.requestId',
     timeout: '24h'
   })
5. Decision API (HITL-06) records decision → emits 'hitl/decision.recorded'
6. Inngest resumes:
   - event !== null → check decision → approve/reject branch
   - event === null → timeout → mark expired → cleanup branch
```

**TDD Micro-Tasks**:
1. Red: Test approval path — `InngestTestEngine` with mocked waitForEvent returning approval event
2. Green: Implement function with `step.waitForEvent()` + approve branch
3. Red: Test rejection path — event returns `decision: 'rejected'`
4. Green: Add rejection branch
5. Red: Test timeout path — `null` return from waitForEvent
6. Green: Add timeout → expired handling
7. Red: Test memoization — pre-wait step handler called exactly once
8. Green: Verify memoization (inherent in Inngest)
9. Red: Test requestId correlation — wrong requestId doesn't resume
10. Green: `match: 'data.requestId'` in waitForEvent config

**Key Design Decision — Token TTL vs Wait Timeout**:
> The JWT has a 1-hour hard cap (`MAX_TTL_SECONDS = 3600`) but `waitForEvent` uses a 24h timeout. Strategy: the approval link URL includes the request ID (not the JWT). The approval UI page (HITL-09) validates the request status and re-checks token freshness. For email links, the 1-hour token expiry is the effective approval window; for web UI access, the user authenticates via Supabase session and can act within the 24h workflow timeout.

---

#### HITL-09: Approval UI Page (3 SP)

**Description**: Next.js App Router page for approvers to review and act on HITL requests.

**Acceptance Criteria**:
- [ac] `/hitl/:requestId` page renders request summary, details, expiry countdown
- [ac] Approve and Reject buttons with optional comment field
- [ac] Clear feedback for terminal states: already approved, already rejected, expired
- [ac] Token-based access (from email link) or session-based access (logged-in user)
- [ac] Mobile-responsive layout
- [ac] Server Actions for approve/reject (Next.js App Router pattern)

**Files**:
- Create: `apps/web/src/app/hitl/[requestId]/page.tsx`
- Create: `apps/web/src/app/hitl/[requestId]/actions.ts`
- Create: `apps/web/src/app/hitl/[requestId]/components.tsx`

**Dependencies**: HITL-06 (approve/reject APIs)

**TDD Micro-Tasks**:
1. Red: Test page renders request summary for valid request ID
2. Green: Implement server component with DB query
3. Red: Test expired request shows appropriate message
4. Green: Check `tokenExpiresAt < now` and render expired state
5. Red: Test approve action calls API and shows success
6. Green: Implement Server Action calling HITL-06 endpoint
7. Refactor: Add loading states and error boundaries

---

#### HITL-10: Integration Tests (3 SP)

**Description**: End-to-end validation of the HITL lifecycle — create → notify → decide → resume.

**Acceptance Criteria**:
- [ac] Happy path: create → approve → workflow resumes with `approved` status
- [ac] Reject path: create → reject → workflow takes rejection branch
- [ac] Timeout path: create → wait expires → request marked `expired`
- [ac] Race test: 10 concurrent approvals → exactly 1 succeeds, 9 get 409
- [ac] Replay test: reused token rejected with `replayed-jti`
- [ac] 80%+ branch coverage on `@aptivo/hitl-gateway`
- [ac] All tests pass: `pnpm test`, `pnpm typecheck`, `pnpm build`

**Files**:
- Create: `packages/hitl-gateway/tests/integration/hitl-flow.test.ts`
- Create: `packages/hitl-gateway/tests/integration/hitl-race.test.ts`

**Dependencies**: All HITL tasks + CF-03

**TDD Micro-Tasks**:
1. Red: Integration test — full happy path with mock Inngest engine
2. Green: Wire all services together with in-memory stores
3. Red: Test concurrent decision race
4. Green: Verify unique constraint provides first-writer-wins
5. Red: Test replay attack across create-verify-replay cycle
6. Green: Verify ReplayStore rejects duplicate JTI
7. Refactor: Coverage gap analysis and targeted test additions

---

## 2. Dependency Graph

```
HITL-01 ──────────────────────────┐
   │                              │
   ▼                              │
HITL-02 ──────────────────────┐   │
                              │   │
HITL-03 ──┐                  │   │
   │      │                  │   │
   ▼      │                  │   │
HITL-04   │                  │   │
   │      │                  │   │
   ▼      │                  │   │
  CF-03 ──┘                  │   │
   │                         │   │
   ├─────────────────────────┤   │
   │                         │   │
   ▼                         ▼   ▼
HITL-06 ◄──── HITL-02     HITL-05 ◄── HITL-01, HITL-03
   │                         │        ◄── ID-02 (middleware wired to routes)
   ├──────┬──────────────────┤
   │      │                  │
   ▼      ▼                  ▼
HITL-09  HITL-07 ◄────── HITL-08
            │
            ▼
         HITL-10

ID-01 ──► ID-02 ──► HITL-05/06 routes (middleware applied)

HITL-11 (independent — no HITL dependencies)
```

**Critical Path**: `HITL-01 → HITL-03 → HITL-04 → CF-03 → HITL-06 → HITL-07 → HITL-10`

**Parallelization Opportunities**:
- HITL-01 + HITL-03 can start in parallel (schemas + tokens are independent)
- HITL-11 and ID-01 are fully independent — assign from day 1
- ID-02 runs parallel with Phase 2 APIs; wired into routes when both are ready
- HITL-08 (Novu) can run in parallel with HITL-06 once HITL-05 is done
- HITL-09 (UI) can run in parallel with HITL-07 once HITL-06 is done

---

## 3. Reuse Map

| Component | Source | Reuse % | Changes Needed |
|-----------|--------|---------|----------------|
| JWT generation | `packages/hitl-gateway/src/tokens/jwt-manager.ts` | 90% | Add replay store injection point |
| JWT verification | Same file | 85% | Refactor replay check to use `ReplayStore` |
| Event signing | `packages/hitl-gateway/src/events/event-signer.ts` | 85% | Inject `ReplayStore` into `verifyEventSignature()` |
| waitForEvent pattern | `apps/spike-runner/src/sp-02-hitl-wait.ts` | 70% | Migrate event names, add production error handling |
| Novu integration | `apps/spike-runner/src/sp-04-novu-notifications.ts` | 60% | Extract adapter, add typed Result surface |
| Test patterns | SP-11/SP-14 test files (39 tests) | 95% | All pass unchanged with default in-memory store |
| Result types | `@aptivo/types` | 100% | Already in use |
| Adapter pattern | `@aptivo/llm-gateway` BudgetStore/UsageStore/RateLimitStore | Pattern | Replicate for ReplayStore |

---

## 4. Risk Areas

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Redis SETNX concurrency** | HIGH | Front-load CF-03 in week 1; multi-worker test suite with real Redis in CI |
| **Token TTL vs approval window** | MEDIUM | Decouple approval link from JWT — URL contains requestId, UI validates request status; JWT is short-lived auth token, workflow timeout is 24h |
| **Inngest event correlation** | MEDIUM | Strict `match: 'data.requestId'` filter; validate requestId existence in decision ingress |
| **Novu template configuration** | LOW | Create templates in Novu dashboard before HITL-08; document required template IDs |
| **UI patterns not established** | LOW | Keep HITL-09 minimal; use Next.js Server Components + Server Actions |
| **RBAC scope creep** | LOW | Phase 1 = core roles + permission middleware only; domain roles deferred to Sprint 6-7 |
| **41 SP in 2 weeks** | MEDIUM | ~14 SP/developer; RBAC tasks are mechanical; mitigate by front-loading critical path, keeping UI minimal, reusing spike code aggressively |

---

## 5. Sprint Sequencing

| Day | Senior | Web Dev 1 | Web Dev 2 |
|-----|--------|-----------|-----------|
| 1-2 | HITL-01, HITL-02 | HITL-03, HITL-04 | HITL-11, ID-01 |
| 3-4 | CF-03 | CF-03 tests | HITL-08 (Novu adapter) |
| 5-6 | HITL-05 | HITL-06, ID-02 | HITL-08 (integration) |
| 7-8 | HITL-07 | HITL-09 | ID-02 (wire to routes) |
| 9-10 | HITL-10 | HITL-10 | Coverage + docs |

---

## 6. Verification Steps

```bash
# per-package
pnpm -F @aptivo/hitl-gateway test
pnpm -F @aptivo/hitl-gateway test:coverage  # 80% gate
pnpm -F @aptivo/hitl-gateway typecheck

# database
pnpm -F @aptivo/database typecheck

# web app
pnpm -F @aptivo/web typecheck

# monorepo
pnpm test
pnpm typecheck
pnpm build
```

---

## 7. Definition of Done Cross-Reference

| DoD Item | Task(s) | Evidence |
|----------|---------|----------|
| Workflow can pause for human approval *(HITL-002)* | HITL-07 | InngestTestEngine tests: wait, resume, timeout |
| Approval via web UI resumes workflow *(HITL-002, HITL-005)* | HITL-09, HITL-07 | UI page + Server Action → Inngest event → resume |
| Email notification sent with approve/reject links *(HITL-005)* | HITL-08 | Novu adapter tests with template variable validation |
| RBAC schema deployed with core roles *(ID-002)* | ID-01 | Migration + seed data for admin/user/viewer |
| RBAC middleware enforces default-deny *(ID-002)* | ID-02 | Middleware tests: reject without role, allow with role |
| Session revocation endpoint functional *(ID-003, S1-W5)* | HITL-11 | API test + middleware rejection test |
| JTI and nonce replay stores backed by Redis SETNX + TTL *(C1)* | CF-03 | ReplayStore interface + RedisReplayStore + concurrency tests |
| Multi-worker concurrency tests pass for replay protection *(C1)* | CF-03 | 10 concurrent claimOnce() → exactly 1 succeeds |
| 80%+ test coverage | HITL-10 | `pnpm -F @aptivo/hitl-gateway test:coverage` |

---

## 8. FRD Coverage Tracking

| FRD Requirement | Sprint 2 Task | Coverage |
|-----------------|---------------|----------|
| FR-CORE-HITL-001 Create Requests | HITL-05 | Full |
| FR-CORE-HITL-002 Suspension/Resumption | HITL-07 | Full |
| FR-CORE-HITL-003 Approve/Reject/Changes | HITL-06 | Scope-limited (approve/reject only) |
| FR-CORE-HITL-004 Approval Policies | - | Scope-limited (single-approver + TTL) |
| FR-CORE-HITL-005 Multi-Channel Endpoints | HITL-08, HITL-09 | Full |
| FR-CORE-HITL-006 Audit HITL Actions | HITL-06 | Partial (completed in Sprint 4 AUD-03) |
| FR-CORE-ID-002 RBAC | ID-01, ID-02 | Full |
| FR-CORE-ID-003 Session Management | HITL-11 | Scope-limited (revocation only) |

## 9. WARNING Closure Tracking

| WARNING | Finding | Sprint 2 Task | Acceptance Criteria |
|---------|---------|---------------|---------------------|
| S1-W5 | Session revocation lacks app-level API | HITL-11 | `POST /api/v1/auth/sessions/:id/revoke` functional |
| C1 | In-memory replay stores in multi-node | CF-03 | Redis SETNX + TTL with multi-worker concurrency tests |
