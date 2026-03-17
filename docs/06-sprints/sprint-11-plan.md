# Sprint 11 Implementation Plan: Multi-Approver HITL + Advanced Workflows

**Theme**: "Many voices, one gate" — quorum approval, sequential chains, parent/child orchestration
**Duration**: 2 weeks (Phase 2, Weeks 5-6)
**Total Story Points**: 29 SP (10 tasks)
**Packages**: `@aptivo/hitl-gateway` (policy, engine, types) + `@aptivo/database` (schema, adapters) + `apps/web` (workflows, routes, composition root)
**FRD Coverage**: FR-CORE-HITL-003 (approve/reject/request-changes), FR-CORE-HITL-004 (multi-approver, quorum, sequential), FR-CORE-WFE-007 (parent/child orchestration)
**Sprint 10 Residuals**: 1/1 absorbed (session DELETE token blacklisting — D-4)
**Derived from**: [Phase 2 Sprint Plan](./phase-2-sprint-plan.md) Sprint 3, [S10 Plan](./sprint-10-plan.md) §9
**Multi-Model Review**: [S11_PLAN_MULTI_REVIEW.md](./S11_PLAN_MULTI_REVIEW.md) — Claude Opus 4.6 + Codex/GPT

---

## Executive Summary

Sprint 11 transforms the HITL gateway from a single-approver approve/reject system into a configurable multi-approver engine supporting quorum consensus (e.g., 2-of-3), sequential approval chains, and a "request changes" decision type with bounded re-submission. It also introduces parent/child workflow orchestration via Inngest event correlation (WFE-007), enabling complex domain workflows where a parent workflow spawns child workflows and waits for their completion.

The existing HITL data model (`hitl_requests`, `hitl_decisions`) is extended with an `approval_policies` table and new columns for multi-approver tracking. Critically, all changes are backward compatible — existing single-approver requests continue to work, with the policy defaulting to `single` type. The HR contract approval workflow upgrades to multi-approver (HR + legal), and the crypto paper trade workflow upgrades to quorum-based approval (2-of-3 risk committee).

### Sprint 10 Baseline (What Exists)

| Component | Sprint 10 State | Sprint 11 Target |
|-----------|----------------|-----------------|
| HITL decisions | Approve/reject only | Approve/reject/request-changes + quorum aggregation |
| Approval policy | Single approver with TTL | Configurable: single, quorum (M-of-N), sequential |
| Decision schema | `uniqueIndex` on requestId (1 decision) | Multiple decisions per request (one per approver) |
| Workflows | Single-step HITL, flat | Parent/child orchestration via Inngest event correlation |
| HR contract | Single hiring manager approval | Multi-approver: HR reviewer + legal reviewer |
| Crypto trade | Single trader approval | Quorum: 2-of-3 risk committee |
| Token strategy | Single token per request | Per-approver tokens bound to individual approverIds |

---

## 1. Task Breakdown

### Phase 1: Policy Foundation (Days 1-3)

#### HITL2-00: Session DELETE Token Blacklisting (1 SP)

**Description**: Wire the `DELETE /api/auth/sessions/:id` route to blacklist the session's JWT after removal. This is Sprint 10 residual D-4 — session termination currently removes the session from Redis but does not blacklist the associated token, leaving a window where revoked tokens remain valid until natural expiry.

**Acceptance Criteria**:
- [ac] `DELETE /api/auth/sessions/:id` calls `getTokenBlacklist().blacklist(jti, expiresAt)` after successful `removeSession()`
- [ac] If blacklist service is null (no Redis), session removal still succeeds (graceful degradation)
- [ac] Blacklist TTL matches the token's remaining lifetime (not a hardcoded value)
- [ac] Tests verify token is rejected after session deletion
- [ac] Tests verify graceful fallback when blacklist service is unavailable

