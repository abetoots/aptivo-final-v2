# Sprint 16 Plan — Multi-Model Review

**Date**: 2026-04-20
**Reviewers**: Claude Opus 4.7 (Lead), Codex/GPT (via Codex MCP), Gemini (via PAL clink — routed to `gemini-3-flash-preview` despite an explicit request for `gemini-3-pro-preview`; this is a known clink routing limitation)
**Subject**: `docs/06-sprints/sprint-16-plan.md` (25 SP, 7 tasks)
**Trigger**: User invocation of `/multi-model` after Sprint 16 plan was written

---

## Executive Summary

Reviewers disagree sharply on whether the 25 SP estimate is realistic. **Gemini** rates the plan "high confidence, ready for execution" and flags only polishing items (observability metrics, auth-failed audit events, Railway monorepo config). **Codex** argues the plan is closer to **32-38 SP** of real work packaged under 25 SP headline, with four tasks under-estimated and several concrete codebase gaps hidden behind aspirational DoD items.

Lead adjudication (verified by direct codebase inspection): **Codex is materially correct on four concrete facts**, and those facts change the risk calculus. Gemini's review is structurally valid but operates at a higher level and misses codebase-specific gaps. The sprint should either raise estimates + cut FA3-02, or keep 25 SP with narrower acceptance criteria — this is a judgment call that should go back to the user.

---

## Consensus Findings

All three reviewers agree on:

1. **Plan structure and architectural choices are sound.** Pure-function graph validator, separate `apps/ws-server` app, new `@aptivo/budget` package, factory-with-DI form, feature-flagged rollout for ML + anomaly + ws-server. No reviewer pushed back on the three user-locked architectural decisions.
2. **LLM3-03 eval corpus quality is the single biggest non-code risk.** Manual curation of 200+ distinct samples that are not paraphrases of the existing regex patterns is subjective and reviewer-bottlenecked. Senior Dev sign-off is a true serial dependency.
3. **Fail-open on anomaly-detector cold start is the correct default.** Locked gateway on Day 1 is worse than delayed block on Day 3; should be documented in the delivery review as an accepted residual risk.
4. **Feature flags reduce rollout risk, not implementation complexity.** Shipping ML + anomaly + ws-server behind flags means their acceptance criteria must still be hit in full — flags do not shrink the sprint.
5. **Down-migration verification as a DoD item is a strong engineering standard** — explicit reversibility prevents database one-way doors.
6. **Senior Dev is a review bottleneck.** All three tracks send schema, auth, and safety decisions back to the same person; critical-path reviews will cluster around the Senior even when implementation runs in parallel.

---

## Debated Items

### D1. Is 25 SP realistic, or is this actually 32-38 SP of work?

| Reviewer | Position |
|---|---|
| Gemini | 25 SP is realistic; plan is ready for execution. Only minor additions needed (observability, auth audit). |
| Codex | Real work is 32-38 SP. Four tasks under-estimated: WFE3-02 5→8-10, FA3-01 5→8, LLM3-03 3→5, LLM3-04 2→3-4. Cut FA3-02 to stay under ~30 SP. |
| Claude (Lead) | **Codex is closer, but 32-38 is pessimistic.** Realistic pushed estimates: WFE3-02 5→6-7, FA3-01 5→6-7, LLM3-03 3→4, LLM3-04 2→3. Total ~28-30 SP — above the 25 SP headline, at-or-near Phase 2 velocity. |

**Verdict**: Escalate to user (see Actionable Recommendations §1). Both "revise upward + cut FA3-02" and "keep 25 SP with tighter scope" are defensible, but the user owns the tradeoff.

### D2. Is the 500 ms ML timeout too tight?

| Reviewer | Position |
|---|---|
| Gemini | "Tight. If Replicate latency is consistently higher, this causes silent fallback and masks ML issues." |
| Codex | Did not flag this. |
| Claude (Lead) | **Gemini is right.** 500 ms is aggressive for Replicate cold-start; typical warm inference is 200-400 ms but cold calls can be 1-2 s. Mitigation exists (logger warns on every timeout) but silent fallback that mutes to production noise is a real observability gap. |

**Verdict**: Keep 500 ms as default but add an acceptance criterion: LLM3-02 must emit a metric counter for `ml_classifier_timeout` events so ops can detect sustained high-latency regimes. Not an SP bump — a sub-task inside LLM3-02.

### D3. Should FA3-02 (budget-exceed notifications) be kept or cut?

