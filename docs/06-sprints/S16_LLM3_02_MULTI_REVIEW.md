# LLM3-02 Pre-Commit Review — Multi-Model

**Date**: 2026-04-21
**Reviewers**: Claude Opus 4.7 (Lead), Gemini via PAL clink (`gemini-3-flash-preview`). **Codex MCP session expired** mid-review ("Session not found for thread_id") — skill's degraded-mode fallback applied. Codex has now been unavailable across the last two reviews; worth refreshing the CLI session before the next sprint round.
**Subject**: LLM3-02 ML injection classifier + Replicate client + gateway integration prior to commit

---

## Executive Summary

Gemini found **one critical bug** (real production impact) and **one high-impact design issue** (feature-flag bypass). Both Lead-verified by reading the relevant code. Fixed inline pre-commit. Plus a type-drift hygiene concern that was acknowledged with a clearer comment rather than fixed (cross-package dependency inversion costs more than the risk in a small team).

## Consensus / Critical

### 🚨 CRITICAL (fixed): Duck-typed probe issued a real ML inference per request

**What Gemini flagged**: `llm-gateway.ts:307-319` — the `isAsyncClassifier(c)` helper called `c.classify('', 'core')` just to test whether the return was thenable. The helper was invoked inside `complete()` on every request. For an ML classifier wired in, this meant **every `complete()` call triggered a real inference call with an empty prompt** just to probe the type — doubling latency and cost, and burning Replicate rate limits for no detection benefit.

**Lead verification**: confirmed by reading the gateway source — yes, the probe called `classify` on the hot path, not at construction time.

**Fix applied**:
- Removed the probe entirely. `GatewayDeps.injectionClassifier` now accepts `AsyncInjectionClassifier` only. The sync rule-based classifier must be wrapped via `asAsyncInjectionClassifier()` **at composition time** (once, not per request).
- Updated `services.ts` — already wraps sync at composition, so no behaviour change in the app.
- Updated `llm-gateway-injection.test.ts` — the two tests that were passing sync classifier directly now use the `asAsync` adapter explicitly.
- **Added Gemini's recommended call-count regression test**: two new tests that assert `classify()` is invoked exactly once per message on each `complete()`. These lock in the fix — if anyone reintroduces per-request probing, these tests fail.

Gateway test count: 5 → 7 (two regression tests added). Total llm-gateway tests: 155 → 161.

### ⚠️ HIGH (documented, not fully fixed): Feature-flag gate bypasses the FeatureFlagService

**What Gemini flagged**: `services.ts:724` binds the classifier's `isEnabled` to `process.env.ML_INJECTION_ENABLED === 'true'`, bypassing the `FeatureFlagService` and the `ml-injection-classifier` entry in `DEFAULT_FLAGS`. The registry entry is effectively a no-op for this feature.

**Lead's assessment**: Gemini is right, but the fix is non-trivial. The flag service's `isEnabled()` is async (Redis-backed cache behind the async contract). The ML classifier's `isEnabled` is sync because Classify happens on the LLM request hot path — awaiting the flag service every classify would add a Redis round-trip to every call. Two proper fixes:
1. Widen `MlClassifierDeps.isEnabled` to `() => boolean | Promise<boolean>` and await inside the wrapper (one extra microtask per call; Redis cache hit is typically <1 ms).
2. Expose a `isSyncEnabled(key): boolean` on `FeatureFlagService` that peeks at the in-process cache without the async contract.

Both are non-trivial (touching the flag service + its consumers). Tracked as **S17 follow-up** in the plan.

**Pre-commit action**: strengthened the comment at `services.ts:724` to explicitly call out the tradeoff. Extended the flag description in `DEFAULT_FLAGS` so a reader looking at the registry understands the env-var is the actual runtime toggle for S16.

### 🔸 MEDIUM (acknowledged, not fixed): `UsageRecord.requestType` duplicated in two places

**What Gemini flagged**: the gateway's `UsageRecord` and the database adapter's `UsageRecord` are duplicate interfaces. Widening one without the other silently drifts.

**Lead's assessment**: adding a type-only import from `@aptivo/llm-gateway` to `@aptivo/database` would invert the architectural layering (database shouldn't depend on llm-gateway). The proper fix is to move `UsageRecord` to `@aptivo/types`, but that's a cross-package refactor beyond pre-commit scope.

**Pre-commit action**: replaced the inline `mirroring @aptivo/llm-gateway UsageStore` comment with an explicit `DRIFT RISK` comment calling out the S17 task to consolidate in `@aptivo/types`. The duplicate remains; the risk is documented not silent.

---

## Lead's additional fixes surfaced by Gemini's review

### Type-boundary fix: `logSafetyInference` now accepts `domain: string`

The gateway's `UsageRecord.domain` is the narrow `providers.Domain` union, but the safety package's `SafetyInferenceRecord.domain` was intentionally typed as `string` to avoid coupling (so `SafetyInferenceRecord` can flow across package boundaries without dragging the Domain union). The previously-working composition in `services.ts` broke once the full typecheck ran. Fixed by widening `logSafetyInference`'s parameter `domain` to `string`, with a cast at the `store.insert` boundary where the narrower type is expected (the DB column is `varchar(50)` — cast is a TS-level concession, not a runtime change).

This was not Gemini's finding; surfaced during my re-verification pass.

---

## Items Gemini flagged as clean

- **Timeout implementation**: `withTimeout` correctly clears the `setTimeout` on both resolution and rejection. No memory leak. ✓
- **Surgical fallback design**: availability preserved via rule-based fallback on ML timeout/error. ✓
- **Logger bridge**: `safetyLoggerBridge` cleanly isolates the package from app-level logging while matching the call signature. ✓
- **Zod validation**: robust response parsing at the ML boundary; parse failure treated as a fallback trigger. ✓

## Actionable Recommendations (all applied pre-commit)

1. ✅ **Remove the duck-typed probe.** Gateway accepts `AsyncInjectionClassifier` only. Composition root adapts sync once.
2. ✅ **Add call-count regression tests** that would detect the probe coming back.
3. ✅ **Tighten feature-flag comment** to make the env-var override explicit; extend `DEFAULT_FLAGS` entry description.
4. ✅ **Document `UsageRecord` drift risk** in the database adapter; flag S17 consolidation task.
5. ✅ **Widen `logSafetyInference.domain` to `string`** with a cast at the store boundary; type-boundary tidy-up.

## Deferred to S17 (tracked)

- Proper `FeatureFlagService` wiring for the ML classifier — either widen `isEnabled` to async or expose a sync cache peek.
- Consolidate `UsageRecord` into `@aptivo/types`.
- ML vs rule-based eval run against live Replicate (still blocked on vendor procurement).

## Provenance

- Gemini via `mcp__pal__clink` (routed to `gemini-3-flash-preview` — Pro still not reached).
- Codex MCP — **unavailable** (session expired; thread id not found). Same degradation pattern as LLM3-03 review.
- Lead verification: direct source read of the duck-typed probe + its caller; confirmed the per-request side effect.
- Post-fix: 161 llm-gateway tests + typecheck clean; no regressions in the 1,796 web tests.