**Files**:
- Modify: `apps/web/src/app/api/auth/sessions/[id]/route.ts`
- Create: `apps/web/tests/s11-hitl2-00-session-blacklist.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: After `DELETE /api/auth/sessions/:id`, token with matching jti is blacklisted
2. Green: Import `getTokenBlacklist` and call `blacklist(jti, expiresAt)` after `removeSession()`
3. Red: When blacklist service is null, DELETE still returns 200
4. Green: Guard blacklist call with null check

---

#### HITL2-01: Approval Policy Model + Schema (4 SP)

**Description**: Define the approval policy data model that governs how multi-approver requests are evaluated. Create the `approval_policies` table, TypeScript interfaces, Zod validation schemas, and a Drizzle adapter. Extend the `hitl_requests` table with a `policyId` column and the `hitl_decisions` table to allow multiple decisions per request (remove the unique constraint on `requestId`, add a unique constraint on `requestId + approverId`). Add `request_changes` to the decision enum.

**Acceptance Criteria**:
- [ac] `approval_policies` table with columns: `id`, `name`, `type` (single | quorum | sequential), `threshold` (for quorum, e.g., 2), `approverRoles` (jsonb array of role identifiers), `maxRetries` (for request-changes, default 3), `timeoutSeconds`, `escalationPolicy` (jsonb, nullable), `createdAt`
- [ac] `ApprovalPolicy` TypeScript interface and `ApprovalPolicySchema` Zod validator
- [ac] Policy types: `single` (backward compat, 1-of-1), `quorum` (M-of-N), `sequential` (ordered chain)
- [ac] `hitl_requests.policyId` nullable FK → `approval_policies.id` (null = legacy single-approver)
- [ac] `hitl_requests.retryCount` integer default 0 (tracks request-changes re-submissions)
- [ac] `hitl_decisions` unique constraint changed from `requestId` to `(requestId, approverId)` — allows multiple approvers
- [ac] `hitl_decision` enum extended with `request_changes` value
- [ac] `createDrizzleApprovalPolicyStore(db)` with CRUD: `create`, `findById`, `findByName`, `list`
- [ac] Barrel export in `packages/database/src/adapters/index.ts`
- [ac] Backward compat: existing requests without policyId continue to work as single-approver

**Files**:
- Create: `packages/database/src/schema/approval-policies.ts`
- Modify: `packages/database/src/schema/hitl-requests.ts` (add `policyId`, `retryCount`)
- Modify: `packages/database/src/schema/hitl-decisions.ts` (unique constraint change, enum extension)
- Create: `packages/hitl-gateway/src/policy/policy-types.ts`
- Create: `packages/database/src/adapters/approval-policy-store.ts`
- Modify: `packages/database/src/adapters/index.ts` (barrel export)
- Create: `apps/web/tests/s11-hitl2-01-approval-policy.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `ApprovalPolicySchema.parse({ type: 'quorum', threshold: 2, approverRoles: ['hr', 'legal'] })` succeeds
2. Green: Define Zod schema with `type` discriminated union, `threshold` required for quorum, `approverRoles` array
3. Red: `ApprovalPolicySchema.parse({ type: 'quorum', threshold: 0 })` fails (threshold must be >= 1)
4. Green: Add `.min(1)` constraint on threshold
5. Red: `createDrizzleApprovalPolicyStore(db).create(policy)` returns `{ id }` with generated UUID
6. Green: Implement INSERT with returning
7. Red: `.findById(id)` returns the created policy
8. Green: Implement SELECT with id filter
9. Red: `.findByName('hr-contract-dual')` returns matching policy
10. Green: Implement SELECT with name filter
11. Red: Multiple decisions for the same request but different approvers are allowed
12. Green: Migrate unique constraint from `requestId` to `(requestId, approverId)`

---

### Phase 2: Multi-Approver Engine (Days 3-6)

#### HITL2-02: Multi-Approver Request Creation + Per-Approver Tokens (4 SP)

**Description**: Extend the request creation service to support multi-approver requests. When a policy is attached, the service creates one HITL request row but mints N separate JWT tokens — one per approver — each bound to a specific `approverId`. The existing `createRequest` function continues to work for single-approver requests (backward compat). A new `createMultiApproverRequest` function handles multi-approver scenarios.

**Acceptance Criteria**:
- [ac] `CreateMultiApproverRequestInput` schema: extends base input, replaces single `approverId` with `approverIds: string[]`, adds `policyId: string`
- [ac] `createMultiApproverRequest(input, deps)` creates one `hitl_requests` row with `policyId` set
- [ac] Mints N separate JWT tokens, each with the approver's ID encoded in the `sub` claim
- [ac] Each token's hash is stored in a new `hitl_request_tokens` join table: `(requestId, approverId, tokenHash, tokenExpiresAt)`
- [ac] Returns `MultiApproverRequestResult` with per-approver URLs: `{ requestId, approvers: [{ approverId, token, approveUrl, rejectUrl }] }`
- [ac] `createRequest` (single-approver) unchanged — backward compatible
- [ac] Policy validation: approverIds.length must satisfy policy (e.g., quorum threshold <= approverIds.length)
- [ac] Composition root: `getHitlMultiApproverService()` wired in `services.ts`
- [ac] Tests for multi-token generation, per-approver URL generation, policy validation

**Files**:
- Create: `packages/hitl-gateway/src/request/multi-request-types.ts`
- Create: `packages/hitl-gateway/src/request/multi-request-service.ts`
- Modify: `packages/hitl-gateway/src/request/index.ts` (export new service)
- Modify: `packages/hitl-gateway/src/index.ts` (barrel export)
- Create: `packages/database/src/schema/hitl-request-tokens.ts`
- Modify: `packages/database/src/adapters/hitl-store-drizzle.ts` (token join table operations)
- Modify: `apps/web/src/lib/services.ts` (add `getHitlMultiApproverService`)
- Create: `apps/web/tests/s11-hitl2-02-multi-request.test.ts`