| Reviewer | Position |
|---|---|
| Gemini | Keep. Good use of existing notification adapters. |
| Codex | Cut if needed to protect the 25 SP. Not a gate for S17. In-memory dedupe does not prove durability across restarts or multi-instance deployments. |
| Claude (Lead) | **Cut if estimates rise.** FA3-02 was pulled into S16 primarily to balance Web Dev 2 load; if FA3-01 itself grows to 6-7 SP, the balance is restored without FA3-02. Codex's durability point is sharp — in-memory dedupe is cosmetic in a multi-instance production deployment. |

**Verdict**: Conditional — if D1 lands on "revise upward," cut FA3-02 and defer to S17 where it can be paired with HITL escalation. If D1 lands on "tighten scope within 25 SP," keep FA3-02 but add an acceptance criterion that dedupe is Redis-backed, not in-memory.

### D4. Can critical-path reviews be distributed?

| Reviewer | Position |
|---|---|
| Gemini | Did not raise. |
| Codex | Senior Dev is a bottleneck on schema (FA3-01), auth (WFE3-02), safety (LLM3-02/03/04) — all PRs converge on the same reviewer. |
| Claude (Lead) | **Codex's point is structurally important but out of scope for the sprint plan.** Solution is a process one (rotate secondary reviewers, timebox senior review) not a plan-doc one. Flag in delivery review. |

**Verdict**: Note in the delivery-review template; no plan-doc change.

---

## Concrete Codebase Gaps (verified by Lead via direct inspection)

Codex identified four concrete codebase claims that the Lead verified by reading source:

### G1. `llm_usage_logs.category` does not exist

**Plan says (LLM3-02)**: "ML inference records `usage` row with `category='safety_inference'`, `costUsd`, `latencyMs`"
**Reality**: `packages/database/src/schema/llm-usage.ts:40` — the column is `requestType: varchar('request_type', { length: 50 })`, not `category`.
**Fix**: Either (a) repurpose `requestType = 'safety_inference'` (no schema change), or (b) add a `category` column with its own migration. Option (a) is clearly preferable — update LLM3-02 acceptance criteria and TDD micro-tasks to say `requestType: 'safety_inference'`. Effort: trivial plan-doc edit; no SP impact.

### G2. Generic `verifyJwt` does not exist

**Plan says (WFE3-02)**: "server verifies via shared `verifyJwt`" with a vague "Extract or re-export" file note.
**Reality**: Grep finds `verifyJwt`-related code only in HITL gateway (`packages/hitl-gateway/src/decision/multi-decision-service.ts`) and tests. No generic auth utility module.
**Fix**: Either (a) extract HITL's JWT verify into a new `packages/auth-utils` or co-locate in `packages/types`; or (b) copy-paste the HITL approach into ws-server with a TODO seam. Codex rightly flagged this as real refactor work. Effort: 0.5-1 SP absorbed into WFE3-02 (already at 5 SP after the prior critique).

### G3. `adminRateLimit` middleware does not exist

**Plan says (FA3-01)**: "Admin rate-limit middleware applied; verified via test… reuses existing admin middleware"
**Reality**: Grep finds `adminRateLimit` only in the Sprint 16 plan itself. No such middleware exists today.
**Fix**: Either (a) implement a minimal token-bucket admin rate limiter as part of FA3-01 (1 SP); or (b) drop the rate-limit criterion and document it as an S17 residual. Recommend (a) — admin write endpoints without rate limits is an operational blind spot. Effort: 1 SP added to FA3-01 → 6 SP.

### G4. `@aptivo/llm-gateway` still uses `console.warn`

**Plan says (DoD)**: "Safe-logger passed via DI into every new package component that logs."
**Reality**: Grep finds 7 `console.warn/error/log` calls across `packages/llm-gateway` (including `gateway/llm-gateway.ts`). The DoD item silently implies migrating existing calls too.
**Fix**: Either (a) scope the DoD item to *new* components only (explicit wording change, no SP bump), or (b) budget a 1 SP cleanup task to migrate existing calls. Recommend (a) plus a line item in S17 to finish the migration. Effort: plan-doc edit only.

---

## Additional Items from Gemini (polish, not gaps)

