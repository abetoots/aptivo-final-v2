# Sprint 16 Delivery Review

**Date**: 2026-04-21
**Status**: **READY FOR STAGING RELEASE** — 5 enablement gates block production flag flips (see §6)
**Multi-model reviews**: 7 ([per-task][w1][w2][w3][w4][w5][w6] + [wrap][ww])
**Phase**: Phase 3 Sprint 2 of 4 (S16-S18 + S19 contingency) — per [phase-3-roadmap.md](./phase-3-roadmap.md)

[w1]: ./S16_WFE3_01_MULTI_REVIEW.md
[w2]: ./S16_LLM3_03_MULTI_REVIEW.md
[w3]: ./S16_LLM3_02_MULTI_REVIEW.md
[w4]: ./S16_LLM3_04_MULTI_REVIEW.md
[w5]: ./S16_WFE3_02_MULTI_REVIEW.md
[w6]: ./S16_FA3_01_MULTI_REVIEW.md
[ww]: ./SPRINT_16_WRAP_MULTI_REVIEW.md

---

## 1. Scope

Sprint 16 is the first execution sprint after the Phase 3 UI descope (2026-04-20). Per the [Phase 3 Sprint Plan multi-review](./PHASE_3_SPRINT_PLAN_MULTI_REVIEW.md), S16 is the **gate sprint** — Epic 2 (LLM Safety v2) unblocks Epic 5 crypto live-trading in S17; Epic 3 (workflow backend) unblocks Epic 4 case tracking in S17.

Originally scoped at 25 SP / 7 tasks. Path A revision (after S16 plan multi-review on 2026-04-20) bumped four estimates and deferred FA3-02, landing at **27 SP / 6 tasks**. Every task shipped.

## 2. Completion Summary

| Task | SP | Commit | New Tests | Status |
|------|-----|--------|----------|--------|
| WFE3-01 — Graph Validation API | 3 | `2c66852` | 31 | ✅ |
| LLM3-03 — Injection Eval Harness + 220-sample corpus | 4 | `01a1dd9` | 24 | ✅ |
| LLM3-02 — ML Injection Classifier + Replicate adapter | 5 | `90c2d17` | 18 | ✅ |
| LLM3-04 — Active Anomaly Blocking Gate | 3 | `8d74f4b` | 17 | ✅ |
| WFE3-02 — WebSocket Server + Protocol v1.0 | 6 | `5a2655c` | 44 | ✅ |
| FA3-01 — Department Budgeting + Admin Rate-Limiter | 6 | `330fd6c` | 21 | ✅ |
| **Total** | **27** | — | **155** | **6 / 6** |

Plus:
- Wrap-review doc fixes (coverageLevel enum, `ws-server-enabled` flag) — `70b3f26`
- ADD cascade (vendor table + topology + §14.5 safety) — `0e663c8`
- Planning + per-task multi-reviews — `46b3e57`

**Sprint total**: 9 commits spanning 85 files, +9,268 / -36 lines.

## 3. Final Test Suite

| Package | Tests | Δ vs S15 baseline |
|---|---:|---:|
| `apps/web` | 1,803 | +15 |
| `@aptivo/llm-gateway` | 178 | +63 |
| `@aptivo/ws-server` | 44 | new |
| `@aptivo/budget` | 14 | new |
| `@aptivo/audit` | 67 | unchanged |
| **Reported total (in-scope for S16 surfaces)** | **2,106** | **+136 net new** |

All tests pass. The 4 pre-existing typecheck errors in `packages/database` (hitl-store-drizzle + pool-config) are Sprint 9/10 residuals, confirmed unchanged against `main@83f90e9`.

## 4. FRD / Epic Coverage

| Epic | Phase 3 Roadmap scope | Sprint 16 delivery | Status |
|---|---|---|---|
| Epic 2 — LLM Safety v2 | ML classifier, eval harness, active anomaly blocking | LLM3-02, LLM3-03, LLM3-04 all shipped behind flags | **API-complete** (see §6 gates) |
| Epic 3 — Workflow Backend | Graph validation API + WebSocket server | WFE3-01 (live); WFE3-02 ws-server is an isolated island until the Inngest → Redis publisher path ships in S17 | **Surface-complete for staging; not operationally integrated** |
| Epic 8 — Budgeting | FA-4 department budgeting | FA3-01 shipped with admin CRUD + rate-limiter | **API-complete** (see §6 gates) |

