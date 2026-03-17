# Sprint 11 Batch 1 — Multi-Model Review

**Date**: 2026-03-16
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: HITL2-00 (Session Blacklist), HITL2-01 (Approval Policy), HITL2-06 (Parent/Child Orchestration)
**Verdict**: 0 P1 fixes, 1 P2 fix, 5 items planned for later batches or accepted

---

## Executive Summary

Codex flags 3 items as "High" — all 3 are intentionally deferred to later Batch tasks per the sprint plan. `request_changes` not wired in gateway → planned for HITL2-05. Decision store single-result queries → planned for HITL2-03. Serial child waiting → P2 design limitation documented. One P2 fix warranted: tighten approval policy Zod validation edge cases.

---

## Findings

### F-1: request_changes Not Wired in Gateway [PLANNED — HITL2-05]

**Codex**: High — DB enum includes `request_changes` but gateway decision schema rejects it.
**Claude**: By design. Batch 1 adds the DB enum value as foundation. HITL2-05 ("Request Changes Decision Type", 3 SP) extends the gateway service. The enum must exist in the DB before the service can use it.

### F-2: Decision Store Assumes Single Decision [PLANNED — HITL2-03]

**Codex**: High — `getDecisionByRequestId()` returns one row; multi-approver needs plural.
**Claude**: By design. HITL2-03 ("Quorum Decision Engine", 5 SP) adds multi-decision query methods to the store. The existing single-decision methods remain for backward compatibility.

### F-3: Serial Child Waiting [P2 — DOCUMENTED LIMITATION]

**Codex**: High — sequential `for` loop means effective timeout is N * childTimeout.
**Claude**: Valid. Inngest's `step.waitForEvent` is a server-side pause, but the sequential loop means child 2's wait doesn't start until child 1 resolves. Parallel waiting would require `step.parallel()` or `Promise.all` on Inngest steps. Document as known limitation — parallel child waiting is a Sprint 13 enhancement.

### F-4: Policy Validation Edge Cases [P2]

**Codex**: Medium — `threshold` allowed for non-quorum types, `escalateToRole` not required with `escalate` action, duplicate roles allowed.
**Claude**: Valid. Tighten Zod refinements.

### F-5: Correlation Filter String Interpolation [ACCEPTED]

**Codex**: Medium — unescaped ID interpolation in filter string.
**Claude**: All IDs are UUIDs (no single quotes). Accepted risk.

### F-6: No DB Check Constraints [ACCEPTED]

**Codex**: Medium — relies on app-layer validation only.
**Claude**: Project pattern. All Aptivo tables use Zod validation at the app layer.

### F-7: Session Blacklist Fire-and-Forget [ACCEPTED]

**Codex**: Medium — best-effort, not guaranteed.
**Claude**: Already accepted in S10 review. 900s TTL matches JWT lifetime.

---

## Actionable Recommendations

### P2 — Fix Now

| # | Finding | Action | Files |
|---|---------|--------|-------|
| 1 | F-4 | Tighten policy Zod: forbid threshold for non-quorum, require escalateToRole with escalate action | `policy-types.ts` |

### Planned for Later Batches

| # | Finding | Batch |
|---|---------|-------|
| 2 | F-1 | HITL2-05 (request_changes gateway wiring) |
| 3 | F-2 | HITL2-03 (multi-decision store methods) |
| 4 | F-3 | Document as limitation; Sprint 13 parallel child enhancement |
