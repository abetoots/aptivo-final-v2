# Sprint 16 — End-of-Sprint Wrap Multi-Model Review

**Date**: 2026-04-21
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019db369-aebe-7262-9380-b3bb8bb52710`), Gemini via PAL clink (`gemini-3-flash-preview`).
**Scope**: commits `2c66852..330fd6c` on branch `main` — the full Sprint 16 delivery. Different from per-task reviews — this is sprint-wide cohesion.

---

## Executive Summary

Sprint 16 is **task-level code-complete**. All six tasks shipped with working code, tests, and per-task multi-model reviews. The gap surfaced by this wrap review is **cross-task cohesion**: several completion notes and public contracts describe a more-integrated sprint than the actual code delivers. Codex's framing is the more accurate read — **"API-complete" rather than "operationally closed"**. Gemini's "CLOSED" verdict on all three epics overstates readiness.

The sprint's own epic-closure tracking should be softened from "closed" to "API-complete" for Epic 2 and Epic 3; Epic 8 is the closest to truly closed but still hinges on S17 stamping plumbing.

Three concrete contradictions are trivially fixable pre-wrap; they're documented below and fixed in this commit.

---

## Consensus Findings (both external reviewers)

1. **Anomaly-gate aggregate-key mismatch is the highest-impact S17 blocker.** Gateway passes `request.domain` (crypto/hr/core) but audit rows use values like `'candidate'`/`'employee'` with actions like `'pii.read.bulk'`. Already tracked in `S16_LLM3_04_MULTI_REVIEW.md` and in the S17 preview, but both reviewers reinforce it's the #1 thing S17 must resolve before `ANOMALY_BLOCKING_ENABLED` can be flipped.
2. **FeatureFlagService sync/async mismatch** forces LLM3-02 and LLM3-04 to env-gate their runtime toggles rather than consuming the flag registry. Two safety toggles that are supposed to ship-behind-flag aren't actually driven by the platform flag system.
3. **Silent ML fallback residual risk**: the 500 ms timeout means sustained Replicate-latency regimes silently revert to rule-based. The `ml_classifier_timeout` metric counter exists but isn't wired to an alert.
4. **Several per-task defects were caught pre-commit** that would otherwise have made production: ML per-request probe (doubling cost), WS backpressure bypass (unbounded memory), WS heartbeat off-by-one, FA3-01 FK gap + spend-leak. Each has a regression test.

## Unique Findings (Codex, Lead-verified)

### 🚨 OpenAPI still advertises `coverageLevel: partial` — contract/code drift

**Claim**: `apps/web/openapi.yaml:389-395` declares `coverageLevel: { enum: [none, partial, full] }` with a description explaining the three-state interpretation. But FA3-01's pre-commit review collapsed the code to binary `'none' | 'full'` (see `packages/budget/src/types.ts:39` and service logic at `department-budget-service.ts:200`). **Clients that consume the OpenAPI spec would code against a contract the server can't produce.**

**Fix**: open-api enum reduced to `[none, full]`; description aligned.

### 🚨 `ws-server-enabled` feature flag NOT shipped

**Claim**: sprint-16-plan.md WFE3-02 acceptance criteria (lines ~36, ~416) explicitly added a `ws-server-enabled` flag to `DEFAULT_FLAGS` to allow staging rollout independent of app deploy. The flag is NOT present in `apps/web/src/lib/feature-flags/local-provider.ts`.

**Fix**: flag added with `enabled: false` and description matching the plan AC.

### 🚨 No Inngest → Redis publish path — `apps/ws-server` is an isolated island

**Claim**: WFE3-02's acceptance criteria AND spec doc (both say "publish selected workflow step events to Redis channel consumed by ws-server"). The `apps/ws-server/src/event-bridge.ts` is explicitly in-process only and the `apps/web/src/lib/inngest.ts` has zero Redis publish code. Cross-process event flow is actually S17 work.

**Decision**: this is accurately documented in `S16_WFE3_02_MULTI_REVIEW.md` as deferred to S17. But the sprint-plan completion notes frame WFE3-02 as complete end-to-end. Softened the completion-note language to explicitly state "backend scaffolding; publisher path lands S17." No code change required — the deferral was already tracked.

## Debated Items

### Epic-closure semantics — "CLOSED" vs "API-complete"?

| Reviewer | Position |
|---|---|
| Gemini | Epic 2, Epic 3, Epic 8 all **CLOSED**. Functionally complete; ships behind flags. |
| Codex | Epic 2 **implemented, not operationally closed** (flag wiring, actor context, baseline). Epic 3 — graph validation closed, WebSocket cross-process path NOT (ws-server is isolated). Epic 8 — admin API closed, attribution control NOT (stamping absent). |
| Lead | **Agree with Codex.** "Closed" implies ready-to-enable. S16 delivers the surface; S17 delivers operability. |

**Verdict**: roll out a deliberate phrasing change — call the sprint "API-complete for Epic 2/3/8" rather than "Epic 2/3/8 closed." Updated in sprint-plan delivery-notes. This is important for Phase 3 roadmap honesty; if a future reader sees "Epic 2 closed" they'll think safety is live, which it isn't.

### Does the sprint-plan content accurately reflect shipped code?

| Reviewer | Position |
|---|---|
| Gemini | "High fidelity." |
| Codex | Three oversells: WFE3-02 end-to-end real-time, FA3-01 attribution semantics, feature-flag-driven rollout. |
| Lead | **Agree with Codex on WFE3-02 framing and FA3-01 attribution doc (both now fixed).** On feature-flag framing: the plan language is technically accurate (flags exist in the registry; runtime gate is env-gated separately) but easy to misread. Tightened the relevant notes. |

## S17 Carry-Forward — Triaged

**Hard blockers** (S17 cannot ship Epic 5 crypto live-trading or Epic 4 case tracking without these):
1. Anomaly aggregate-key alignment (LLM3-04 latent bug, pre-commit-review-documented).
2. Request→actor plumbing (shared by anomaly gate + dept stamping — merge as one stream).
3. Department-ID stamping middleware (Epic 5 crypto live-trading needs per-dept spend for enablement review).

**Operational blockers for flag flips**:
4. FeatureFlagService sync-peek OR widen `isEnabled` to async (blocks ML + anomaly production enablement).
5. Real anomaly-baseline job (replaces S16 placeholder constant; blocks `ANOMALY_BLOCKING_ENABLED=true`).
6. Replicate procurement (blocks ML eval-vs-baseline numbers → blocks `ml-injection-classifier` enablement).

**Polish / non-blocking** (can slip to S18+):
- Inngest → Redis publish bridge for `apps/ws-server` (only matters if Phase 3.5 UI-F needs real-time before Phase 3.5 starts; otherwise fine).
- ws-server Railway deploy verification.
- `UsageRecord` consolidation in `@aptivo/types`.
- HITL ↔ ws-server JWT extraction.
- Safe-logger migration of existing `console.warn` call sites.
- Rate-limiter Redis atomicity (INCR+EXPIRE → SET NX EX / Lua).
- FA3-02 budget-exceed notifications (paired with HITL escalation).
- Duplicate S17 preview entries: "department-ID stamping" and "request→actor plumbing" were separate items; they're actually the same implementation stream — consolidate in S17 plan.

**Estimated S17 blocker SP**: 8-10 (item #1-3 as one merged stream ~5 SP; #4 ~2 SP; #5 ~2 SP; #6 is calendar-risk not SP).

## Risk Delta

| Risk | Before S16 | After S16 | Status |
|---|---|---|---|
| Workflow graph corruption | Medium | Near-zero | Mitigated by WFE3-01 |
| ML cost/latency doubling | Medium | Near-zero | Mitigated — pre-commit review fix |
| WS backpressure OOM | High | Near-zero | Mitigated — pre-commit review fix |
| Admin-write abuse | Medium | Low | Mitigated — admin rate-limiter |
| Doc/code drift | Low | **Medium** | Emerged — coverageLevel OpenAPI lag, flag registry gap |
| False confidence from dormant controls | N/A | **Medium** | Emerged — ML + anomaly flagged "shipped" but dormant |
| Senior review bottleneck | Low | **Medium** | Emerged — all schema/auth/safety decisions cluster on one reviewer |
| Silent ML fallback (no alerting) | N/A | Low | Residual — metric exists, alert doesn't |

---

## Actionable Recommendations — Pre-Wrap Fixes Applied

1. ✅ **OpenAPI `coverageLevel` enum reduced to `[none, full]`** + description aligned. Client contract now matches code.
2. ✅ **`ws-server-enabled` flag added** to `DEFAULT_FLAGS` with `enabled: false` and description matching the plan AC.
3. ✅ **Stale `'partial'` reference in `packages/budget/src/types.ts:39`** — the existing comment correctly explains the collapse, left as-is (historical rationale is useful).
4. ✅ **Sprint-plan completion-note phrasing softened**: epic status described as "API-complete" rather than "closed"; WFE3-02 framed as "backend scaffolding; publisher path lands S17."

---

## S17 Plan Updates Recommended

1. **Merge two duplicate entries** in the S17 preview: "request→actor plumbing" and "department-ID stamping" are the same implementation stream.
2. **Add explicit enablement-gate entries**: "ML classifier production enablement review" must be gated on Replicate procurement + eval numbers; "ANOMALY_BLOCKING_ENABLED flag flip" gated on key alignment + baseline job.
3. **Flag "silent ML fallback alerting"** as a small S17 item (wire `ml_classifier_timeout` counter to an alert threshold).

---

## Provenance

- Codex via MCP thread `019db369-aebe-7262-9380-b3bb8bb52710` (fresh session; running as GPT-5). Full 1,100-word critique with file:line citations.
- Gemini via `mcp__pal__clink` (`gemini-3-flash-preview`). ~700-word summary; softer "CLOSED" verdict that Lead overruled in favour of Codex's "API-complete" framing.
- Lead verification: directly confirmed OpenAPI `partial`, missing `ws-server-enabled` flag, absence of Redis publish path via `grep`.