**"API-complete" not "closed"**: the wrap review (per Codex's framing, Lead-adjudicated) distinguishes "shipped code + tests" from "ready to enable in production." All three epics are the former; enablement gates in §6 must be cleared before the latter.

## 5. Risk Delta

| Risk | Direction | Evidence |
|---|---|---|
| Workflow graph corruption | ↓ (mitigated) | WFE3-01 validator + RFC 7807 rejection on create |
| ML per-request cost doubling | ↓ (mitigated pre-commit) | Gemini found the duck-typed probe in LLM3-02 review (Codex MCP was session-expired for that round); probe removed entirely; 2 regression tests |
| WebSocket OOM on slow consumers | ↓ (mitigated pre-commit) | Both reviewers found the outbound-backpressure bypass; `beforeEnqueue` hook added; regression test |
| Admin-write abuse | ↓ (mitigated) | FA3-01 admin rate-limiter (30/5 min, 429 RFC 7807) |
| Anomaly-gate silent no-op | ↔ (deferred) | Codex caught the aggregate-key mismatch (gateway passes `domain`, audit uses `resource_type`); gate stays dormant via `resolveActor: () => undefined`; S17 blocker |
| Doc/code drift | ↑ (emerged, partially fixed) | Wrap review found OpenAPI `partial` enum + missing `ws-server-enabled` flag + stale §14.5 — all fixed |
| False confidence from dormant controls | ↑ (emerged) | ML + anomaly flagged "shipped" but runtime-gated by env vars, not flag registry; documented in ADD §14.5 residual risk |
| Senior review bottleneck | ↑ (emerged) | All schema + auth + safety decisions cluster on one reviewer; operational risk for S17 pace |
| Silent ML fallback without alert | ↔ (residual) | `ml_classifier_timeout` metric counter exists, alert threshold not wired → S17 item |

## 6. Enablement Gates (what must be true to flip production flags)

The sprint is **ready for staging release** but **production enablement of Epic 2 features requires five gates** to clear, in addition to the `ml-injection-classifier` / `anomaly-blocking` / `ws-server-enabled` flag flips:

### Epic 2 (LLM Safety v2) production enablement gates

| # | Gate | Current state | Owner |
|---|---|---|---|
| 1 | **Replicate procurement** — vendor credentials + model hosting | Blocked on finance/procurement | Senior |
| 2 | **Anomaly-gate aggregate-key alignment** — gateway passes `domain` but audit rows use `resource_type='candidate'` etc. | Known latent bug; documented in code + multi-review | S17 implementation |
| 3 | **Request→actor plumbing** — `CompletionRequest` carries no user context, so `resolveActor` returns undefined | Not implemented; blocks anomaly gate AND department-ID stamping (merged stream) | S17 implementation |
| 4 | **FeatureFlagService sync-peek** — ML + anomaly `isEnabled` is env-var-gated because FlagService is async; gate flips don't route through the registry | Documented in ADD §14.5 residual risk; S17 architectural decision | S17 architectural work |
| 5 | **Real anomaly baseline job** — S16 ships a placeholder constant `{mean:10, stdDev:3, sampleSize:100}`; needs historical aggregation from real audit events | Not implemented; flipping `ANOMALY_BLOCKING_ENABLED=true` with the placeholder would produce arbitrary false positives/negatives | S17 OBS track |

### Epic 3 (WebSocket) production enablement gate (separate)

| # | Gate | Current state | Owner |
|---|---|---|---|
| 6 | **Inngest → Redis publisher path** for `apps/ws-server` | In-process bridge only in S16; `ws-server-enabled` flag must stay off in production until publisher ships | S17 implementation |

Per the wrap review: **~8-10 SP of Epic 2 blocker work for S17** (items 2-5; #1 is calendar). Epic 3 gate #6 is separate and can ship in S17 or S18 depending on Phase 3.5 UI-F readiness needs.

## 7. Deferred / Carry-Forward to Sprint 17

Merged and triaged during the wrap review. Full list in [sprint-16-plan.md §9](./sprint-16-plan.md#9-sprint-17-preview). Highlights:

**Must ship in S17** (blockers above):
- Request→actor plumbing + department-ID stamping (merged stream, 3-4 SP)
- FeatureFlagService sync-peek or async `isEnabled` (2 SP)
- Real anomaly baseline job (2 SP, OBS track)
- `ml_classifier_timeout` → alerting (1 SP)

**Should ship in S17** (pre-existing preview items):
- Case tracking CT-1..CT-4 (10 SP) — Epic 4
- Crypto live-trading workflow (5 SP) — Epic 5, gated on #2-#3 above
- HR onboarding workflow (4 SP) — Epic 5
- MOD-02 interface contract validation (3 SP) — Epic 5
- FA3-02 budget notifications + HITL escalation merged (3 SP)

**Polish (can slip to S18 or beyond)**:
- Inngest → Redis publish bridge for `apps/ws-server` (unblocks horizontal scale)
- ws-server Railway staging deploy verification
- `UsageRecord` consolidation into `@aptivo/types`
- HITL ↔ ws-server JWT extraction (parallel impl acceptable)
- Safe-logger migration of existing `console.warn` call sites (7 sites in llm-gateway)
- Rate-limiter Redis atomicity (SET NX EX / Lua script)

## 8. Documentation State

- **ADD cascade**: two new vendor rows (Replicate, `apps/ws-server`) in §1.2; topology §2.1 reflects new components; §14.5.1 Safety Envelope updated with Phase 3 delivery + residual-risk paragraph. Commit `0e663c8`.
- **OpenAPI v1.2.0+**: covers new admin `/api/admin/departments` + `/budget` endpoints, workflow `/validate` draft linter, `WorkflowGraphInvalidResponse`, `Department`, `BudgetConfig`, `SpendReport` (with binary `coverageLevel`).
- **WebSocket protocol**: `docs/04-specs/websocket-lifecycle.md` promoted to `Implemented (Sprint 16)` with committed error-code table including new `4003` (token expired mid-session).
- **Eval baseline**: `docs/04-specs/injection-eval-baseline.md` records rule-based holdout numbers (precision 1.000, recall 0.318, F1 0.483, benign FPR 0.000) for comparison when Replicate-backed ML eval becomes available.
- **S17 preview**: fully triaged in `sprint-16-plan.md §9` with merged duplicate entries + new items from wrap review.

## 9. Multi-Model Review Findings (Cumulative Sprint)

Seven multi-model reviews ran this sprint (6 per-task + 1 wrap). **Critical defects caught pre-commit**:

| Finding | Reviewer | Task | Impact if missed |
|---|---|---|---|
| Duck-typed classifier probe (per-request inference) | Gemini | LLM3-02 | Doubling ML cost + latency in production |
| WebSocket backpressure bypass for outbound-only traffic | Both | WFE3-02 | Unbounded ws-lib memory growth → OOM |
| Heartbeat close off-by-one (4th miss not 3rd) | Codex | WFE3-02 | Spec violation; test encoded the bug |
| Graph-validator duplicate step IDs silently accepted | Codex | WFE3-01 | Misleading `UnreachableSteps` error on dup inputs |
| Anomaly-gate aggregate-key mismatch | Codex | LLM3-04 | Silent no-op when S17 wires resolveActor |
| `llm_usage_logs.departmentId` missing FK | Codex | FA3-01 | Orphan stamped IDs passing through |
| Unstamped-row count leaked across departments | Codex | FA3-01 | Misattributed `partial` coverage for unrelated traffic |
| OpenAPI `partial` enum vs binary code | Codex | Wrap review | Client contract drift post-collapse |
| Missing `ws-server-enabled` feature flag | Codex | Wrap review | Acceptance criterion unmet; no staging rollout toggle |

All code-path defects were fixed pre-commit with regression tests that lock in the behaviour change. The doc/config findings from the wrap review (OpenAPI `partial` enum, missing `ws-server-enabled` flag) were fixed inline but are inherently not regression-tested — they're contract / registry state. **Ratio: 9 concrete pre-commit defects caught across 7 review cycles**; one review (LLM3-03) found no bugs, the rest found 1-3 each.

## 10. Release Decision

**READY FOR STAGING RELEASE** with explicit enablement gates (§6).

- Safe to deploy `apps/web` to staging with Epic 2/3/8 API surfaces active.
- `apps/ws-server` can be deployed to staging but cross-process event flow is S17 work.
- **Do NOT flip** `ml-injection-classifier`, `anomaly-blocking`, or `ANOMALY_BLOCKING_ENABLED` in production without clearing gates 1-4 first.
- **Do NOT flip** `ws-server-enabled` in production until real publisher path (Inngest → Redis) ships in S17.
- Department budgeting admin endpoints are production-safe; `coverageLevel` will correctly return `'none'` until S17 stamping middleware ships.

**Production GO/NO-GO** remains NO-GO for the feature flags above; **API surface GO** for release to staging.

## 11. Velocity + Process Notes

- **Delivered**: 27 SP in 9 commits over ~1.5 real-time days (session-compressed; real-team equivalent is 2 weeks).
- **Multi-model review cost**: 7 reviews / ~9 defects caught. Gemini was routed to `flash-preview` tier across all runs (PAL clink routing); Pro tier never reached. Codex (GPT-5) stable after one mid-sprint auth refresh. **Codex caught more concrete defects than Gemini** (roughly 7 vs 2 unique, overlapping on 2).
- **TDD discipline**: test-first on unit layer for every task; Red-confirmation skipped after WFE3-01; service + route-integration tests frequently added after their supporting code (test-adjacent, not strict TDD). Audit flagged this mid-sprint; corrected for remaining tasks.
- **Plan deviations** (all documented in per-task reviews): WFE3-01 validator location (in `apps/web` not `packages/workflow-engine` — that package doesn't exist), LLM3-02 async contract introduction (sync drop-in was incompatible with HTTP inference), WFE3-02 JWT parallel impl (HITL extraction deferred to S17), FA3-01 coverageLevel collapsed from 3-state to binary after pre-commit review.

---

## Appendix A — Commit Graph

```
0e663c8 docs(add): cascade Sprint 16 vendor + architecture decisions
70b3f26 docs(sprint-16): end-of-sprint wrap multi-model review + fixes
330fd6c feat(sprint-16): FA3-01 department budgeting + admin rate-limiter
5a2655c feat(sprint-16): WFE3-02 ws-server + WebSocket protocol v1.0
8d74f4b feat(sprint-16): LLM3-04 active anomaly blocking gate + audit aggregate
90c2d17 feat(sprint-16): LLM3-02 ML injection classifier + Replicate client + gateway integration
01a1dd9 feat(sprint-16): LLM3-03 injection eval harness + 220-sample corpus + baseline
2c66852 feat(sprint-16): WFE3-01 workflow graph validation API + OpenAPI bootstrap
46b3e57 docs(sprint-16): plan + multi-model reviews (Path A revision)
```

## Appendix B — S17 Recommended Starting Order

1. **Request→actor plumbing + department-ID stamping + anomaly aggregate-key alignment** (merged, 4-5 SP) — one stream because they share the audit-store / gateway context. Unlocks the anomaly gate, budget attribution, and closes the correctness bug documented in `S16_LLM3_04_MULTI_REVIEW.md`. Previous draft hid the key-alignment item behind the baseline item; the pre-commit review of this very doc flagged that mis-sequencing.
2. **Real anomaly baseline job** (2 SP) — replaces S16 placeholder constant. Placed before FlagService because it shares audit-store familiarity with item #1.
3. **FeatureFlagService sync-peek or async widen** (2 SP) — unblocks ML + anomaly production flag flips.
4. **ml_classifier_timeout → alert wiring** (1 SP) — cheap observability win; closes the silent-fallback gap. Can be done in parallel with #1-#3.
5. **Case tracking CT-1..CT-4** (10 SP) — the headline S17 feature. Placed AFTER the blocker trio so the safety surface isn't mid-change while case tracking builds on top.
6. Then tackle domain workflows (Epic 5, gated on #1 being stable) and FA3-02 (Epic 8 residual).

Rationale: blockers first so downstream Epic 5 work isn't gated mid-sprint. If parallel capacity exists, case tracking can start once item #1 reaches a stable commit (not necessarily fully merged).
