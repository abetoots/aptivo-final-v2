# Sprint 18 A1 — Multi-Model Review

**Date**: 2026-04-29
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dfaa5-397a-71c1-aac6-375452b25a58`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `c7c5400f-ad9d-481f-9a22-faf6661f6b9e`).
**Subject**: Sprint 18 A1 implementation batch — workflow → user actor propagation closing Gates #2/#3.
**Outcome**: Round 1 — Codex NO-GO (5 findings, including 1 HIGH-severity logic defect); Gemini GO-conditional (4 findings, 1 HIGH on test isolation). Round 2 after fixes — **GO from both reviewers** with 2 non-blocking documentation cleanups (also applied).

---

## Executive Summary

Sprint 18 A1 closes the Gates #2/#3 carry-forward from S17: workflow audit emits now populate `audit_logs.user_id` when a HITL approver acts, so the anomaly gate's aggregate query matches non-zero rows on workflow traffic. Pre-S18 the workflow tree used `actor.type='workflow'` or `'system'` everywhere — both produce `NULL` user_id per the `actor.type === 'user' ? actor.id : null` mapping at `audit-service.ts:61`, leaving the gate inert.

The batch ships in seven commits: foundation interfaces (centralized `ActorType` + helper + typed wrapper), gateway-call migration, audit-emitter migration to user attribution, CI grep gate, integration test, contract tightening (centralized HITL payload types), and the round-1 review fixes consolidated below.

Both reviewers ran genuine audits. Codex caught the load-bearing logic defect — `HitlDecisionPayload` was over-widened for `hitl/decision.recorded`, advertising `'request_changes'` as a possible decision value on a channel the gateway never emits it through. Gemini caught the test-isolation HIGH (module-scoped audit store letting state leak across tests) and the regex brittleness (gate hardcoded to `gateway.complete(`, missed `llm.complete(`/`client.complete(`/destructured calls).

A pre-existing concern surfaced during review — the HR contract approval workflow waits for `hr/contract.decision.submitted`, an event with no production emitter anywhere in `apps/` or `packages/`. The HR workflow may not be reachable end-to-end from real HITL traffic until a bridge from `hitl/decision.recorded` lands. This was not introduced by A1 and is documented as a carry-forward for the HR domain track.

---

## Round 1 Findings

### Codex — NO-GO (5 findings)

#### 🚨 HIGH #2 — `HitlDecisionPayload` over-widened for `hitl/decision.recorded`

> The widening is correct only if you are describing a generic "decision-ish payload", not the actual `hitl/decision.recorded` stream. The gateway-level event schema in `packages/hitl-gateway/src/workflow/event-schemas.ts:40` defines `decision: 'approved' | 'rejected'` — the gateway routes `'request_changes'` through a different event name (`hitl/changes.requested`) per `decision-service.ts:236`.

**Impact**: registering `hitl/decision.recorded` with `HitlDecisionPayload` (which includes `'request_changes'`) advertises an impossible value on this channel. Workflow consumers could write conditional branches handling a value that will never arrive.

**Fix applied**: split into two types in `packages/types/src/events/hitl.ts` —
- `HitlDecisionRecorded` — narrow (`'approved' | 'rejected'`), used for the gateway-level event
- `HitlDecisionPayload` — wider (includes `'request_changes'`), used for per-domain wrappers like `hr/contract.decision.submitted` whose producers handle the change-request loop in-domain

`apps/web/src/lib/inngest.ts` registers `hitl/decision.recorded` with the narrow type. Side effect: `crypto-paper-trade.ts` had a `decisionData.decision === 'request_changes'` branch on the gateway-level event — unreachable per the narrowed type. The branch and the corresponding `'changes-requested'` member of `PaperTradeResult` were removed (per CLAUDE.md: don't keep branches for scenarios that can't happen).

#### 🚨 HIGH #3 — Test isolation in the integration test

> `auditStore` is module-scoped and never reset at `actor-propagation.integration.test.ts:133`, and `beforeEach` resets mocks but not the store. That means the second test's `count >= 1` assertion can succeed from the row inserted by the first test even if the current execution emitted nothing.

**Same finding from Gemini at HIGH severity.** Module-scoped singletons in vitest leak state across `it` blocks. The `aggregateAccessPattern` count assertion was loose enough (`>= 1`) that a leak could mask a broken implementation.

**Fix applied**: lifted `auditStore` and `realAuditService` initialization into a `beforeEach` hook. The `getAuditService` mock closure now reads through a mutable binding so beforeEach swaps propagate. Mock fixtures reset via `vi.clearAllMocks()`. Aggregate-count assertion tightened from `>= 1` to `=== 1` since each test starts with an empty store.

#### 🟡 MEDIUM #4 — `completeWorkflowRequest` gate is partial; CI grep regex too narrow

> A caller can still silently reintroduce zero-count behavior by passing `actor: undefined` even when `requestedBy` exists, or by bypassing the wrapper entirely. The CI gate only matches the exact token `gateway.complete(`, so `llm.complete(`, `client.complete(`, destructuring, optional chaining, or moving the direct call into a helper outside `src/lib/workflows` all evade it.

**Same finding from Gemini at MEDIUM severity.**

**Fix applied (regex part)**: widened the CI gate's `VIOLATION_REGEX` from `\bgateway\.complete\s*\(` to `/\.\s*complete\s*\(/`. Inside `apps/web/src/lib/workflows/*` non-test there's no legitimate `.complete(` call — the wrapper lives in `apps/web/src/lib/llm/`, outside the scanned scope — so widening is safe. Catches `llm.complete(`, `client.complete(`, destructured intermediate variables, and `someGateway.complete(` shapes.

**Not fixed (deliberate scope decision)**: the wrapper-bypass concern (passing `actor: undefined` when `requestedBy` is available, or moving the direct call into a helper outside the scanned scope) is a code-review concern that no source-text gate can fully eliminate. The wrapper signature makes the choice explicit; the CI gate prevents the most common drift; reviewers handle the rest.

#### 🟡 MEDIUM #5 — `hr-candidate-flow` taxonomy inconsistency

> The actor contract says `'system'` is for external triggers and `'workflow'` is for internal maintenance work at `packages/types/src/actor.ts:23`. `hr/application.received` is described in comments as an external trigger, but the audit emit still uses `'workflow'` at `hr-candidate-flow.ts:232`. That does not break anomaly counting, but it is semantically inconsistent.

**Same finding from Gemini at MEDIUM severity.**

**Fix applied**: changed `actor.type='workflow'` → `'system'` for the application-receipt audit. Test assertion in `s6-hr-01-candidate-flow.test.ts:460` updated to match. Same NULL user_id outcome; correct provenance string lands in `audit_logs.actor_type`.

#### 🚨 HIGH #1 — No production emitter for `hr/contract.decision.submitted` (NOT FIXED, scoped out)

> The real decision producers emit `hitl/decision.recorded` or `hitl/changes.requested`, not the HR-specific wrapper: see `packages/hitl-gateway/src/decision/decision-service.ts:235` and `multi-decision-service.ts:152`. I also could not find any production sender for `hr/contract.decision.submitted` under `apps/` or `packages/`; it only appears in tests, docs, the Inngest schema, and the workflow wait. So the strongest new test is not exercising real workflow traffic, and the HR workflow itself looks unable to resume from real HITL decisions.

**Disposition — pre-existing carry-forward**: this is not an A1-introduced bug. The HR contract workflow has never had a bridge from `hitl/decision.recorded` to `hr/contract.decision.submitted` in any prior sprint. The gap was masked because all prior tests injected the synthetic event directly via `InngestTestEngine`, which is a legitimate workflow-testing technique but doesn't exercise the cross-event-bridge integration.

**What A1's integration test still proves**: the actor-propagation mechanism — `audit-service.ts:61` mapping (`actor.type → user_id`) and the in-memory aggregate filter — works correctly when a decision payload arrives with `approverId`. The mechanism is decoupled from which workflow emits the audit; once the HR bridge lands the same mechanism applies.

**What it doesn't prove**: that the HR contract workflow specifically is reachable from production HITL traffic. The integration test header was updated to call out this scope limitation explicitly (Codex round-2 caught the doc drift).

**Carry-forward**: documented in `docs/06-sprints/sprint-18-plan.md` risk table for the HR domain track. Likely landing point: B2 HR onboarding (which builds new HITL flows that should use the gateway-level event directly) or a dedicated HR-bridge task in S19/Phase 3.5.

### Gemini — GO-conditional (4 findings, 3 overlapping with Codex)

Gemini caught:
- The test-isolation HIGH (overlap with Codex #3, both HIGH)
- CI grep regex MEDIUM (overlap with Codex #4)
- hr-candidate-flow taxonomy MEDIUM (overlap with Codex #5)
- **Unique LOW**: `hr/interview.scheduling.requested` schema lacks `requestedBy` — interview-scheduling audits will be system-attributed even if a recruiter manually initiated them.

**Gemini's unique finding deferred**: `hr/interview.scheduling.requested` `requestedBy` is correct work but out of A1 scope (A1 covers gateway-call migration + audit-emitter migration in 4 specific workflow files; interview-scheduling is a separate workflow that doesn't have an LLM gateway call). Captured as a follow-up item for a future HR domain sprint.

Gemini missed Codex's HIGH #1 (no production emitter for `hr/contract.decision.submitted`) and HIGH #2 (HitlDecisionPayload over-widening). Both required reading the hitl-gateway emit code to spot — Codex's deeper trace through `packages/hitl-gateway/src/decision/*` made the difference.

---

## Round 2 — Applied Fixes

Commit `6def0c3` consolidates the round-1 fixes:

| Finding | Severity | Fix location |
|---|---|---|
| HitlDecisionPayload over-widened (Codex HIGH #2) | HIGH | `packages/types/src/events/hitl.ts` (split types), `apps/web/src/lib/inngest.ts:280` (narrow registration), `apps/web/src/lib/workflows/crypto-paper-trade.ts` (dead branch removal) |
| Test isolation (Codex HIGH #3 + Gemini HIGH) | HIGH | `apps/web/tests/llm/actor-propagation.integration.test.ts` (beforeEach reset, exact-count assertion) |
| CI grep regex too narrow (Codex MED #4 + Gemini MED) | MEDIUM | `apps/web/tests/s18-a1-workflow-gateway-call.doclint.test.ts:60` (widened to `/\.\s*complete\s*\(/`) |
| hr-candidate-flow taxonomy (Codex MED #5 + Gemini MED) | MEDIUM | `apps/web/src/lib/workflows/hr-candidate-flow.ts:233` (workflow → system), `apps/web/tests/s6-hr-01-candidate-flow.test.ts:460` (test) |
| HR contract workflow unreachable (Codex HIGH #1) | HIGH | NOT FIXED — pre-existing carry-forward, scoped out, documented |

Codex round-2 verdict: **GO** with two non-blocking cleanups (stale comment in `crypto-paper-trade.ts`, integration-test header overstating scope). Both applied as commit `<this commit>`.

Gemini round-2 verdict: **GO** ("pit of success by default", all concerns resolved).

---

## Reviewer Calibration

This is the third A1-class review pair across S17/S18. Pattern continues to hold:

- **Codex strengths**: traces references through multi-package emit chains, catches state-machine and channel-routing defects (the `request_changes` over-widening required reading `decision-service.ts:236` to know it routes to a different event). Round-1 caught 1 HIGH (the load-bearing one) that Gemini missed.
- **Gemini strengths**: catches test-quality and lint-tooling concerns sharply — the test-isolation HIGH and the regex-brittleness MED both came from Gemini at round-1. Faster on the doc-drift and structural-quality side.

Both reviewers' MEDIUMs overlapped this round (3 of 4 each), demonstrating complementary blind spots rather than duplicated work. Continue running both for Sprint 18 task-level reviews.

No prompt-injection attempts this round (Gemini round-2 in the plan-review session had one). Both reviewers stayed in scope.

---

## Provenance

- **Codex via MCP thread `019dfaa5-397a-71c1-aac6-375452b25a58`** (GPT-5, sandbox read-only). Round 1: 5 findings (1 HIGH + 1 HIGH + 2 MED + 1 HIGH). Round 2: GO + 2 non-blocking doc cleanups.
- **Gemini via `mcp__pal__clink`** (continuation `c7c5400f-ad9d-481f-9a22-faf6661f6b9e`, `gemini-3-flash-preview`). Round 1: 4 findings (1 HIGH + 2 MED + 1 LOW). Round 2: GO.
- **Lead (Claude Opus 4.7)**: applied all in-scope fixes; explicitly scoped out the HR-contract-workflow unreachability as a pre-existing concern; updated integration-test header to honestly frame what the test does and doesn't prove.

---

## Commits (in order)

| Commit | Description |
|---|---|
| `30ad1ce` | A1 foundation — centralized `ActorType`, `resolveWorkflowActor`, `completeWorkflowRequest` |
| `32f550d` | A1 gateway wrapper migration — 5 callsites |
| `cd0ecc1` | A1 audit emitters — actor.type='user' for HITL flows |
| `7f4fb85` | A1 CI grep gate — vitest doclint |
| `5748c7b` | A1 actor-propagation integration test |
| `8d11b1e` | Contract tightening — centralized `HitlDecisionPayload`, drop `as` casts |
| `6def0c3` | Round-1 review fixes (HitlDecisionRecorded split, test isolation, regex widening, taxonomy fix) |
| `<this commit>` | Round-2 review cleanups (stale comments, doc-honesty fixes) + this review doc |

---

## Carry-Forwards

1. **HR contract workflow unreachability** (pre-existing): no production emitter for `hr/contract.decision.submitted`; HR workflow can't resume from real HITL decisions. Track in HR domain backlog. Likely owner: B2 HR onboarding sprint (which can use `hitl/decision.recorded` directly) or a dedicated HR-bridge task.

2. **Interview-scheduling `requestedBy`** (Gemini round-1 LOW): `hr/interview.scheduling.requested` event lacks `requestedBy`, so interview-scheduling audits stay system-attributed. Captured as follow-up item; would be addressed alongside any future LLM-gateway integration in interview workflows.

3. **Wrapper-bypass via helper indirection** (Codex round-1 MED, partially mitigated): the CI grep gate scans `apps/web/src/lib/workflows/*` non-test paths only. A future contributor could move a direct `.complete(` call into a helper outside that scope. Reviewer discipline + the typed wrapper signature handle this; no source-text gate can fully eliminate it. Acceptable residual risk.