**Dependencies**: HITL2-01

**TDD Micro-Tasks**:
1. Red: `createMultiApproverRequest({ approverIds: ['a1', 'a2', 'a3'], policyId: 'p1' }, deps)` returns result with 3 approver entries
2. Green: Iterate approverIds, mint token per approver, collect results
3. Red: Each approver's token contains their `approverId` in the payload
4. Green: Pass `approverId` as `sub` claim to `generateHitlToken`
5. Red: Token hashes are stored in `hitl_request_tokens` table
6. Green: Implement INSERT for join table rows
7. Red: `createMultiApproverRequest` with 1 approver on a quorum-2 policy returns validation error
8. Green: Validate `approverIds.length >= policy.threshold`
9. Red: Original `createRequest` still works for single-approver
10. Green: No changes to `createRequest` — backward compat preserved

---

#### HITL2-03: Quorum Decision Engine + Aggregate State Transitions (5 SP)

**Description**: Build the quorum decision engine that evaluates individual approver decisions against the policy threshold to determine the aggregate request outcome. When the M-th approval arrives (in an M-of-N quorum), the request transitions to `approved`. If enough rejections arrive to make quorum impossible, the request transitions to `rejected`. Race condition protection via database-level optimistic locking ensures double-finalization cannot occur.

**Acceptance Criteria**:
- [ac] `QuorumEngine` interface: `evaluateDecision(requestId, decision, policy)` → `QuorumResult`
- [ac] `QuorumResult`: `{ aggregate: 'pending' | 'approved' | 'rejected', approvalsCount, rejectionsCount, threshold, isFinalized }`
- [ac] Quorum approval: met when `approvalsCount >= policy.threshold`
- [ac] Quorum rejection: met when `rejectionsCount > (approverCount - policy.threshold)` (impossible to reach threshold)
- [ac] Single-approver mode: 1-of-1 quorum (backward compat path through same engine)
- [ac] `recordMultiApproverDecision(input, deps)` verifies per-approver token, records individual decision, runs quorum evaluation
- [ac] Optimistic lock: `UPDATE hitl_requests SET status = $1, resolved_at = $2 WHERE id = $3 AND status = 'pending'` — returns affected rows; if 0, another approver finalized first (safe no-op)
- [ac] Event emission: `hitl/decision.recorded` fires only when aggregate state changes (not per individual decision)
- [ac] Duplicate decision by same approver: idempotent (returns existing decision, does not re-evaluate quorum)
- [ac] Tests for 2-of-3 quorum: first approval → pending, second approval → approved
- [ac] Tests for 2-of-3 quorum: two rejections → rejected (impossible to reach threshold)
- [ac] Tests for race condition: two simultaneous finalizing decisions — only one succeeds

**Files**:
- Create: `packages/hitl-gateway/src/policy/quorum-engine.ts`
- Create: `packages/hitl-gateway/src/decision/multi-decision-service.ts`
- Create: `packages/hitl-gateway/src/decision/multi-decision-types.ts`
- Modify: `packages/hitl-gateway/src/decision/index.ts` (export)
- Modify: `packages/hitl-gateway/src/index.ts` (barrel export)
- Modify: `packages/database/src/adapters/hitl-store-drizzle.ts` (multi-decision queries)
- Create: `apps/web/tests/s11-hitl2-03-quorum-engine.test.ts`

**Dependencies**: HITL2-01, HITL2-02

