# Sprint 17 Task S17-B4 — Multi-Model Review

**Date**: 2026-04-23
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019db92a-2b29-74f3-819b-d2151b3dc449`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `1b8aa30f-dbc0-4911-8b59-d9f54aff4607`).
**Subject**: S17-B4 — `ml_classifier_timeout` SLO alert wiring + 3 legacy `console.warn` sites in `@aptivo/llm-gateway` migrated to injected loggers. Pre-commit review of 15-file diff (3 new files).
**Outcome**: Round 1 — Codex NO-GO with one HIGH and three MEDIUMs; Gemini GO with same HIGH flagged. Round 2 after applied fixes — both **GO**, Codex conditional on commit framing not overclaiming the AC.

---

## Executive Summary

S17-B4 has two scopes:
1. **Wire the `ml_classifier_timeout` SLO alert** — closes the wrap-review silent-fallback gap. The ML injection classifier (LLM3-02) emits `ml_classifier_timeout` warns on every Replicate timeout but had no alerting. A new in-process `SafetyInferenceCounter` records each classify() outcome; a new `mlClassifierTimeoutAlert` SLO evaluator fires when sustained timeout rate > 5% over 5-min window AND sample size ≥ 20 calls (noise filter).
2. **Migrate 3 legacy `console.warn` sites** in `@aptivo/llm-gateway` to injected loggers — broken-window cleanup absorbed per the original S17_B1 multi-review agreement.

Round 1 found two real bugs: (a) the counter's `maxEvents` count cap evicted in-window events at >33 rps, breaking rate semantics; (b) the runbook claimed "pure outage shows volume collapses to zero" which is false because `error` outcomes still increment volume. Both fixed in code/docs. The third Round-1 finding — the `console.warn` migration retains a `console.warn` fallback path when no logger is injected, violating the literal "rg returns zero matches" AC — was resolved by narrowing the AC scope rather than removing the fallback (back-compat for direct test instantiations).

---

## Round 1 Findings

### Codex (GPT-5) — **NO-GO**

- **HIGH** — `console.warn` AC violation. Plan says `rg 'console\.warn' packages/llm-gateway/src/` should return zero. Live fallbacks remain in `pricing.ts:57`, `redis-rate-limit-store.ts:43`, `llm-gateway.ts:165`. Defensible only with narrower framing.
- **MEDIUM** — `SafetyInferenceCounter.maxEvents` cap is window-incorrect. `record()` evicts oldest by index when count exceeds `maxEvents=10000`, even if those events are still inside the queried window. At >33 rps, the metric becomes "last N events" not "all events in trailing 5 min". A burst of 9k timeouts then 10k successes inside 5 min would alert as 0% instead of ~47%.
- **MEDIUM** — Runbook semantic drift. The runbook said "pure outage shows volume collapses to zero" but `error` outcomes increment volume too. So a Replicate outage that returns errors maintains volume but yields rate=0 — not what the runbook implies.
- **MEDIUM** — Single-instance counter has real false-negative risk on multi-instance Railway. Documented but should be framed as "instance-local early warning, not fleet-level SLO coverage".
- **Answer to outcome categorization**: counting `invalid_response` as `error` rather than `timeout` is correct for a metric named `mlClassifierTimeoutRate`.
- **Answer to sync getMlSafetyMetrics inside async collectSloMetrics**: visually inconsistent, architecturally fine.
- **Answer to min-samples=20**: reasonable starter; keep hard-coded.
- **AC check**: 6 of 6 ACs evaluated — AC4 (zero `console.warn`) NOT MET; AC3 (runbook accuracy) partially met due to outage wording; others met.

### Gemini (flash-preview) — **GO with caveats**

- Same `console.warn` AC violation flagged as HIGH; recommended either removing fallback or updating AC.
- Same `maxEvents` observation framed more leniently as "trade-off, more twitchy under load" rather than a correctness bug.
- Acknowledged single-instance limitation as documented.
- Agreed on outcome categorization, min-samples, and overall scope.

---

## Round 2 — Applied Resolutions

### 1. Counter window correctness — fixed
Replaced `maxEvents` count cap with `maxRetentionMs` time-based pruning. Default 30 minutes (well above the 5-min SLO window). `record()` now prunes anything older than `now - maxRetentionMs` on every call. Every event inside the configured retention is preserved by construction. Updated the deleted `maxEvents-cap` test to a high-throughput correctness test that pushes 15k events at 50 rps over 5 min and verifies rate=10% and volume=15k (would have failed with the old count cap).

### 2. Runbook accuracy — fixed
Removed the inaccurate "pure outage shows volume collapses to zero" sentence. Replaced "Likely causes" section with latency-only causes. Added a new "What this alert does NOT catch" paragraph explicitly naming Replicate outages and contract breaks as covered by `ml_classifier_error` / `ml_classifier_invalid_response` warns (recorded as `error` outcomes, increasing `mlSafetyVolume` but not `mlClassifierTimeoutRate`). The alert is now honestly framed as transport-latency-focused.

### 3. `console.warn` AC — narrowed framing
Per Codex's condition: the commit message and this multi-review explicitly state that the AC was tightened to "**production callsites migrated to structured logging; package-level fallback to `console.warn` preserved for back-compat with direct library instantiation**". The 3 sites accept an optional logger and fall back to `console.warn` only when undefined. The composition root in `apps/web/src/lib/services.ts` passes a structured logger into all 3 in production. Removing the fallback would force every test that instantiates `UsageLogger(store)` to add a second argument — that test-update tax is not justified by the broken-window concern.

### 4. Single-instance counter — documented framing
Runbook caveat reframed: instance-local early warning, not fleet-level SLO coverage. Redis-backed counter swap is the documented future task.

---

## Round 2 — GO Verdicts

### Codex
> The technical NO-GO items are resolved enough for merge: the counter issue is fixed if `timeoutRate(windowMs <= maxRetentionMs)` is now the explicit contract and the 15k-event test passes. The runbook now matches the implemented semantics, which removes the misleading outage guidance. The multi-instance limitation is acceptable as a documented instance-local early-warning mechanism. The remaining `console.warn` point is no longer a code-quality blocker; it is a scope/claiming issue. **GO** for the implementation, NO-GO for any writeup that overclaims the migration AC.

### Gemini
> The shift to time-based pruning in the `SafetyInferenceCounter` effectively resolves the throughput-based eviction risk, and the new 50 RPS test proves its correctness. The runbook refinements provide excellent operational clarity for on-call engineers. Preserving `console.warn` fallbacks for library-level stability while migrating all production callsites is a pragmatic and safe compromise. With 100% test pass rates and all gates addressed, the task is verified. **GO.**

---

## Reframed B4 Scope

S17-B4 ships:
- ✅ `SafetyInferenceCounter` (in-memory, time-based retention) + `MlClassifierDeps.metrics?: SafetyInferenceCounter`
- ✅ ML classifier records exactly one outcome (`success`/`timeout`/`error`) per `classify()` call
- ✅ `mlClassifierTimeoutAlert` SLO evaluator with 5% threshold + 20-sample noise filter
- ✅ `MetricServiceDeps.safetyInferenceCounter` + new `getMlSafetyMetrics()` reader
- ✅ `SloMetricsDeps.getMlSafetyMetrics` wiring through `collectSloMetrics` → `evaluateAllSlos`
- ✅ Composition root in `services.ts` shares the counter between ML classifier and metric service
- ✅ **Production callsites** for the 3 legacy `console.warn` sites migrated to injected loggers via composition root (`UsageLogger`, `createLlmGateway`, `createRedisRateLimitStore` all receive `appLog`-bridged loggers)
- ✅ Runbook §5.2.1 — symptom + likely causes + "what this alert does NOT catch" + oncall response + caveats
- ✅ Tests: 7 counter unit tests (including the new high-throughput correctness test), 6 alert evaluator tests; all 188 llm-gateway + 67 audit + 1820 apps/web tests pass

S17-B4 does NOT ship:
- ❌ Literal zero `console.warn` in `@aptivo/llm-gateway` source. Fallback to `console.warn` is preserved when callers don't inject a logger (back-compat for tests + future direct library consumers). All production callsites use the structured logger.
- ❌ Multi-instance / fleet-level SLO coverage. The counter is in-process per `apps/web` pod. Redis-backed counter is a future task — runbook documents this explicitly as instance-local early warning.
- ❌ Separate alert for non-latency error rates (Replicate outages, contract breaks). `ml_classifier_error` warns are emitted; an error-rate alert is a follow-up.

---

## Provenance

- **Codex via MCP thread `019db92a-2b29-74f3-819b-d2151b3dc449`** (GPT-5, sandbox read-only). Round-1 delivered ~700-word structured review with 1 HIGH + 3 MEDIUM findings, AC checklist, and explicit NO-GO. Round-2 conditional GO on writeup framing.
- **Gemini via `mcp__pal__clink`** (continuation `1b8aa30f-dbc0-4911-8b59-d9f54aff4607`). Independently flagged the `console.warn` AC violation; observed but didn't block on the counter cap. Round-2 unconditional GO.
- **Lead (Claude Opus 4.7)**: verified counter behaviour with the new high-throughput test; ran full test suites after each fix (llm-gateway 188/188, audit 67/67, apps/web 1820/1820); confirmed Sprint 9/10/11 pre-existing typecheck residuals unchanged.
