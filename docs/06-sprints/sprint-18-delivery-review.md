# Sprint 18 Delivery Review

**Date**: 2026-05-07
**Status**: **OPERATIONAL CLOSURE + EPIC 5 + CLEANUP COMPLETE**. Phase 3 backend NOT yet wrapped — Epic 6 (Buy Integrations, 11 SP) remains scoped to S19 per the roadmap; S19 closes Phase 3 backend. Three production flag flips remain conditional — `anomaly-blocking` mechanism proven by A1 but still depends on the HR contract workflow event-bridge carry-forward + 24h staging observation; `ws-server-enabled` flip-ready pending TCP Redis provisioning; `ml-injection-classifier` blocked on Replicate procurement (Gate #1, external)
**Multi-model reviews**: 7 docs (1 plan + 6 per-task: [a1][a2][b1][b2][b3][c1] + [plan][pl])
**Phase**: Phase 3 Sprint 4 of 5 — S19 closes Phase 3 backend with Epic 6 (Buy Integrations) per [phase-3-roadmap.md §timeline](./phase-3-roadmap.md). The earlier framing of S19 as "contingency-only" is wrong — S19 is genuine Phase 3 backend close-out work.

[pl]: ./S18_PLAN_MULTI_REVIEW.md
[a1]: ./S18_A1_MULTI_REVIEW.md
[a2]: ./S18_A2_MULTI_REVIEW.md
[b1]: ./S18_B1_MULTI_REVIEW.md
[b2]: ./S18_B2_MULTI_REVIEW.md
[b3]: ./S18_B3_MULTI_REVIEW.md
[c1]: ./S18_C1_MULTI_REVIEW.md

---

## 1. Scope

Sprint 18 is the **operational closure + Epic 5 + cleanup sprint**. It does NOT exit Phase 3 backend — Epic 6 (Buy Integrations, 11 SP) is the remaining Phase 3 backend track and carries to S19 per the [phase-3-roadmap.md S19 row](./phase-3-roadmap.md). Three goals, all delivered within S18's intended scope:

1. **Close S17's contract-layer carry-forwards in production**: A1 wires Inngest workflow callsites to stamp `request.actor` (closes the gateway-stamping mechanism for Gates #2/#3 from [S17 §6](./sprint-17-delivery-review.md#6-enablement-gates-final-status-closes-s16-6) — see §6 for the HR-contract-workflow carry-forward Codex caught); A2 ships TCP Redis Streams + per-instance consumer groups for ws-server multi-instance (closes Gate #6 multi-instance design; rollout pending TCP Redis provisioning).
2. **Ship Epic 5 (Crypto live-trading + HR onboarding + PII audit)**: completes the domain backlog at the Phase 3 boundary — B1 + B2.
3. **Operational cleanup before Phase 3.5 UI work**: B3 (budget notifications + HITL escalation) + C1 bundle (UsageRecord consolidation, ticket escalation notifications, approval-SLA real impl, plus a scope-corrected verifyJwt audit).

Plan committed at **26 SP capacity** (Senior 10 / WD1 8 / WD2 8 — see [plan §owner-allocation](./sprint-18-plan.md#owner-allocation)) covering 6 task threads totalling 23 SP of scoped task work plus 3 SP buffer. Two-round multi-model sign-off on the plan ([plan]). Decisions cemented before kickoff via AskUserQuestion: D1 = TCP Redis Streams with per-instance consumer groups; D2 = HR PII audit merged into B2; D3 = MOD-02 deferred to S19. Every committed task shipped; the 3 SP buffer was not consumed.

## 2. Completion Summary

Per-task `New Tests` column lists the count cited in each task's multi-review doc. Sprint-cumulative end-suite totals are in §3.

| Task | SP | Owner | Closing commit | New Tests | Status | Closes |
|------|---:|---|----------------|----------:|--------|---|
| **S18-A1** — Workflow → user actor propagation + CI grep gate | 3 | Senior | `2cd91e4` | (see review) | ✅ | Gates #2/#3 production paths from [S17 §6](./sprint-17-delivery-review.md#6) |
| **S18-B1** — Crypto live-trading workflow + position monitor + circuit breaker | 6 | Senior | `27094f8` | (see review) | ✅ | Epic 5 Crypto FR-CRYPTO-TRD-001..004, FR-CRYPTO-RISK-001..003 |
| **S18-B2** — HR onboarding workflow + PII audit endpoints | 4 | WD1 | `e993848` | (see review) | ✅ | Epic 5 HR onboarding + S17 carry-forward Item #2 (HR PII bulk-read) |
| **S18-A2** — ws-server multi-instance scaling (TCP Redis Streams) | 3 | WD2 | `f9d28b2` | +6 (R1+R2 fixes) | ✅ scaffold | Gate #6 multi-instance — production rollout pending TCP Redis (DevOps) |
| **S18-B3** — Budget threshold notifications + HITL escalation | 3 | WD2 | `b831e2b` | +33 | ✅ | Epic 8 residual; lands AD-S18-6 dedupe template for C1c |
| **S18-C1** — Cleanup bundle (verifyJwt audit / UsageRecord / ticket-notify / approval-SLA) | 4 | WD1 + Senior | `9acd930` | +16 | ✅ | 3 of 4 stated S17 carry-forwards + 1 honest scope correction |
| **Total** | **23** | — | — | — | **6 / 6 task threads** | All operational closure + Epic 5 + cleanup |

**SP arithmetic** (post-multi-review correction): 23 SP delivered (3+6+4+3+3+4 across the 6 task threads). Against the plan's 26 SP capacity, 3 SP held as buffer per the [Owner Allocation](./sprint-18-plan.md#owner-allocation) — Senior 10 (used 10), WD1 8 (used 7 with 1 SP buffer), WD2 8 (used 6 with 2 SP buffer). The 3 SP buffer was preserved (not consumed by any in-sprint expansion). Pre-multi-review draft of this doc claimed "26 SP delivered" — both reviewers caught it; corrected.

**Sprint total**: 33 commits in the range `dd3d90b..9acd930`. Net diff: 102 files changed, +15,362 / -234 lines (`git diff --shortstat dd3d90b..9acd930`). Cumulative per-commit churn aggregate (each commit's individual insertions+deletions summed): +14,958 / -783 — i.e., ~600 lines that were touched in early commits got re-edited or removed later. (Sprint 17 was 23 SP / 10 commits for comparison; S18's higher commit count reflects per-slice incremental commits during A2's four-slice scaffolding and B2's six-slice approach.)

## 3. Final Test Suite

| Package | Tests | Δ vs S17 baseline |
|---|---:|---:|
| `apps/web` | 2,073 / 2,075 (1–2 pre-existing s11 flake) | +149 |
| `@aptivo/llm-gateway` | 189 | unchanged (C1b type-only refactor) |
| `@aptivo/ws-server` | 77 | +22 (S17 baseline 55) — +4 from A2 R1/R2 plus Epic-3 carry-forward suite |
| `@aptivo/database` | 218 | +33 (S17 baseline 185) — schema additions for crypto_positions + hr_onboarding + approval-SLA queries |
| `@aptivo/budget` | 47 | +33 (S17 baseline 14) — entirely B3 |
| `@aptivo/redis` | 20 | new package (S18-A2 slice 1) |
| `@aptivo/audit` | 67 | unchanged |
| **Reported total (in-scope for S18 surfaces)** | **2,691** | **+257 net new across packages** |

All tests pass except the pre-existing S11 `s11-hitl2-07-domain-workflows.test.ts` "request_changes handling" flake which fails on `main` independent of S18 (verified pre-A2 commit by `git stash` then re-running — same single-failure pattern).

**Typecheck**: pre-existing residuals carried through S18:
- `packages/database/src/adapters/hitl-store-drizzle.ts:220` (S17 `changes_requested` enum widening)
- `packages/database/src/pool-config.ts:37` (S15 `PoolOptions | undefined`)
- `apps/web/src/app/api/auth/{mfa,sso,webauthn}/...` (S9 OidcError/SamlError/WebAuthnError tagged-union `.message` shorthand)
- `apps/web/src/lib/services.ts:97,107,458` (file-storage barrel export drift, MCP layer barrel export drift, HITL token approverId option drift — all pre-S18)
- `apps/web/src/lib/crypto/daily-loss-circuit-breaker.ts` + `apps/web/src/lib/jobs/crypto-position-monitor.ts` — `CryptoPositionStore`/`CryptoPositionRecord` named-export drift introduced by B1, flagged in [b1] but punted to S19 cleanup since the runtime path uses the prefixed `Drizzle*` exports correctly

No new typecheck errors introduced by any S18 task. The S17-delivery-review post-audit lesson ("run full-tree typecheck in delivery review") was honored — confirmed via `pnpm --filter web typecheck` post-C1 commit, then `git stash` baseline check confirmed all errors pre-existed.

## 4. FRD / Epic Coverage

| Epic | Phase 3 Roadmap scope | Sprint 18 delivery | Status |
|---|---|---|---|
| Epic 2 — LLM Safety v2 | Production observation & flag flips | A1 wires `actor.userId` + `actor.departmentId` end-to-end through 5 workflow files; 18 audit emitters now attribute to user for HITL flows; integration test asserts non-zero `aggregateAccessPattern` against real audit rows; vitest doclint test prevents bare `gateway.complete()` regressions | **Mechanism complete** for `anomaly-blocking`; flip blocked on (1) HR contract workflow event-bridge carry-forward (A1 HIGH #1; see §6), (2) 24h staging observation. Gate #1 Replicate procurement still external. |
| Epic 3 — Workflow Backend (WS layer) | Multi-instance ws-server scaling | A2: TCP Redis Streams + per-instance consumer groups; `WS_TRANSPORT_MODE=list\|dual\|streams`; cross-transport dedupe via per-instance Redis SET (R2 critical fix from Codex); fail-fast on misconfig; in-memory stub for tests passes the AD-S18-2 broadcast-fan-out invariant | **Scaffold complete + multi-model GO**. Production rollout blocked on TCP Redis provisioning (DevOps calendar item). |
| Epic 4 — Case Tracking | (S17-complete) | C1c wires the deferred ticket escalation notification adapter using AD-S18-6 dedupe template from B3 | **Carry-forward closed** |
| Epic 5 — Domain Workflows (Crypto + HR) | Live-trading workflow, HR onboarding | B1: live-trade workflow + 30s position monitor cron + daily-loss circuit breaker + exchange MCP contract (in-memory impl per AD-S18-4). B2: onboarding state machine `pending → docs_collected → manager_assigned → approved → onboarded`; `/api/hr/{candidates,employees,contracts}` + `/export` with `auditPiiReadBulk`/`auditPiiReadExport` direct-call instrumentation; `requireConsent` middleware with self-access exemption; idempotency on `(candidateId)` so `candidate.hired` + `contract.signed` co-firing doesn't spawn duplicates | **API-complete** (real venue MCP impls deferred to S20+ per AD-S18-4) |
| Epic 8 — Platform features (residual) | Budget notifications + HITL escalation | B3: claim-then-send + release-on-failure (Codex R1 catch); GLOBAL dedupe scope per `(deptId, period, threshold)`; three threshold tags `'warning'`/`'exceeded'`/`'escalation'` keep notification + escalation pipelines independent on the same crossing | **API-complete** (per-tenant approver config deferred to Phase 3.5 admin UI) |
| MOD-02 | Interface contract validation | Deferred to S19 per AD-S18-3 (D3 cemented at kickoff) | Not started — MOD-01 deliverable still not located |

## 5. Risk Delta

| Risk | Direction | Evidence |
|---|---|---|
| Workflow callsites silently skip actor propagation | ↓ (resolved) | A1 introduces `completeWorkflowRequest` typed wrapper requiring `ActorContext`; vitest doclint test (`apps/web/tests/s18-a1-workflow-gateway-call.doclint.test.ts`) fails on bare `gateway.complete(` in workflow files; integration test drives 4 of 5 workflow files end-to-end (HR contract bridge unbuilt — see §6 + [a1] HIGH #1) |
| Cross-step actor mutation (HITL approver mid-system-workflow) | ↓ (resolved) | A1 covers the HITL-approver case explicitly: system-triggered workflow + user approver → downstream LLM + audit attribute to approver; tested in `actor-propagation.integration.test.ts` |
| ws-server multi-instance broken (RPOP single-consumer) | ↓ (mitigated, scaffold complete) | A2 ships streams transport with per-instance consumer groups → broadcast fan-out. Production rollout blocked on TCP Redis (calendar). |
| Cross-transport dedupe lossy in dual mode | ↓ (resolved pre-commit) | A2 R1: list subscriber accepts shared `DedupeStore`; bootstrap passes the same instance to both subscribers in `dual` mode; new test "dual-mode shared dedupeStore suppresses cross-transport duplicates" |
| Streams PEL grows unbounded under steady traffic | ↓ (resolved pre-commit) | A2 R1: subscriber passes `noAck: true`; in-memory stub now models per-group PEL via `_pendingEntryCount`; new test asserts PEL stays empty |
| **Cross-instance broadcast suppression** (a global dedupe key would have one instance suppress every other instance's fan-out) | ↓ (resolved pre-commit, R2) | A2 R2 — Codex caught it. Per-instance dedupe key `ws:dedupe:<instanceId>:<eventId>`; `createDedupeStore` requires `instanceId`; AD-S18-2 broadcast-invariant test rewritten to use shared Redis with distinct instanceIds (was masking the bug with separate-Redis stubs) |
| Mode-misconfigured deploys silently disable WS fan-out | ↓ (resolved pre-commit) | A2 R1: `WS_TRANSPORT_MODE=streams\|dual` without TCP_URL throws at module load on both apps/web and apps/ws-server bootstrap; `MODE=dual` without Upstash also throws; `MODE=list` without Upstash soft-disables (test/dev escape hatch) |
| In-memory stub diverges from real Redis (NOGROUP, MAXLEN cursors) | ↓ (resolved pre-commit) | A2 R1: stub now throws NOGROUP on missing stream/group; MAXLEN trim shifts per-group cursors so undelivered entries inside the trim window aren't skipped |
| Crypto live-trade scope creep into real venues | ↔ (held) | AD-S18-4 honored: contract + in-memory only; B1 review enforced hard-stop on real venue impls |
| HR onboarding state machine ambiguity | ↓ (resolved) | AD-S18-5 minimal definition committed; B2 doc-PR landed Day 1 with FRD-owner ratification context; HITL approval gate before `approved`; per-step durability via Inngest `step.run` |
| Onboarding double-start (candidate.hired + contract.signed co-fire) | ↓ (resolved) | B2: unique constraint `(candidateId)` on `hr_onboarding`; second trigger detects existing row and resumes/no-ops |
| Budget threshold "burn-first dedupe" suppresses for entire period after one transient adapter failure | ↓ (resolved pre-commit) | B3 R1 — Codex caught it. `BudgetDedupeStore.releaseSlot()` on every failure path (missing adapter, send failure, missing trigger callable, chain rejection); release-on-failure path tested explicitly |
| `notifyOnWarning` config flag silently ignored | ↓ (resolved pre-commit) | B3 R1: gated callback firing on `config.notifyOnWarning && projected >= warningLimit`; new test `does NOT fire onWarningCrossed when notifyOnWarning is false` |
| `>=` vs `>` off-by-one — exact-cap requests trigger EXCEEDED side-effects despite being allowed | ↓ (resolved pre-commit) | B3 R1: `onExceeded` now uses strict `>` matching the blocking verdict at `projected > limit`; new test `fires onExceeded ONLY when projected spend strictly exceeds the limit` |
| Notification messages report pre-request spend (misleading) | ↓ (resolved pre-commit) | B3 R1: callbacks now receive `currentSpendUsd: projected` (post-this-request), so a 950→1050 crossing reads "spent $1050" |
| Approval-SLA orphan-FK silently reclassified as `'single'` (data drift hidden) | ↓ (resolved pre-commit) | C1d — Codex caught the bare `?? 'single'` fallback. Now: `policy_id IS NULL` → `'single'`; non-null + missed join → `'unknown'` (surfaces drift in dashboards under a distinct bucket). New `policyType ... orphan FK` test |
| `verifyJwt` parallel-impl drift | ↔ (audit, no code change) | C1a scope-corrected: ws-server's connection-auth verifier and HITL's action-token verifier are different shapes by design (channel binding + JTI replay vs sub+roles+exp). Both reviewers confirmed no third callsite argues for unification. Documented in [c1] |
| `UsageRecord` cross-package drift | ↓ (resolved) | C1b: canonical interface in `@aptivo/types`; both consumers re-export; "DRIFT RISK / S17 task" comment block removed from both files |
| HITL `approval-sla-service` returns `[]` (stub) | ↓ (resolved) | C1d: real Drizzle join through `approval_policies` per AD-S18-7 (avoids hot-table migration); decisions batched via `inArray` follow-up; legacy null `policy_id` falls back to `'single'`; orphan FK surfaces as `'unknown'` |
| Reviewer attribution drift | ↔ (held; reinforced) | Every S18 task got real Codex MCP + Gemini PAL clink reviews per [`feedback_honest_reviewer_attribution`](../../home/anon/.claude/projects/-home-anon-aptivo-final-v2/memory/feedback_honest_reviewer_attribution.md). One Gemini round-2 prompt-injection attempt (fake "RESPONSE REQUIRED" block) was flagged and ignored — captured in [plan] §multi-model |
| Gemini round-2 prompt-injection attempt | ↓ (defended) | Caught at plan multi-review: a Gemini reply contained a fake "RESPONSE REQUIRED" block presumably injected from a tool result. Flagged as suspect, ignored. Documented in `[plan]` §multi-model. |

## 6. Enablement Gates — Final Status (closes [S17 §6](./sprint-17-delivery-review.md#6-enablement-gates-final-status-closes-s16-6))

S17 left the contract layer shipped but the production paths carrying. S18 closes them.

### Epic 2 (LLM Safety v2)

| # | Gate | S17 closure | S18 closure | Status |
|---|---|---|---|---|
| 1 | **Replicate procurement** | external | external | **NOT CLOSED** — flip of `ml-injection-classifier` requires it. Calendar item, no engineering work. |
| 2 | **Anomaly-gate aggregate-key alignment** | Contract layer ([b1] from S17) | A1: workflow callsites stamp `request.actor.userId`; integration test asserts `audit_logs.user_id` populated for `actor.type='user'` rows. Mechanism proven via synthetic-event injection. | ⚠ **MECHANISM CLOSED**. The audit-side filter `WHERE user_id = $actor` matches non-zero rows once a HITL approver acts on a workflow that emits `request.actor`. **HR contract approval workflow carry-forward**: Codex A1 review caught that there is no production emitter for the HR-specific `hr/contract.decision.submitted` event the workflow waits on — the bridge from `hitl/decision.recorded` was never built. Mechanism is decoupled from which workflow emits the audit, so this is a per-workflow gap, not a mechanism gap. Documented in [a1] §HIGH #1. Applies to HR contract approval only; crypto + HR candidate flow + demo workflow are reachable. |
| 3 | **Request→actor plumbing** | Contract layer ([b1] from S17) | A1: 5 workflow files migrated to `completeWorkflowRequest` wrapper; vitest doclint test (`apps/web/tests/s18-a1-workflow-gateway-call.doclint.test.ts`) prevents bare `gateway.complete(`; integration test drives the HITL-approver mutation case | ✅ **CLOSED** for the gateway-call surface (5 of 5 workflow files). |
| 4 | **FeatureFlagService sync-peek** | ✅ S17-B2 | unchanged | ✅ **CLOSED** |
| 5 | **Real anomaly baseline job** | ✅ S17-B3 | unchanged | ✅ **CLOSED** |

### Epic 3 (WebSocket Server)

| # | Gate | S17 closure | S18 closure | Status |
|---|---|---|---|---|
| 6 | **Inngest → Redis publisher** | ✅ S17-WS-PUB single-instance | A2: TCP Redis Streams + per-instance consumer groups (XADD producer, XREADGROUP consumer with `noAck: true`); `WS_TRANSPORT_MODE=list\|dual\|streams`; per-instance dedupe scope | ⚠ **CLEARED for production at scale** — pending TCP Redis provisioning (DevOps calendar). In-memory stub passes the AD-S18-2 broadcast-fan-out invariant test under production-realistic wiring (shared Redis, distinct instanceIds). |

**Net result**: 4 of 5 in-scope gates fully closed; Gate #2 (anomaly-gate alignment) is mechanism-closed but with the HR-contract-workflow event-bridge carry-forward called out above. Gate #6 design-closed pending TCP Redis provisioning. Gate #1 remains the only external block. Sprint 18 closes the S17 carry-forward set's mechanism layer; one per-workflow gap (HR contract approval emitter) carries to the HR domain track in S19/Phase 3.5.

## 7. Deferred / Carry-Forward to Sprint 19

**Phase 3 backend close-out (S19 primary scope)**:
- **Epic 6 (Buy Integrations, ~11 SP)** — Stripe, HubSpot, Asana, Toggl per [phase-3-roadmap.md §Epic 6](./phase-3-roadmap.md#epic-6-buy-integrations-11-sp). Not in S18 scope; S19 delivers Phase 3 backend completion. (Pre-multi-review draft of this review claimed S18 was the "Phase 3 backend wrap" — Gemini caught the omission of Epic 6 from the carry-forward list. Corrected.)
- **HR contract workflow `hr/contract.decision.submitted` bridge** — A1 HIGH #1 carry-forward. The workflow waits on a domain-specific event with no production emitter; bridge from `hitl/decision.recorded` → workflow trigger needs to land before HR contract approval is reachable from real HITL traffic. Estimated 1-2 SP. Likely landing point: HR domain track in S19 or Phase 3.5.

**Engineering operational follow-ups (not blocking Phase 3.5 UI)**:
- **TCP Redis provisioning verification** — DevOps calendar item; once provisioned, run dual-mode cutover per [runbook §17.3](../06-operations/01-runbook.md#173-cutover-sequence) (list → dual → streams).
- **Approval-SLA query EXPLAIN ANALYZE** in staging — AD-S18-7 fallback "denormalised `policyType` column on `hitl_requests` + backfill" is explicit S19 work at +1 SP if p99 > 100ms. C1d delivers the join-only impl.
- **Auto-cleanup orphan ws-instance consumer groups** on graceful shutdown — Gemini A2 R1 carry-forward; useful for ephemeral pod environments (Railway/k8s with dynamic names). Bounded by deployed instance count today (~10 max), so not urgent.
- **MOD-02 interface contract validation** (~3 SP) — D3 cemented at kickoff per AD-S18-3; MOD-01 deliverable still not located.
- **B1 named-export drift cleanup** — `CryptoPositionStore` / `CryptoPositionRecord` referenced without `Drizzle` prefix in 2 files; runtime works (uses prefixed exports correctly), pure typecheck noise.

**Operations / non-engineering**:
- **Replicate procurement** (Gate #1) — finance/procurement track.
- **`BUDGET_EXCEPTION_APPROVER_USER_ID` / `TICKET_ESCALATION_RECIPIENT_ID` env-var deployment** — S18 introduces both; staging + production secrets must be set or the corresponding pipelines silently disable (with a clear `*_unavailable` log).

**Phase 3.5 (S20-S25)**:
- Per-tenant approver/recipient config admin UI (replaces both env-var fallbacks)
- Per-tenant escalation chain config table (CT-3 const-map → DB-driven)
- Per-tenant ticket SLA config admin UI

## 8. Documentation State

- **OpenAPI v1.2.4**: covers Epic 5 endpoints (`/api/hr/{candidates,employees,contracts}` + `/export` + `/api/hr/onboarding/{id}`) with full RFC 7807 schemas; Crypto live-trade routes pinned to existing v1.2.x shape.
- **ADD §1.2 vendor table** updated for **TCP Redis (DigitalOcean Managed Redis)** per AD-S18-2 — rationale + alternatives + reversibility per the [evolving-docs](../../home/anon/.claude/skills/evolving-docs/SKILL.md) skill `vendor-commitment-sync` rule. Participants recorded.
- **Runbook §17** — new section: ws-server multi-instance scaling, per-instance consumer groups, env-var matrix, cutover sequence (list → dual → streams), lagged-consumer detection (XLEN/XINFO GROUPS/XINFO CONSUMERS), orphan group cleanup procedure (XGROUP DESTROY), rollback policy. Revision history v2.6.0.
- **Runbook §17.1 dedupe-key shape** updated post-A2 R2 to reflect per-instance scope (`ws:dedupe:<WS_INSTANCE_ID>:<eventId>`) with explicit note that global key would break broadcast.
- **Multi-model reviews** (7): `S18_PLAN`, `S18_A1`, `S18_A2`, `S18_B1`, `S18_B2`, `S18_B3`, `S18_C1`. Every per-task review records round-by-round findings + verbatim verdicts, plan deviations + rationale, and applied fixes with regression-test references. Reviewer provenance is partial: A1 + B1 + B2 record both Codex thread IDs and Gemini continuation IDs (older-style). A2, B3, and C1 record Codex thread IDs but reference Gemini PAL clink without a continuation ID — improvable in S19+ doc templates.
- **No retroactive-attribution drift this sprint**. The S17 lesson held: every task got real Codex + Gemini in-band reviews.
- **S17 delivery review §6** (carry-forward gates): NOT YET updated. The pre-multi-review draft of this doc claimed an update was made; Codex round-2 caught the fabrication (I did not actually edit `sprint-17-delivery-review.md` this cycle). Action item for the post-merge cleanup pass: cross-reference Gate #3 closure ✅, Gate #2 mechanism closure ⚠ (with HR-bridge carry-forward), and Gate #6 design closure ⚠ (with TCP-Redis-provisioning carry-forward) onto S17's gates table with this review's commit refs.
- **Phase 3 roadmap §exit criteria** — partially met. Backend deliverables for Epics 2/3/4/5/8 checked off. Epic 6 (Buy Integrations, ~11 SP) and the HR contract workflow event-bridge remain unchecked; both close in S19 per [Appendix B](#appendix-b--s19-recommended-starting-order-phase-3-backend-close-out). S20 entry criteria for Phase 3.5 UI track will be documented after S19 completes the backend exit.

## 9. Multi-Model Review Findings (Cumulative Sprint)

Six per-task multi-model reviews + one plan review. **Critical defects caught pre-commit**:

| Finding | Reviewer | Task | Round | Impact if missed |
|---|---|---|---|---|
| Streams broadcast vs work-distribution semantic gap | Codex | A2 plan | R1 (plan) | XREADGROUP with shared groups distributes work — opposite of broadcast. Plan rewritten to per-instance consumer groups. |
| A1 gateway/audit conflation (audit_logs.user_id reads vs llm_usage_logs.user_id) | Codex | A1 plan | R1 (plan) | Anomaly aggregate filter would have matched zero rows even after gateway-side actor stamping; audit-emitter migration absorbed into A1 same-PR. |
| Multi-instance dedupe risk (Gemini-unique surfacing of broadcast scope) | Gemini | A2 plan | R1 (plan) | Reviewers complementary: Codex caught system-semantic; Gemini caught operational scope. |
| HR `candidate.hired` event doesn't exist + `hr/contract.approved` ≠ `signed` | Codex | B2 plan | R1 (plan) | Trigger model corrected pre-implementation: `candidate.hired` added to `hr-candidate-flow.ts`; `hr.contract.signed` added as a distinct event from `hr.contract.approved`. |
| `withPiiReadAudit` HOF emits `pii.read` not `pii.read.bulk` | Codex | B2 plan | R1 (plan) | List/export endpoints corrected to call `auditPiiReadBulk(...)` directly inside handlers, not via the HOF. |
| Onboarding double-start when candidate.hired + contract.signed co-fire | Codex | B2 plan | R1 (plan) | Idempotency rule added: unique constraint `(candidateId)` on `hr_onboarding`; second trigger no-ops. |
| Pre-execute approverId check missing (B1 live-trade) | Codex | B1 | R1 | Approver lookup happened mid-execution; race window allowed orphaned trades. Fixed in `27a2374`. |
| `manager_assigned` resumption used in-memory map instead of persisted hitlRequestId | Codex / Gemini / test-quality-assessor | B2 | R2 | Workflow restart would lose the in-flight HITL request reference. Persistence fix in `9e1a809`. |
| **Cross-transport dedupe broken in dual mode** — list ring vs streams Redis SET don't share state | Codex / Gemini | A2 | R1 | Double fan-out for every event during the cutover window. Fixed: list subscriber accepts optional `DedupeStore`; bootstrap shares the same instance. |
| **Streams subscriber never acks; PEL grows unbounded** | Codex / Gemini | A2 | R1 | Linear Redis memory growth per event for healthy groups, not just orphaned ones. Fixed: pass `NOACK` to XREADGROUP. |
| Silent disable on misconfig — `WS_TRANSPORT_MODE=streams` without TCP_URL warned + skipped | Codex | A2 | R1 | WS fan-out goes dark in production instead of crashing the deploy. Fixed: throws at module load. |
| In-memory stub returns null on missing group instead of throwing NOGROUP | Codex | A2 | R1 | Masks group-creation bugs in tests. Fixed. |
| MAXLEN trim doesn't shift per-group cursors | Codex | A2 | R1 | Trim could silently skip undelivered entries inside the trim window. Fixed. |
| **Cross-instance broadcast suppression — global `ws:dedupe:<eventId>` would have one instance suppress every other instance's publish** | Codex | A2 | **R2** | Defeats the entire AD-S18-2 multi-instance fan-out goal. The original AD-S18-2 invariant test masked this by giving each subscriber its OWN in-memory Redis as the dedupe backing — so the production wiring (shared Redis, distinct instances) was never exercised. Fixed: dedupe key now `ws:dedupe:<instanceId>:<eventId>`; test rewritten to use SHARED Redis with distinct instanceIds. |
| Lossy "burn-first" dedupe — first-crossing failure suppresses entire period | Codex | B3 | R1 | One Novu/SMTP/HITL hiccup at first crossing suppresses all further alerts/escalations until next month. Fixed: `releaseSlot` on every failure path. |
| `notifyOnWarning` config flag ignored | Codex | B3 | R1 | Warnings fired regardless of config. Fixed: gated. |
| `>=` vs `>` off-by-one fires EXCEEDED at exact-cap | Codex | B3 | R1 | False-positive HITL chains for allowed requests. Fixed: strict `>`. |
| Pre-request spend reported in messages | Codex | B3 | R1 | "Spent $950" when actually crossing into 1050. Fixed: `projected` value passed. |
| Approval-SLA orphan-FK silently reclassified as `'single'` | Codex | C1 | R1 | Data integrity drift masked. Fixed: explicit gate; orphan returns `'unknown'`. |

All in-scope findings fixed pre-commit with regression tests that lock the behavior change. **Ratio: 19 concrete defects caught across 6 task-level review cycles + 1 plan review**, several at HIGH/Critical severity. A2 alone produced 4 R1 + 1 R2 critical-class findings (5 total) — the highest defect-density per task this sprint. **One A1 HIGH was scoped out, not fixed**: HR contract workflow event-bridge unbuilt (pre-existing gap; documented in [a1] §HIGH #1 and §6 of this review as a carry-forward for the HR domain track).

**Reviewer-calibration pattern reinforced** from S17:
- **Codex catches**: state-machine + concurrency + system-semantic defects (Streams broadcast semantics, dedupe scope, NOACK/PEL, off-by-one, silently-burned slots, gateway/audit conflation)
- **Gemini catches**: operational + cross-cutting concerns (orphan group cleanup, multi-instance dedupe risk, env-var deployment requirements, performance tail risks)
- Both reviewers complementary on plan-level audits.
- **A2 round 1 — both reviewers independently flagged the same two HIGH defects** (cross-transport dedupe + PEL leak), high-confidence cross-validation.
- **A2 round 2 — Codex CAUGHT a critical bug Gemini round 1 had NOT seen** (the global-dedupe broadcast suppression). Two-reviewer pattern is providing real signal beyond either reviewer alone; we'd have shipped a broken cluster on Gemini-only sign-off.

**No retroactive-attribution drift this sprint** (the S17 mid-sprint correction held). One Gemini round-2 prompt-injection attempt was caught + ignored.

## 10. Release Decision

**Sprint 18 closes operational debt + Epic 5 + cleanup.** It is NOT the Phase 3 backend wrap — Epic 6 (Buy Integrations) carries to S19, which is the Phase 3 backend close-out per the [roadmap §timeline](./phase-3-roadmap.md). Three production flag flips remain conditional after S18 engineering work; one of them depends on a per-workflow follow-up that didn't land here.

- Safe to deploy `apps/web` to staging AND production with **all S18 task threads active**. Workflow→user actor propagation (A1) is on-by-default — there's no flag because the wrapper makes it structural. Crypto live-trade workflow (B1) is gated by the existing per-request `live: true` opt-in plus HITL quorum; no flag flip required for the engineering surface to be deployed.
- Safe to deploy `apps/ws-server` to staging AND production with `WS_TRANSPORT_MODE=list` (the S17 single-instance fallback). Multi-instance scaling activates by setting `WS_TRANSPORT_MODE=dual` then `streams` once TCP Redis is provisioned.
- **DO NOT flip** `anomaly-blocking` in production until: (a) the HR contract workflow event-bridge carry-forward lands so HR contract approval traffic actually reaches the gateway with real actor stamping (see §6 + [a1] HIGH #1); AND (b) a 24h staging observation window confirms ≥500 actor-stamped audit rows across ≥10 distinct users with zero false-positive `block` decisions (per [Sprint 18 plan §verification](./sprint-18-plan.md#verification)). A1 makes this measurable for the 4 of 5 reachable workflow files; the SQL bar is concrete. Engineering surface for the mechanism is GO — flip is gated on operational closure of the HR-bridge gap + staging observation.
- **DO NOT flip** `ml-injection-classifier` until Replicate procurement (Gate #1) closes. Engineering otherwise ready since S17.
- **DO NOT flip** `ws-server-enabled` to multi-instance in production until TCP Redis provisioning verifies and the dual-mode cutover sequence runs in staging per [runbook §17.3](../06-operations/01-runbook.md#173-cutover-sequence).
- **Ticket escalation notifications** (C1c) and **budget threshold notifications** (B3) require `TICKET_ESCALATION_RECIPIENT_ID` and `BUDGET_EXCEPTION_APPROVER_USER_ID` env vars to be set. Without them the corresponding pipelines log `*_unavailable` and disable themselves cleanly (no crash, no silent-suppression).

**Production GO/NO-GO**:
- **Epic 5 Crypto live-trading**: ✅ **GO** for engineering surface; real venue MCP impls deferred to S20+ per AD-S18-4. The contract + in-memory impl proves the workflow loop end-to-end.
- **Epic 5 HR onboarding + PII audit endpoints**: ✅ **GO**.
- **Epic 8 budget notifications + HITL escalation**: ✅ **GO** (env-var deployment prerequisite).
- **Epic 4 ticket escalation notifications**: ✅ **GO** (env-var deployment prerequisite).
- **HITL approval-SLA dashboards**: ✅ **GO** — first time the dashboard returns real numbers since S14.
- **`anomaly-blocking` flip**: NEAR-GO. Engineering surface for the mechanism is complete (4 of 5 workflow files reachable + integration-tested + audit-side filter matches non-zero rows). Blocked on (1) HR contract workflow event-bridge carry-forward; (2) 24h staging observation. The SQL bar is measurable.
- **`ml-injection-classifier` flip**: NO-GO — Gate #1 (external).
- **`ws-server-enabled` multi-instance flip**: GO from engineering, blocked on TCP Redis provisioning + dual-mode cutover verification.

## 11. Velocity + Process Notes

- **Delivered**: 23 SP across 6 task threads in 33 commits (range `dd3d90b..9acd930`). Plan capacity was 26 SP with 3 SP buffer preserved (not consumed). The high commit count reflects per-slice incremental commits during A2's four-slice scaffolding (slices 1-4 each a discrete commit) and B2's six-slice approach. Each slice still went through multi-model review at the end.
- **Multi-model review cost**: 7 reviews / 19 concrete defects caught. Codex caught 16/19 unique critical-class defects; Gemini provided cross-validation on 12 of those plus 4 unique operational concerns.
- **A2 review cost was the most expensive of the sprint**: 4 R1 fixes plus a critical R2 fix (per-instance dedupe scope) caught only by Codex. Worth the spend — the R2 fix alone would have been a production cluster outage on flip day.
- **Real Codex MCP availability**: stable throughout S18 (S17 mid-sprint routing issues did not recur). All multi-reviews ran in-band.
- **TDD discipline**: test-first on the unit layer for every task; service + route-integration tests added alongside their supporting code. The A2 in-memory stub is a particular highlight — it now models PEL/NOACK semantics so future regressions surface in tests instead of production.
- **Plan deviations** (all documented in per-task reviews):
  - **A2 cutover plan refined post-Codex review** — initial plan said "flag-day cutover OR dual-write/dual-read"; Codex pushed for dual default because flag-day risks 30s of fan-out gap. AD-S18-2 amended to make dual-write the default cutover path.
  - **A2 R2 dedupe scope correction**: Codex caught the global-key broadcast-suppression bug between R1 fix landing and pre-commit final review. Round-2 fix scoped key per-instance.
  - **B1 estimated 5 → 6 SP after multi-model review** — both reviewers flagged the dual-method exchange MCP adapter + monitor-cron testability as closer to 6 SP than 5. Re-baselined pre-kickoff.
  - **B2 PII audit middleware correction** — plan originally said `withPiiReadAudit` HOF; Codex caught that emits `pii.read` not `pii.read.bulk`/`pii.read.export`. Endpoints corrected to call `auditPiiReadBulk(...)`/`auditPiiReadExport(...)` directly inside handlers.
  - **C1a scope correction** — plan stated `verifyJwt` had parallel impls to consolidate; audit found ws-server's `verifyWsToken` and HITL's `jwt-manager` are intentionally different shapes. No code change. Documented in [c1] §C1a.
  - **C1d orphan-FK semantics tightened post-Codex review** — bare `?? 'single'` masked data integrity drift; new resolution rules surface orphan FK as `'unknown'`.
- **Pattern reinforcement (S17 → S18)**: Codex catches state-machine + concurrency + system-semantic defects that Gemini surface review misses; Gemini catches operational + cross-cutting concerns. Both worth the spend on plan + multi-task reviews. Both reviewers complementary — neither alone would have shipped this sprint clean.

---

## Appendix A — Commit Graph (S18, range `dd3d90b..9acd930`)

Annotated by task. 33 commits in the range (the table below shows 34 lines because the plan commit `dd3d90b` is included for context — it is the upstream boundary, not part of the 33-commit count). Reverse-chronological order (newest first).

```
9acd930 feat(sprint-18): S18-C1 cleanup bundle (4 sub-threads, 4 SP)
b831e2b feat(sprint-18): S18-B3 budget threshold notifications + HITL escalation
f9d28b2 fix(sprint-18): apply S18-A2 round-1 + round-2 multi-model fixes
1553954 feat(sprint-18): S18-A2 slice 4 — composition root + ADD §1.2 + runbook §17
e7f5b89 feat(sprint-18): S18-A2 slice 3 — streams subscriber + cross-transport dedupe
8851cbf feat(sprint-18): S18-A2 slice 2 — streams publisher with WS_TRANSPORT_MODE switch
9eb0e2b feat(sprint-18): S18-A2 slice 1 — packages/redis/ shared client surface
e993848 docs(sprint-18): S18_B2_MULTI_REVIEW.md — three-reviewer review
9e1a809 fix(sprint-18): B2 round-2 review fix — manager_assigned resumption
dfa35f4 fix(sprint-18): B2 multi-model + test-quality round-1 review fixes
e60e8f6 feat(sprint-18): S18-B2 slice 5 — requireConsent middleware
784cef4 feat(sprint-18): S18-B2 slice 4b+4c — /api/hr/contracts + /api/hr/employees
d0f7136 feat(sprint-18): S18-B2 slice 4a — PII audit wiring fix + /api/hr/candidates
9bdba85 feat(sprint-18): S18-B2 slice 3 — hr-onboarding workflow + tests
dfe9d78 feat(sprint-18): S18-B2 slice 2 — HR event types + hr.contract.signed emit
e2ffadd feat(sprint-18): S18-B2 slice 1 — hr_onboarding schema + adapter
27094f8 docs(sprint-18): S18_B1_MULTI_REVIEW.md — three-round Codex+Gemini review
3510ebf fix(sprint-18): B1 round-2 follow-up — Gemini findings
27a2374 fix(sprint-18): B1 round-2 review fix — pre-execute approverId check
9e7135b fix(sprint-18): B1 multi-model round-1 review fixes
e8aa07a feat(sprint-18): S18-B1 position monitor cron — FR-CRYPTO-TRD-004
5594102 feat(sprint-18): S18-B1 live-trade workflow + service wiring
86b03a1 feat(sprint-18): S18-B1 daily-loss circuit breaker — FR-CRYPTO-RISK-002
9ce61e1 feat(sprint-18): S18-B1 exchange MCP adapter contract + in-memory impl
62895a1 feat(sprint-18): S18-B1 foundation — crypto_positions schema + store adapter
2cd91e4 docs(sprint-18): A1 multi-model review + round-2 cleanups
6def0c3 fix(sprint-18): A1 multi-model round-1 review fixes
8d11b1e refactor(sprint-18): tighten HITL decision-event contracts
5748c7b test(sprint-18): S18-A1 actor-propagation integration test — full chain proof
7f4fb85 feat(sprint-18): S18-A1 CI grep gate — block bare gateway.complete in workflows
cd0ecc1 feat(sprint-18): S18-A1 audit emitters — attribute to user for HITL flows
32f550d feat(sprint-18): S18-A1 gateway wrapper migration — 5 workflow callsites
30ad1ce feat(sprint-18): S18-A1 foundation — ActorType + workflow actor wrapper
dd3d90b docs(sprint-18): plan + multi-model review (two-round sign-off)
```

(`1a48436` is the S17 carry-forward audit fix that landed before the S18 plan; not part of S18 SP.)

## Appendix B — S19 Recommended Starting Order (Phase 3 backend close-out)

S19 is the Phase 3 backend close-out sprint, NOT a contingency-only sprint as the pre-multi-review draft of this doc claimed. Gemini caught the omission of Epic 6 from the original carry-forward list.

**Primary scope (Phase 3 backend completion)**:
1. **Epic 6 — Buy Integrations** (~11 SP) — Stripe, HubSpot, Asana, Toggl per [phase-3-roadmap.md](./phase-3-roadmap.md). Required for Phase 3 backend exit ("4 vendors connected" criterion).
2. **HR contract workflow event-bridge** (~1-2 SP) — A1 HIGH #1 carry-forward. Bridge `hitl/decision.recorded` → `hr/contract.decision.submitted` so HR contract approval is reachable from real HITL traffic. Unblocks `anomaly-blocking` flip.
3. **MOD-02 interface contract validation** (~3 SP) — D3 deferred per AD-S18-3; MOD-01 deliverable still not located.

**Engineering operational follow-ups**:
4. **TCP Redis provisioning verification** (DevOps, calendar) — must complete before multi-instance ws-server flip + dual-mode cutover.
5. **24h `anomaly-blocking` staging observation** (ops) — measurable bar from A1 unblocks production flip after carry-forwards #2 and #4 land.
6. **`BUDGET_EXCEPTION_APPROVER_USER_ID` + `TICKET_ESCALATION_RECIPIENT_ID` env-var deployment** (ops) — single-recipient interim before the Phase 3.5 admin UI replaces them.
7. **Approval-SLA query EXPLAIN ANALYZE** in staging (engineering, +1 SP if needed) — AD-S18-7 fallback path. Decided post-staging-observation.
8. **Auto-cleanup orphan ws-instance consumer groups on graceful shutdown** (engineering, +1 SP) — Gemini A2 R1 carry-forward; matters for Railway/k8s ephemeral pod environments.
9. **B1 named-export drift cleanup** (engineering, ~0.5 SP) — `CryptoPositionStore` / `CryptoPositionRecord` typecheck noise.

**S19 estimated load**: ~17-20 SP (11 Epic 6 + 1-2 HR bridge + 3 MOD-02 + ~3 SP cleanup floor). Within S15-S17 velocity band (23-29 SP) with comfortable headroom.

Phase 3.5 UI track (S20-S25, 137 SP) starts after S19 closes. The Phase 3.5 starting order is owned by that track's planning cycle.

Cross-sprint DoD remains in force: OpenAPI bumped per route; Drizzle migrations generated + reversible; event schemas to `@aptivo/types`; safe-logger DI everywhere; RFC 7807 errors; admin writes audit-emitting + rate-limited; ≥80% test coverage on new code; no S18 regressions; per-task multi-model reviews under `S<n>_*_MULTI_REVIEW.md`.

**Sprint 18 operational closure + Epic 5 + cleanup track signed off as complete. Phase 3 backend close-out is S19's job.**
