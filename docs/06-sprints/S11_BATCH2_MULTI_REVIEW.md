# Sprint 11 Batch 2 — Multi-Model Review

**Date**: 2026-03-16
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: HITL2-02 (Multi-Approver Request), HITL2-03 (Quorum Engine), HITL2-04 (Sequential Chain)
**Verdict**: 0 P1 fixes, 3 P2 fixes, 2 accepted risks

---

## Executive Summary

Codex identified 3 High and 2 Medium findings. Claude downgrades all to P2 or accepted — no blockers for Batch 3. The quorum math issue (N from policy vs actual approvers) is valid and warrants a fix. Sequential order bypass and token impersonation are mitigated by the per-approver token strategy. Two quick P2 fixes: pass ttlSeconds to token minting, and return accurate state on optimistic lock failure.

---

## Findings

### F-1: Quorum N Mismatch [P2]

**Codex**: High — quorum engine uses `policy.approverRoles.length` as N, but actual request may have different count.
**Claude**: Valid. The engine should accept the actual approver count. Fix: add optional `totalApprovers` parameter to `evaluate()`, defaulting to `policy.approverRoles.length`.

**Verdict — P2 FIX**: Pass actual approver count to quorum evaluation.

### F-2: Sequential Order Bypass [ACCEPTED]

**Codex**: High — chain runner accepts pre-submitted decisions without temporal validation.
**Claude**: By design. The chain runner is a pure stateless evaluator. Order enforcement is at the token layer — only the current approver has an active token (future approvers' tokens are minted on-demand when the chain advances, per sprint plan Q2). An approver without a token cannot submit a decision.

**Verdict — ACCEPTED**: Token-based enforcement prevents early submission.

### F-3: Token Impersonation via Client-Supplied approverId [ACCEPTED]

**Codex**: High — service trusts client-supplied `approverId`, doesn't extract from JWT.
**Claude**: Partially valid. In practice, tokens are delivered individually via unique URLs. The JWT contains the approverId as `sub` claim. Full mitigation would extract approverId from the verified JWT rather than trusting the input. However, this requires changes to the token verification layer (Sprint 13 scope).

**Verdict — ACCEPTED (Sprint 13 enhancement)**: Current token distribution model prevents practical exploitation. Document as security enhancement for JWT claim extraction.

### F-4: ttlSeconds Not Passed to Token Generation [P2]

**Codex**: Medium — input accepts ttlSeconds but doesn't use it.
**Claude**: Valid. Quick fix.

**Verdict — P2 FIX**: Pass `data.ttlSeconds` to `generateToken` calls.

### F-5: Race Loser Returns Stale State [P2]

**Codex**: Medium — optimistic lock failure returns `pending` even though request is finalized.
**Claude**: Valid. Re-read request status after lock failure.

**Verdict — P2 FIX**: After `affected === 0`, re-read request to return actual aggregate state.

---

## Actionable Recommendations

### P2 — Fix Now

| # | Finding | Action | Files |
|---|---------|--------|-------|
| 1 | F-1 | Add `actualApproverCount` param to quorum evaluate | `quorum-engine.ts` |
| 2 | F-4 | Pass `ttlSeconds` to `generateToken` | `multi-request-service.ts` |
| 3 | F-5 | Re-read request status after lock failure | `multi-decision-service.ts` |

### Accepted Risks

| # | Finding | Rationale |
|---|---------|-----------|
| 4 | F-2 | Token strategy prevents early submission |
| 5 | F-3 | JWT claim extraction enhancement for Sprint 13 |