**TDD Micro-Tasks**:
1. Red: `evaluateDecision` with 1 approval on 2-of-3 policy returns `{ aggregate: 'pending', approvalsCount: 1 }`
2. Green: Count approvals, compare to threshold
3. Red: 2nd approval on 2-of-3 policy returns `{ aggregate: 'approved', isFinalized: true }`
4. Green: `approvalsCount >= threshold` → `approved`
5. Red: 2 rejections on 2-of-3 policy returns `{ aggregate: 'rejected' }` (only 1 remaining approver, can't reach 2)
6. Green: `rejectionsCount > (N - threshold)` → `rejected`
7. Red: `recordMultiApproverDecision` verifies per-approver token and records decision
8. Green: Lookup token from `hitl_request_tokens` by `(requestId, approverId)`, verify JWT, insert decision
9. Red: Optimistic lock prevents double-finalization when two approvers submit simultaneously
10. Green: `UPDATE ... WHERE status = 'pending'` returns affectedRows; skip event emission if 0
11. Red: Duplicate decision by same approver returns existing decision (idempotent)
12. Green: Check `getDecisionByRequestAndApprover(requestId, approverId)` before insert

---

#### HITL2-04: Sequential Chain Execution + Timeout Escalation (2 SP)

**Description**: Implement sequential approval chains where approvers are processed in order. The first approver must decide before the second approver's token is activated. If an approver times out, escalation promotes the next approver in the chain. This is an MVP implementation — escalation is automatic (no admin UI).

**Acceptance Criteria**:
- [ac] Sequential policy stores an ordered `approverRoles` array
- [ac] `SequentialChainRunner` interface: `getNextApprover(requestId, policy)` → next approver or null (chain complete)
- [ac] Only the current approver's token is active; previous approvers cannot retroactively decide
- [ac] When current approver times out, the chain advances to the next approver automatically
- [ac] Timeout escalation: Inngest cron/sleep step that checks sequential request state and advances chain
- [ac] Chain completion: all approvers approved → request `approved`; any rejection → request `rejected`
- [ac] Tests for 3-step sequential: approver A approves → approver B approves → approver C approves → request approved
- [ac] Tests for timeout escalation: approver A times out → approver B becomes active

**Files**:
- Create: `packages/hitl-gateway/src/policy/sequential-chain.ts`
- Modify: `packages/hitl-gateway/src/policy/quorum-engine.ts` (shared evaluation helpers)
- Create: `apps/web/tests/s11-hitl2-04-sequential-chain.test.ts`

**Dependencies**: HITL2-01, HITL2-02

**TDD Micro-Tasks**:
1. Red: `getNextApprover` on a fresh 3-step chain returns the first approver
2. Green: Read decisions for request, return first approverRole without a decision
3. Red: After first approver approves, `getNextApprover` returns second approver
4. Green: Filter decisions, return next in ordered list
5. Red: After all 3 approve, `getNextApprover` returns null (chain complete)
6. Green: All roles have decisions → return null
7. Red: Any rejection short-circuits chain → request rejected
8. Green: Check for rejections before advancing
9. Red: Timeout escalation advances chain to next approver
10. Green: Inngest sleep step + state check + token mint for next approver

---

### Phase 3: Request Changes + Orchestration (Days 5-8)

#### HITL2-05: "Request Changes" Decision Type with Re-Submission Loop (3 SP)

**Description**: Add a `request_changes` decision type that reopens the request with reviewer feedback, allowing the original requester to modify and re-submit. Bounded to a configurable maximum retries (default 3) stored in the approval policy. Each re-submission resets the token TTL and increments the retry counter.

**Acceptance Criteria**:
- [ac] `RecordDecisionInputSchema.decision` extended: `'approved' | 'rejected' | 'request_changes'`
- [ac] `request_changes` decision sets request status to `changes_requested` (new status in hitl_status enum)
- [ac] Decision record includes `feedback` field (required for request_changes, optional for approve/reject)
- [ac] `resubmitRequest(requestId, updatedDetails, deps)` increments `retryCount`, resets status to `pending`, mints new token
- [ac] Re-submission rejected if `retryCount >= policy.maxRetries` (returns `MaxRetriesExceededError`)
- [ac] Inngest event `hitl/changes.requested` emitted on request_changes decision (separate from `hitl/decision.recorded`)
- [ac] Workflow can `waitForEvent('hitl/changes.requested')` to handle re-submission flow
- [ac] Tests for request-changes → re-submit → approve flow
- [ac] Tests for max retries exceeded (3 request-changes → 4th blocked)

**Files**:
- Modify: `packages/hitl-gateway/src/decision/decision-types.ts` (extend schema)
- Modify: `packages/hitl-gateway/src/decision/decision-service.ts` (handle request_changes)
- Create: `packages/hitl-gateway/src/request/resubmit-service.ts`
- Modify: `packages/database/src/schema/hitl-requests.ts` (add `changes_requested` to enum)
- Modify: `packages/hitl-gateway/src/workflow/event-schemas.ts` (add changes.requested event)
- Create: `apps/web/tests/s11-hitl2-05-request-changes.test.ts`

**Dependencies**: HITL2-03

**TDD Micro-Tasks**:
1. Red: `recordDecision({ decision: 'request_changes', comment: 'fix salary range' })` sets status to `changes_requested`
2. Green: Extend decision handler with `request_changes` branch, update request status
3. Red: `resubmitRequest(requestId, { salary: '120k' })` increments retryCount and resets status to `pending`
4. Green: UPDATE hitl_requests SET retryCount = retryCount + 1, status = 'pending', mint new token
5. Red: 4th re-submission on a maxRetries=3 policy returns `MaxRetriesExceededError`
6. Green: Check `retryCount >= policy.maxRetries` before allowing re-submission
7. Red: `request_changes` emits `hitl/changes.requested` event (not `hitl/decision.recorded`)
8. Green: Branch event emission by decision type
9. Red: `request_changes` without comment/feedback returns validation error
10. Green: Make `comment` required when decision is `request_changes`

---

#### HITL2-06: Parent/Child Workflow Orchestration via Inngest (4 SP)

**Description**: Implement parent/child workflow orchestration using Inngest event correlation (WFE-007). A parent workflow spawns child workflows by emitting trigger events with a `parentWorkflowId` correlation key. Child workflows emit a completion event when finished. The parent uses `step.waitForEvent` to pause until all children complete. This is independent of the HITL multi-approver changes and can proceed in parallel.

**Acceptance Criteria**:
- [ac] `WorkflowOrchestrator` interface: `spawnChild(parentId, childEvent)`, `waitForChildren(parentId, childCount, timeout)`
- [ac] Child events include `parentWorkflowId` field for correlation
- [ac] Child completion event: `workflow/child.completed` with `{ parentWorkflowId, childWorkflowId, result }`
- [ac] Parent waits for N child completions using `step.waitForEvent` in a loop with correlation filter
- [ac] Timeout handling: if any child fails to complete within timeout, parent receives partial results
- [ac] Orphan protection: child workflows that outlive their parent emit a warning event
- [ac] New Inngest event types added to `inngest.ts`: `workflow/child.spawned`, `workflow/child.completed`
- [ac] `createOrchestratedWorkflow(inngest, config)` factory function for creating parent workflows
- [ac] Tests for parent spawning 2 children, both complete → parent resumes
- [ac] Tests for 1 child timeout → parent gets partial results

**Files**:
- Create: `packages/hitl-gateway/src/workflow/orchestrator.ts`
- Create: `packages/hitl-gateway/src/workflow/orchestrator-types.ts`
- Modify: `packages/hitl-gateway/src/workflow/event-schemas.ts` (child lifecycle events)
- Modify: `packages/hitl-gateway/src/workflow/index.ts` (export)
- Modify: `packages/hitl-gateway/src/index.ts` (barrel export)
- Modify: `apps/web/src/lib/inngest.ts` (add orchestration event types)
- Create: `apps/web/tests/s11-hitl2-06-parent-child.test.ts`

**Dependencies**: None (independent of HITL changes)

**TDD Micro-Tasks**:
1. Red: `spawnChild(parentId, childEvent)` emits event with `parentWorkflowId` set
2. Green: Wrap `inngest.send()` with parentWorkflowId injection
3. Red: `waitForChildren(parentId, 2, '30m')` pauses until 2 `workflow/child.completed` events arrive
4. Green: Loop `step.waitForEvent` with correlation filter `async.data.parentWorkflowId == parentId`
5. Red: Child timeout returns partial results with `{ completed: 1, timedOut: 1 }`
6. Green: Handle null from `waitForEvent` as timeout, collect partial results
7. Red: Child completion event includes parent correlation key
8. Green: Emit `workflow/child.completed` with `parentWorkflowId` in data
9. Red: `createOrchestratedWorkflow` factory produces a valid Inngest function
10. Green: Implement factory with configurable child count and timeout

---

### Phase 4: Domain Integration (Days 7-9)

#### HITL2-07: Domain Workflow Upgrades (HR Contract + Crypto Trade) (3 SP)

**Description**: Upgrade the existing HR contract approval and crypto paper trade workflows to use the multi-approver engine. HR contract approval switches from single hiring manager to dual approval (HR reviewer + legal reviewer). Crypto paper trade switches from single trader to 2-of-3 risk committee quorum. Both workflows use the parent/child orchestration pattern for complex multi-step approval flows.

**Acceptance Criteria**:
- [ac] HR contract approval: creates approval policy `{ type: 'sequential', approverRoles: ['hr_reviewer', 'legal_reviewer'] }`
- [ac] HR workflow uses `createMultiApproverRequest` with the sequential policy
- [ac] HR workflow waits for sequential chain completion (both approvers must approve in order)
- [ac] Crypto paper trade: creates approval policy `{ type: 'quorum', threshold: 2, approverRoles: ['risk_analyst', 'risk_analyst', 'risk_manager'] }`
- [ac] Crypto workflow uses `createMultiApproverRequest` with the quorum policy
- [ac] Crypto workflow waits for 2-of-3 quorum decision
- [ac] Both workflows handle `request_changes` decision (re-submission loop)
- [ac] Backward compat: workflows detect whether multi-approver service is available, fall back to single-approver
- [ac] New Inngest event types for multi-approver HITL decisions registered in `inngest.ts`
- [ac] Tests for HR dual-approval happy path
- [ac] Tests for crypto 2-of-3 quorum happy path

**Files**:
- Modify: `apps/web/src/lib/workflows/hr-contract-approval.ts`
- Modify: `apps/web/src/lib/workflows/crypto-paper-trade.ts`
- Modify: `apps/web/src/lib/inngest.ts` (new HITL v2 event types)
- Modify: `apps/web/src/lib/services.ts` (multi-approver service getter)
- Create: `apps/web/tests/s11-hitl2-07-domain-workflows.test.ts`

**Dependencies**: HITL2-03, HITL2-06

**TDD Micro-Tasks**:
1. Red: HR contract workflow creates a sequential policy with HR + legal roles
2. Green: Call `createMultiApproverRequest` with sequential policy in the `hitl-approval` step
3. Red: HR workflow waits for two sequential approvals before finalizing
4. Green: Use `waitForEvent` with sequential chain completion event
5. Red: Crypto workflow creates a 2-of-3 quorum policy
6. Green: Call `createMultiApproverRequest` with quorum policy in the `hitl-request` step
7. Red: Crypto workflow resolves after 2 of 3 approvers approve
8. Green: Use `waitForEvent` with quorum finalization event
9. Red: Both workflows handle `request_changes` and re-submit
10. Green: Add `waitForEvent('hitl/changes.requested')` branch with re-submission logic

---

### Phase 5: Integration & Closure (Day 10)

#### HITL2-08: Integration Tests (2 SP)

**Description**: Cross-cutting integration tests verifying the full multi-approver lifecycle: policy creation → multi-request → quorum/sequential decision → workflow resumption. Tests cover race conditions, timeout escalation, and backward compatibility with single-approver flows.

**Acceptance Criteria**:
- [ac] E2E: Create quorum policy → create multi-approver request → record 2-of-3 decisions → request approved
- [ac] E2E: Create sequential policy → record decisions in order → chain complete → request approved
- [ac] E2E: Sequential chain with timeout → escalation to next approver
- [ac] E2E: Request changes → re-submit → approve flow
- [ac] E2E: Parent workflow spawns 2 child workflows → both complete → parent resumes with results
- [ac] E2E: Legacy single-approver request (no policyId) works unchanged
- [ac] E2E: Simultaneous quorum finalization (race condition) — only one status update succeeds
- [ac] All Sprint 11 code uses composition root (no direct constructor calls)

**Files**:
- Create: `apps/web/tests/s11-hitl2-08-integration.test.ts`

**Dependencies**: HITL2-00 through HITL2-07

**TDD Micro-Tasks**:
1. Red: Full quorum lifecycle test — policy → request → 2 approvals → approved
2. Green: Wire all services, run through complete flow
3. Red: Sequential lifecycle test — policy → request → approve in order → approved
4. Green: Simulate sequential approval chain with ordered decisions
5. Red: Race condition test — 2 simultaneous final decisions, only 1 finalizes
6. Green: Verify optimistic lock via concurrent `recordMultiApproverDecision` calls
7. Red: Legacy single-approver test — existing API unchanged
8. Green: Call `createRequest` without policyId, verify standard flow

---

#### HITL2-09: HITL v2 Documentation (1 SP)

**Description**: Update the HITL TSD and ADD sections for the multi-approver engine, quorum model, sequential chains, request-changes loop, and parent/child orchestration.

**Acceptance Criteria**:
- [ac] TSD §HITL updated: multi-approver request flow, quorum evaluation algorithm, sequential chain logic
- [ac] ADD §4.1 updated: per-approver token strategy, multi-token security model
- [ac] ADD §8 (new subsection): parent/child workflow orchestration pattern (WFE-007)
- [ac] ADD §HITL updated: approval policy model, backward compatibility guarantees
- [ac] RTM updated: FR-CORE-HITL-003 and FR-CORE-HITL-004 mapped to Sprint 11 tasks
- [ac] Sequence diagrams: quorum flow, sequential flow, request-changes loop

**Files**:
- Modify: `docs/04-specs/platform-core/hitl-gateway.md` (TSD updates)
- Modify: `docs/03-architecture/platform-core-add.md` (ADD updates)

**Dependencies**: HITL2-00 through HITL2-08

---

## 2. Dependency Graph

```
Phase 1 (Days 1-3) — Foundation:
  HITL2-00 (Session Blacklist, 1SP) ─── no deps ─────────┐
  HITL2-01 (Policy Model, 4SP) ─── no deps ──────────────┤
                                                           │
Phase 2 (Days 3-6) — Multi-Approver Engine:                │
  HITL2-02 (Multi-Request, 4SP) ← HITL2-01                │
  HITL2-03 (Quorum Engine, 5SP) ← HITL2-01, HITL2-02     │
  HITL2-04 (Sequential, 2SP) ← HITL2-01, HITL2-02        │
                                                           │
Phase 3 (Days 5-8) — Request Changes + Orchestration:     │
  HITL2-05 (Request Changes, 3SP) ← HITL2-03              │
  HITL2-06 (Parent/Child, 4SP) ─── no deps ──────────────┤
                                                           │
Phase 4 (Days 7-9) — Domain Integration:                   │
  HITL2-07 (Domain Workflows, 3SP) ← HITL2-03, HITL2-06  │
                                                           ▼
Phase 5 (Day 10):
  HITL2-08 (Integration Tests, 2SP) ← all above
  HITL2-09 (Docs, 1SP) ← all above
```

**Critical path**: HITL2-01 → HITL2-02 → HITL2-03 → HITL2-05 → HITL2-08

**Parallel tracks**:
- Track A (Senior): HITL2-01 → HITL2-02 → HITL2-03 (policy → request → engine)
- Track B (Web Dev 1): HITL2-00 → HITL2-04 → HITL2-07 (residual → sequential → domain)
- Track C (Web Dev 2): HITL2-06 → HITL2-05 → HITL2-09 (orchestration → request-changes → docs)

---

## 3. Architectural Decisions

### Q1: Quorum Model — Configurable Threshold

**Decision**: Quorum is modeled as `M-of-N` where `M` is the `threshold` stored in the approval policy and `N` is the number of assigned approvers. The quorum engine evaluates decisions incrementally: each new decision triggers a re-evaluation. Aggregate state transitions are: `pending → approved` (when approvals >= threshold), `pending → rejected` (when rejections > N - threshold, making quorum impossible). This avoids the need for batch evaluation and supports real-time decision processing.

### Q2: Sequential Chain — Ordered Approval List

**Decision**: Sequential chains store an ordered `approverRoles` array in the approval policy. The chain runner tracks progress by counting completed decisions against the ordered list. Only the current approver's token is active — tokens for future approvers are minted on demand when the chain advances (not upfront). This prevents token expiry issues for later approvers in long chains. Timeout escalation uses an Inngest sleep step that wakes up after the current approver's TTL and advances the chain if no decision was recorded.

### Q3: Request Changes — Bounded Re-Submission

**Decision**: `request_changes` is a new decision type that transitions the request to `changes_requested` status. Re-submission via `resubmitRequest()` resets the status to `pending`, increments `retryCount`, and mints a fresh token. The loop is bounded by `policy.maxRetries` (default 3) to prevent infinite cycles. The `comment` field is mandatory for `request_changes` decisions to ensure the requester receives actionable feedback.

### Q4: Parent/Child Orchestration — Inngest Event Correlation

**Decision**: Parent workflows spawn children by emitting Inngest events with a `parentWorkflowId` correlation key. Children emit `workflow/child.completed` on completion. The parent uses `step.waitForEvent` in a loop (one per expected child) with a correlation filter `async.data.parentWorkflowId == parentId`. Partial completion is supported — if some children timeout, the parent receives partial results and can decide how to proceed. No shared state between parent and child beyond events.

### Q5: Backward Compatibility — Policy Defaults to Single

**Decision**: Existing single-approver requests (where `policyId` is null) continue to work exactly as before. The quorum engine treats `policyId = null` as an implicit `single` policy (1-of-1 threshold). The `hitl_decisions` unique constraint changes from `requestId` to `(requestId, approverId)`, but since single-approver requests have exactly one approver, the constraint behavior is equivalent for legacy data. The `createRequest` function signature and behavior are unchanged.

### Q6: Per-Approver Token Strategy

**Decision**: Each approver in a multi-approver request receives a unique JWT token bound to their `approverId` via the `sub` claim. Token hashes are stored in a `hitl_request_tokens` join table instead of the main `hitl_requests.tokenHash` column (which remains for single-approver backward compat). During verification, the decision service looks up the expected token hash from the join table using `(requestId, approverId)`. This ensures approvers cannot impersonate each other and supports independent token expiry/revocation per approver.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| Session DELETE blacklisting | 1 | **Commit** | S10 residual D-4, security gap |
| Approval policy model + schema | 4 | **Commit** | Foundation for all multi-approver work |
| Multi-approver request creation | 4 | **Commit** | Per-approver token strategy |
| Quorum decision engine | 5 | **Commit** | Core multi-approver evaluation |
| Sequential chain execution | 2 | **Commit** | MVP with timeout escalation |
| Request changes decision type | 3 | **Commit** | FR-CORE-HITL-003 full coverage |
| Parent/child orchestration | 4 | **Commit** | WFE-007 core value |
| Domain workflow upgrades | 3 | **Commit** | Real-world validation of engine |
| Integration tests | 2 | **Commit** | Sprint completion |
| Documentation | 1 | **Commit** | Sprint completion |
| Full delegation admin UI | 5 | **Defer → Sprint 13** | MVP escalation is sufficient |
| Approval chain visualization | 3 | **Defer → Sprint 13** | UI concern, not backend |
| Webhook notifications per approver | 2 | **Defer → Sprint 12** | Novu templates sufficient for now |
| Approval SLA metrics/dashboard | 3 | **Defer → Sprint 12** | Observability enhancement |

**Committed**: 29 SP | **Deferred**: ~13 SP

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | HITL2-01 (4), HITL2-02 (4), HITL2-03 (5) | 13 |
| **Web Dev 1** | HITL2-00 (1), HITL2-04 (2), HITL2-07 (3) | 6 |
| **Web Dev 2** | HITL2-05 (3), HITL2-06 (4), HITL2-09 (1) | 8 |
| **All** | HITL2-08 (2) | 2 |
| **Total** | | **29 SP** |

Senior carries the heaviest load (13 SP) because the policy model, multi-request creation, and quorum engine form a tightly coupled critical path requiring deep understanding of the existing HITL token security model (JWT signing, hash storage, replay prevention). Web Dev 1 handles the session blacklist residual, sequential chains (which build on Senior's quorum foundation), and domain workflow upgrades. Web Dev 2 handles request-changes (independent once quorum engine is done), parent/child orchestration (fully independent), and documentation.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Quorum race condition (double-finalization) | Medium | High | Optimistic lock: `UPDATE ... WHERE status = 'pending'` returns affectedRows; 0 = safe no-op |
| Per-approver token collision | Low | Medium | Each token has unique JTI + approverId binding; hash collision probability negligible |
| Sequential chain stall (approver goes silent) | Medium | Medium | Timeout escalation via Inngest sleep; escalation policy advances chain automatically |
| Request-changes infinite loop | Low | High | Bounded by `policy.maxRetries` (default 3); hard cap enforced in `resubmitRequest()` |
| Parent/child orphan workflows | Medium | Medium | Children include `parentWorkflowId`; orphan detection via Inngest function timeout |
| Decision schema migration (unique constraint change) | Low | High | Additive migration: add new composite unique index before dropping old one; zero-downtime |
| Backward compat regression (single-approver) | Low | High | Explicit integration test (HITL2-08) for legacy single-approver flow; no changes to `createRequest` |
| Token expiry for sequential chain late approvers | Medium | Low | Tokens minted on-demand when chain advances (not upfront); each approver gets fresh TTL |

---

## 7. Definition of Done

- [ ] Session DELETE blacklists token (S10 residual D-4) *(HITL2-00)*
- [ ] `approval_policies` table created with CRUD adapter *(HITL2-01)*
- [ ] `hitl_decisions` unique constraint migrated to `(requestId, approverId)` *(HITL2-01)*
- [ ] `request_changes` decision type added to hitl_decision enum *(HITL2-01)*
- [ ] Multi-approver request creation with per-approver tokens *(HITL2-02)*
- [ ] `hitl_request_tokens` join table with per-approver token hashes *(HITL2-02)*
- [ ] Quorum engine evaluates M-of-N threshold correctly *(HITL2-03)*
- [ ] Optimistic lock prevents double-finalization *(HITL2-03)*
- [ ] Event emission only on aggregate state change *(HITL2-03)*
- [ ] Sequential chain advances approvers in order *(HITL2-04)*
- [ ] Timeout escalation promotes next approver *(HITL2-04)*
- [ ] `request_changes` decision reopens request with feedback *(HITL2-05)*
- [ ] Re-submission bounded by `maxRetries` *(HITL2-05)*
- [ ] Parent/child workflow orchestration via event correlation *(HITL2-06)*
- [ ] HR contract approval uses sequential dual-approver *(HITL2-07)*
- [ ] Crypto paper trade uses 2-of-3 quorum *(HITL2-07)*
- [ ] Backward compat: single-approver requests unchanged *(HITL2-08)*
- [ ] Integration tests pass for quorum, sequential, parent/child *(HITL2-08)*
- [ ] TSD and ADD updated with multi-approver model *(HITL2-09)*
- [ ] 80%+ test coverage on new HITL v2 code
- [ ] CI pipeline green with all tests passing

---

## 8. Doc-Gate Requirement

| Document | Section | Task |
|----------|---------|------|
| `docs/04-specs/platform-core/hitl-gateway.md` | Multi-approver request flow, quorum evaluation, sequential chains | HITL2-09 |
| `docs/03-architecture/platform-core-add.md` | §4.1 Token security (per-approver tokens), §8 Parent/child orchestration (WFE-007) | HITL2-09 |

---

## 9. Sprint 12 Preview

Sprint 12 (Observability + Domain Expansion) builds on Sprint 11's multi-approver infrastructure:

| Item | SP (est.) | Why it needs Sprint 11 |
|------|-----------|----------------------|
| Approval SLA metrics + dashboard | 3 | Needs quorum/sequential timing data from HITL2-03/04 |
| Per-approver webhook notifications | 2 | Needs per-approver token model from HITL2-02 |
| Crypto live-trading workflow | 5 | Needs quorum approval (risk committee sign-off) from HITL2-03 |
| HR onboarding workflow | 4 | Needs sequential chain (multi-department approval) from HITL2-04 |
| Approval chain audit trail | 3 | Needs multi-decision data model from HITL2-01 |
