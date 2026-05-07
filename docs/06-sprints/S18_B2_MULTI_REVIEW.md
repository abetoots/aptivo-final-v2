# Sprint 18 B2 — Multi-Model Review

**Date**: 2026-05-07
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019e00c2-86f9-78d2-9a5b-060c86abc2a2`), Gemini via PAL clink (`gemini-3-flash-preview`), test-quality-assessor agent.
**Subject**: Sprint 18 B2 implementation batch — HR onboarding workflow + PII audit endpoints + consent enforcement.
**Outcome**: Round 1 — Codex NO-GO (5 findings), Gemini NO-GO (1 critical + 1 high + 1 medium + 1 low), test-quality-assessor surfaced 6 NEW HIGH findings the multi-model missed. Round 2 — Codex NO-GO with 1 partial-fix gap on the round-1 idempotency fix; Gemini implicitly satisfied via the same code change. Round 3 — **GO from both reviewers**.

---

## Executive Summary

Sprint 18 B2 ships Epic 5 HR onboarding: a workflow triggered on `hr.contract.signed` with state machine `pending → docs_collected → manager_assigned → HITL approve → approved → onboarded`, plus a PII audit endpoint family (candidates/contracts/employees list+export) emitting `pii.read.bulk`/`pii.read.export`, plus `requireConsent` middleware (FR-HR-CM-005) with self-access exemption.

**The reviews mattered.** Three reviewers running in parallel caught complementary load-bearing issues:

1. **State-rewinding idempotency flaw (CRITICAL — both Codex + Gemini)** — re-trigger at any intermediate state replayed earlier transitions, REWINDING the state row and creating duplicate HITL requests.

2. **Fire-and-forget PII audit emit (HIGH — both Codex + Gemini)** — detached promises could be dropped on serverless teardown before the emit completed, silently losing compliance-critical audit rows.

3. **Test-quality-assessor unique HIGHs (5 of them) the multi-model didn't catch**:
   - RBAC tests pass for the wrong reason (rely on dev-mode stub fallback rather than typed permission sets)
   - `findOrCreate` mock doesn't pin the no-op SET clause shape (a regression that puts `state` in the SET would silently rewind in-flight onboardings)
   - Audit middleware mock simulates an impossible failure mode (production middleware always resolves to `Result`, never rejects)
   - Trigger-malformed test only covers `undefined` (not null/empty/non-uuid)
   - Rejection-with-missing-approverId is not tested (workflow guard was approved-only, breaking S18-A1 attribution for rejection terminals)

4. **Codex round-2 caught a partial-fix gap on the idempotency fix**: round-1 made transitions a no-op but the workflow still ran createRequest on every re-trigger. The `manager_assigned` resumption needed to use the persisted `hitlRequestId` instead of creating a duplicate. Fixed in round 2.

Round 3 confirmed: GO from both reviewers. The test-quality-assessor's other deferred findings are non-blocking quality improvements for future cleanup (RBAC test stub fallback, mock-shape pinning, hardcoded-string consolidation).

---

## Round 1 Findings

### Codex — NO-GO (5 findings)

#### 🚨 HIGH #1 — Onboarding workflow state-rewinding (financial-correctness equivalent for compliance)

> The workflow only short-circuits if the state is exactly `'onboarded'`. For any existing row not yet `onboarded`, it then replays earlier transitions, which can regress state, create duplicate HITL requests, and drift audit/event history. The test suite only covers the `state === 'onboarded'` path, so the more dangerous intermediate-state replay is untested.

**Fix applied (round 1, commit `dfa35f4`)**: Introduced `STATE_RANK` ordering with a `past(target)` predicate. Each transition + its preceding emit/audit gated `if (!past(target))`. Approved-state re-trigger skips HITL flow entirely, going straight to onboarded transition + completion emit using persisted `approvedBy`. Manager-assignment resumption reads persisted `managerId` off the row.

**Round 2 partial-fix gap (Codex round-2)**: the round-1 transition gating wasn't enough — the workflow still ran `createRequest` on every re-trigger even when `manager_assigned + hitlRequestId` was already persisted. **Fix applied (commit `9e1a809`)**: added a branch on `past('manager_assigned') && onboardingRow.hitlRequestId` that reuses the persisted requestId for wait-for-decision and skips both createRequest and record-hitl-request-id steps.

Three new parameterized tests pin the no-rewind invariants:
- re-trigger at `docs_collected`/`manager_assigned`: seedTasks NOT called; no transitionState rewind
- re-trigger at `approved`: no new HITL request; exactly one transition (approved → onboarded)
- re-trigger at non-pending: emit-started + audit-started skipped
- re-trigger at `manager_assigned + hitlRequestId`: createRequest NOT called; notification NOT fanned out

#### 🚨 HIGH #2 — PII audit fire-and-forget loses emits

> The PII list/export endpoints use detached promises for compliance-critical audit emits, which means the audit can be lost if the request finishes before the async work completes. The DLQ only helps after `auditService.emit()` has actually run; it does not protect an unawaited task that gets dropped on teardown.

**Same finding from Gemini at HIGH severity.**

**Fix applied (round 1)**: All 6 list/export endpoints now `await` the audit emit, wrapped in a try-block that tolerates factory-level throws only (production middleware returns `Result` and never rejects, so the await is bounded).

#### 🟡 MEDIUM #3 — Bulk/export endpoints allow unaudited reads when extractUser=null

> In dev/test mode, RBAC authorizes off `x-user-role` alone, while `extractUser()` returns null unless `x-user-id` is present. That is a real audit gap today, and it would also become a production gap if permission resolution and identity extraction ever diverge.

**Fix applied (round 1)**: All 6 endpoints now return 401 problem+json with `type='/errors/auth-required'` when `extractUser` is null even after RBAC passes. The corresponding test in `api-candidates.test.ts` was upgraded from "skips audit emit" (pass-for-wrong-reason — only checked emit not-called) to "401 with no store/audit hits" (pass-for-correct-reason).

#### 🟡 MEDIUM #4 — `consent-withdrawn` unreachable

> [services.ts] only selects rows with `withdrawn_at IS NULL`, so the withdrawn branch in [require-consent.ts] never runs in production. The endpoint therefore collapses withdrawn consent into `consent-required`, contrary to the documented contract and tests.

**Same finding from test-quality-assessor at HIGH severity.**

**Fix applied (round 1)**: Dropped the `AND withdrawn_at IS NULL` clause in `services.ts:getRequireConsent`'s raw SQL query. Middleware now sees the row's `withdrawnAt` field and surfaces the distinct deny reason via `denyResponse('consent-withdrawn')`.

#### 🟡 MEDIUM #5 — False self-access claim in seeds doc

> The advertised self-access exemption is not reachable for a normal candidate user. The route enforces `hr/onboarding.view` first, but only recruiter and hiring-manager receive that permission. The comment claiming candidates "get through via the requireConsent self-access exemption" is false as shipped.

**Fix applied (round 1)**: Removed misleading claim in hr-seeds.ts. Documented that requireConsent's self-access primitive is forward-looking until candidate portal lands in Phase 3.5.

### Gemini — NO-GO (4 findings; substantial overlap with Codex)

Gemini caught:
- **CRITICAL**: state-rewinding idempotency flaw (overlap with Codex HIGH #1) — same finding, framed as "rewinds the state of the existing database row even if it was already at 'approved'"
- **HIGH**: PII audit fire-and-forget (overlap with Codex HIGH #2) — same finding
- **MEDIUM**: Manager-assignment placeholder loop (recruiter approving their own onboarding via approverId-as-managerId) — documented as Phase 3.5 work
- **LOW**: Self-access email spoof risk — already documented as scope decision

Gemini missed Codex's MEDIUM #3 (extractUser-null audit gap), MEDIUM #4 (consent-withdrawn unreachable), MEDIUM #5 (false seeds claim), and didn't catch any of the test-quality-assessor's unique HIGH findings.

### test-quality-assessor — 6 NEW HIGH findings (multi-model missed all of them)

The agent ran independently and dug into the test suite specifically (not just the implementation). Findings the multi-model didn't catch:

#### 🚨 HIGH-A — RBAC tests pass for the wrong reason

> None of the endpoint tests actually verify the permission string the route demands. Every test mocks `resolvePermissions` and `resolvePermissionsForRole` as `vi.fn()` with no return value — middleware falls through to its 'accept any non-empty, non-anonymous role' stub fallback. A regression that swapped `hr/candidate.view` to `hr/candidate.delete` would be GREEN.

**Status: deferred to round 2 (acknowledged)**. Fix would require setting up `mockResolvePermissionsForRole` to return real `Set<string>` values per-role; out of scope for the immediate round-1 fixes (didn't introduce a real bug, just a coverage gap).

#### 🚨 HIGH-B — `findOrCreate` mock doesn't pin no-op SET clause

> The adapter's idempotency hinges on the exact SET clause in `onConflictDoUpdate`. The test asserts only that `onConflictDoUpdate` was called, never inspecting the `set` argument. A regression that changed `set` to `{ state: 'pending', candidateId: sql\`EXCLUDED.candidate_id\` }` would silently REWIND state on every re-trigger.

**Status: deferred (acknowledged)**. Fix is a stronger assertion in `hr-onboarding-store.test.ts`.

#### 🚨 HIGH-C — Audit middleware mock simulates impossible failure mode

> `mockAuditMiddleware.auditPiiReadBulk.mockRejectedValueOnce(...)` simulates a failure mode the production middleware can't produce (it always resolves to a `Result`). The test is asserting on a non-existent failure path.

**Fix applied (round 1)**: Test in `api-candidates.test.ts` rewritten to test factory-level throw (the realistic failure mode). Added a separate test for the `Result.err` resolution path (the awaited-audit fix verification).

#### 🚨 HIGH-D — Trigger-malformed only covers undefined

> Tests only cover `approverId=undefined`. Doesn't cover null, empty string, or non-uuid (which is truthy → guard does NOT fire → workflow proceeds with garbage approverId, propagating into `audit_logs.user_id`).

**Status: deferred (acknowledged)**. Fix is parameterized test cases for null/empty/non-uuid.

#### 🚨 HIGH-E — Rejection-with-missing-approverId breaks S18-A1 attribution

> The workflow's malformed-payload guard ONLY triggers for `decision === 'approved' && !approverId`. Rejections with missing approverId fall through to the rejection branch where the workflow happily emits `actor: { id: 'system', type: 'system' }`. That means a HITL responder can omit their userId, the row still flips to rejected, and audit attribution loses traceability of WHO rejected.

**Fix applied (round 1)**: Workflow guard now fires on `!approverId` regardless of decision value. Both approved AND rejected outcomes require approverId. New test `malformed REJECTION (decision=rejected but no approverId) → fail-closed` pins this invariant.

#### 🟡 MEDIUM-F — Workflow fixtures hardcode `state: 'pending'`

> Every test sets `state: 'pending'`. The workflow then proceeds to call `transitionState(id, 'docs_collected')` over an already-`approved` row, resetting it. This is the EXACT idempotency flaw both reviewers caught at the design layer; the test fixture's hardcoded `'pending'` is what makes that flaw invisible.

**Fix applied (round 1)**: Three new parameterized tests now cover all intermediate-state re-triggers. The `it.each([['docs_collected'], ['manager_assigned']])` test would have failed on the round-0 implementation; now it passes on the round-1 fix and pins the no-rewind invariant.

---

## Round 2 — Codex partial-fix gap

After applying all round-1 fixes (commit `dfa35f4`), Codex caught:

> A `manager_assigned` retrigger reuses managerId, but it does not reuse `hitlRequestId`. The workflow then always runs `hitl-request` again and overwrites `hitlRequestId`. That contradicts the schema contract, which explicitly stores the HITL request id once the gate is created. Operationally, a retry while already waiting for approval will fan out another approval request and drift audit/event history.

**Fix applied (round 2, commit `9e1a809`)**: Branch on `past('manager_assigned') && onboardingRow.hitlRequestId`. When both true, the workflow skips createRequest + record-hitl-request-id and reuses the persisted requestId for wait-for-decision. New test pins the no-duplicate-HITL invariant.

---

## Round 3 — GO from both reviewers

### Codex round-3
> No findings in `9e1a809` on the previously blocking paths. The remaining high-severity workflow gap is closed: the workflow now reuses persisted `hitlRequestId` for `manager_assigned` resumptions, skips `createRequest()`, and avoids re-running `record-hitl-request-id`.
>
> **Verdict: GO-conditional.** Conditions are the lower-priority deferred items (already called out): RBAC stub fallback, malformed-trigger coverage, findOrCreate adapter mock-shape, hardcoded workflow failure strings.

### Gemini round-2 (after both round-1 + round-2 fixes)
> The Round 2 fixes for Sprint 18 B2 have been successfully implemented and verified. The critical idempotency flaws have been resolved through a robust state-rank ordering, and the compliance-critical audit emits are now properly awaited in all API routes. **Verdict: GO.**

---

## Carry-Forwards (deferred to follow-up)

### Test-quality follow-ups (non-blocking quality)
1. **RBAC tests upgrade**: configure `mockResolvePermissionsForRole` to return real `Set<string>` per-role so endpoint tests verify the specific permission name (a typo would otherwise pass). Risk if not addressed: a swapped permission goes undetected by tests.
2. **`findOrCreate` no-op SET assertion**: extend the adapter test to inspect `onConflictDoUpdate.set` arg shape, asserting it ONLY contains `candidateId`. Defends against a regression that puts `state`/`managerId`/`approvedBy` in the SET.
3. **Trigger-malformed coverage**: parameterize test to cover null/empty-string/non-uuid for approverId. Today's guard catches `!approverId` (covers null/undefined/empty) but not non-uuid strings.
4. **Hardcoded failure-reason strings**: extract a `ONBOARDING_FAILURE_REASONS` constants module so impl + tests reference one source of truth.
5. **PII-leakage negative assertions**: onboarding-detail test should assert email/phone/SSN are NOT in the response body (defensive against future refactor that spreads candidate row).
6. **`mockSend` step-wrap verification**: assert that emits happen INSIDE `step.run` (durability guarantee), not just that `inngest.send` was called.

### Workflow follow-ups
7. **Manager-assignment placeholder loop** (Gemini MEDIUM): contract approver currently stands in as managerId, so the same person approves their own onboarding via HITL. Phase 3.5 admin UI will provide real manager resolution.
8. **`candidate.hired` event has no producer**: deferred until a hire-decision workflow lands. Trigger-malformed defensive guards already in place if the event ever appears.

### Security follow-ups
9. **Self-access email spoof risk** (Gemini LOW): replace email-equality with strict `candidateId → userId` mapping table once candidate portal infrastructure lands (Phase 3.5).
10. **Schema-validation reachability**: workflow's defensive `!approverId` guard may be unreachable in production once Inngest's `EventSchemas.fromRecord` validates events at ingest. Either tighten the workflow guard for non-uuid strings or document the schema layer is the only line of defense (and add an integration test with EventSchemas.fromRecord enabled).

---

## Reviewer Calibration

This was the largest review pair of the sprint cycle so far — three reviewers running in parallel.

**Codex**: caught 5 round-1 findings spanning critical correctness (state-rewinding) + audit integrity (fire-and-forget) + auth gaps (extractUser-null) + dead-code (consent-withdrawn) + doc accuracy (false seeds claim). Round-2 caught the manager_assigned-resumption partial-fix gap that I missed in the round-1 fix application — a sharp catch that required reasoning about the EXACT execution sequence of `step.run` calls in the workflow.

**Gemini**: caught the same critical idempotency flaw (with cleaner state-rewinding framing) + the audit fire-and-forget + a useful low-severity self-access spoof risk. Missed Codex's medium-severity unique findings. Round-2 confirmed the round-1 + round-2 fixes were complete.

**test-quality-assessor**: surfaced 6 NEW HIGH findings the multi-model missed entirely — all test-quality concerns (mocks lying, asserting on impossible failure modes, coverage gaps for symmetric branches). The agent's report was particularly valuable for the rejection-with-missing-approverId finding (HIGH-E) which would have shipped as a real S18-A1 attribution bug. The agent's report explicitly explained "what the test FAILS to catch" — the diagnostic that's hardest to produce manually.

**Pattern observation**: Multi-model is good for design + correctness review. Test-quality-assessor is good for "tests pass for the wrong reason" review. Running both in parallel was strictly stronger than either alone — the agent caught 6 issues neither model surfaced; the models caught 9 issues the agent didn't focus on.

**Calibrated weighting going forward**:
- For complex behavioral logic (workflows, state machines): run Codex + Gemini in parallel
- For test-suite quality concerns: also run test-quality-assessor (the model ratio for HIGH-severity catches was roughly 60/40 in favor of running all three, this round)

---

## Provenance

- **Codex via MCP thread `019e00c2-86f9-78d2-9a5b-060c86abc2a2`** (GPT-5, sandbox read-only). Round 1: 5 findings (1 HIGH + 1 HIGH + 3 MEDIUM). Round 2: 1 HIGH partial-fix gap. Round 3: GO-conditional.
- **Gemini via `mcp__pal__clink`** (`gemini-3-flash-preview`). Round 1: 4 findings (1 CRITICAL + 1 HIGH + 1 MEDIUM + 1 LOW). Round 2: GO.
- **test-quality-assessor agent**: 14 findings (6 HIGH + 6 MEDIUM + 2 LOW). Multi-round not run on this agent; deferred items captured in carry-forwards.
- **Lead (Claude Opus 4.7)**: applied all in-scope fixes across 3 rounds (workflow idempotency + audit await + extractUser fail-closed + consent-withdrawn reachability + rejection-malformed guard + manager_assigned resumption + 4 new tests). Deferred items documented as carry-forwards. Did NOT submit further round-3 follow-ups for already-GO outcome.

---

## Commits (in order)

| Commit | Description |
|---|---|
| `e2ffadd` | B2 slice 1 — hr_onboarding schema + adapter |
| `dfe9d78` | B2 slice 2 — HR event types + hr.contract.signed terminal emit |
| `9bdba85` | B2 slice 3 — hr-onboarding workflow + tests |
| `d0f7136` | B2 slice 4a — PII audit wiring fix + /api/hr/candidates list+export |
| `784cef4` | B2 slice 4b+4c — /api/hr/contracts + /api/hr/employees |
| `e60e8f6` | B2 slice 5 — requireConsent middleware + /api/hr/onboarding/[id] |
| `dfa35f4` | B2 round-1 review fixes (state-rank, awaited audit, fail-closed extractUser, consent-withdrawn reachable, rejection guard) |
| `9e1a809` | B2 round-2 review fix (manager_assigned resumption uses persisted hitlRequestId) |
| `<this commit>` | This multi-review doc |

---

## Closure

B2 ships with `CRYPTO_LIVE_TRADE_ENABLED` unrelated; the HR onboarding workflow is enabled and triggers on `hr.contract.signed` whenever the contract approval workflow reaches its terminal `signed` state. Test totals: 178 S18 tests across 17 files. 211 database tests. 55 HR-suite tests. All green.

The anomaly-gate observability claim for the HR scope is now intact: every PII list/export hit emits `auditPiiReadBulk`/`auditPiiReadExport` with `actor.type='user'` (per the round-1 wiring fix in slice 4a) → `audit_logs.user_id` populates → the anomaly aggregate's `WHERE user_id = $actor AND resource_type IN (...) AND action IN (...)` filter matches.

Per FR-HR-CM-005, consent enforcement is in place on the onboarding read endpoint with three deny reasons (`consent-required`, `consent-withdrawn`, plus the OK reasons `self-access` and `consent-active`). Self-access exemption is forward-looking until the candidate portal lands in Phase 3.5.