- **`ws-server` observability metrics** — add Prometheus/OpenTelemetry counters: `active_connections`, `message_egress_rate`, `pubsub_latency`. Sub-task inside WFE3-02; no SP bump since the server already exists as a process.
- **WebSocket auth-failure audit events** — on close code 4001 or 4003, write an audit event to detect credential stuffing. Sub-task inside WFE3-02; no SP bump.
- **Railway monorepo config** — specify `rootDirectory` / `watchPatterns` in `railway.json` so `ws-server` builds don't trigger `apps/web` deploys. Part of the Railway manifest work already in WFE3-02; clarify in the plan.
- **Zod schema sharing** — `websocket-events.ts` schemas exported from `@aptivo/types` so Phase 3.5 UI doesn't drift. Already in the plan but worth highlighting.

None of these require estimate changes; they sharpen WFE3-02's acceptance criteria.

---

## Items from Codex that Lead Views as Correct but Out-of-Scope for This Plan

- **WS RBAC model underspecified** (topic authorization, tenant isolation, audit of rejected subscriptions). Codex is right, but this is a v1.1 extension — the plan's v1.0 scope is "reject topic if user lacks role." Noted for S17 follow-up.
- **Redis pub/sub operational details thin** (which Redis instance, channel naming, payload schema validation, disconnect behaviour). Reasonable to expect in the delivery review, not the sprint plan.
- **"POST /api/workflows/:id/validate" endpoint shape is muddy** (does `id` refer to a persisted workflow or is this draft validation?). Fair point — the plan should clarify. Sub-task for WFE3-01; no SP bump.
- **Spend reports return $0 for untagged traffic** (acknowledged in AD8 of the design doc but risks implying usable reporting). Add an explicit acceptance criterion that `getSpendReport` returns `$0` with a status field `{ coverageLevel: 'none' | 'partial' | 'full' }` so callers aren't misled.

---

## Actionable Recommendations

1. **ESCALATE TO USER (D1, D3)**: choose between two paths.
   - **Path A — Revise upward + cut FA3-02**: WFE3-02 5→6, FA3-01 5→6 (for G3 rate limiter), LLM3-03 3→4, LLM3-04 2→3. Cut FA3-02 (2 SP) and defer to S17. New total: **26 SP**. Most honest to the real work involved.
   - **Path B — Hold 25 SP with tighter scope**: keep estimates but (i) drop Railway staging deploy verification from WFE3-02 DoD (defer to S17), (ii) make WFE3-02 ship behind `ws-server-enabled` flag without live staging, (iii) keep FA3-02 but restrict dedupe to in-memory with an explicit "single-instance only" acceptance criterion. Faster sprint, more residuals.
2. **PLAN-DOC EDITS (no SP impact)** — apply these regardless of which path wins:
   - LLM3-02 → use `requestType: 'safety_inference'` not `category` (G1)
   - WFE3-02 → add explicit sub-task for extracting JWT verification from HITL into a shared module (G2)
   - FA3-01 → either add a 1 SP rate-limiter sub-task (G3) or drop the rate-limit DoD
   - DoD wording → scope safe-logger migration to *new* components only; add S17 line item for existing cleanup (G4)
   - WFE3-02 → add observability metrics + auth-failure audit events as sub-tasks
   - WFE3-01 → clarify `POST /api/workflows/:id/validate` body shape (draft validation vs persisted validation)
   - FA3-01 → `getSpendReport` returns `{ coverageLevel }` status so callers know spend is partial until S17 stamping lands
3. **DELIVERY REVIEW FRAMING** — Senior Dev review bottleneck is a real risk; process fix, not plan fix. Flag explicitly in the S16 delivery-review template.
4. **PROMPT ROUTING FIX (operational)** — PAL clink is routing Gemini requests to `gemini-3-flash-preview` regardless of the model name passed in prompt. Either raise with the clink config or always request Pro through a separate channel. The flash model's reviews are structurally valid but miss codebase-specific gaps that Pro would likely catch.

---

## Provenance

- **Claude (Lead)**: Independent analysis + direct codebase verification of Codex's four specific claims (see §G1-G4).
- **Codex (GPT)**: Response on Codex MCP thread `019daabf-0148-7d83-aaf8-1718637936c9`, read the plan + key source files, produced a 900-word critique with codebase-grounded gaps.
- **Gemini**: Response via `mcp__pal__clink` role=codereviewer. PAL routed to `gemini-3-flash-preview` again; the user-requested `gemini-3-pro-preview` was not reached. Flash review was structurally valid but missed G1-G4.

The lead weighted Codex's review more heavily on §G1-G4 because all four claims were verified against current source, and Gemini weighted equally on D2 and the polish items where its surface-level read caught useful things Codex missed.
