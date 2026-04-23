# Sprint 17 Task S17-B2 — Multi-Model Review

**Date**: 2026-04-23
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019db890-f7db-7f93-950c-25898ec0232a`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `277d631b-3773-4690-8f22-d6605e0ed83f`).
**Subject**: S17-B2 — `FeatureFlagService.peekEnabled` sync-cache. Pre-commit review of 4-file diff.
**Outcome**: Round 1 GO from both reviewers with two MEDIUM findings. Round 2 after applied fixes: **unconditional GO** from both.

---

## Executive Summary

S17-B2 closes Gate #4 from the S16 delivery review by giving the `FeatureFlagService` a synchronous `peekEnabled(key, defaultValue): boolean` API. The LLM gateway's safety-gate `isEnabled` callbacks are sync (`() => boolean`) but the existing `isEnabled()` is async — so S16 routed both `ml-injection-classifier` and `anomaly-blocking` through `process.env.*_ENABLED` env-var bypasses. B2 adds an in-process write-through cache, an explicit `warm()` for startup population, and a `peekEnabled` reader. Composition root binds the safety gates to the sync peek and removes the env-var bypass.

Both reviewers gave Round-1 GO with minor findings. Two MEDIUM concerns were applied as code changes (logger seam for warm failures, snapshot-replace cache eviction). Round-2 GO unconditional.

---

## Round 1 Findings

### Codex (GPT-5)

- **MEDIUM** — Silent `warm()` failure leaves Gate #4 effectively dead with no signal. `void service.warm()` swallows errors; if the provider breaks at startup, `peekEnabled` returns `defaultValue` forever with zero operational visibility. Recommended: logger seam or hookable `onWarmError`.
- **MEDIUM** — Cache entries are write-only and never evicted. Provider-side flag deletion leaves stale truthy entries forever. Generic `FeatureFlagProvider` contract permits removal; today's local/env providers don't, but the latent risk surfaces the moment a remote provider lands. Recommended: snapshot-replace semantics for `getAllFlags()` and `warm()`.
- **LOW** — Concurrent writers between `warm()` and `isEnabled()` are last-finisher-wins, not freshest-value-wins. Mostly theoretical for in-process providers; relevant for any future remote provider.
- **LOW** — Anomaly gate is no longer zero-startup-cost when disabled. `buildAnomalyGate()` now eagerly constructs `auditStore` and `detector` even when the flag is off. Acceptable, just weaker than the old `return undefined` short-circuit.

### Gemini (flash-preview)

- **LOW** — Same logger-seam recommendation as Codex's MEDIUM (Gemini scored it lower).
- **Confirmed positives**: stale-while-revalidate behaviour (verified by `peek.test.ts:74`); registry cleanliness (env-var refs scrubbed from `local-provider.ts`); test coverage of new behaviour.

Both gave initial GO; Codex framed it as "GO with two follow-ups I would queue immediately after merge." Lead chose to apply both before commit because they were cheap and addressed real footguns.

---

## Round 2 — Applied Resolutions

### 1. Logger seam — applied
Added optional `FeatureFlagLogger { warn(event, ctx) }` to `FeatureFlagServiceDeps`. `warm()` catch block now emits `'feature_flag_warm_failed'` with the cause message. Composition root in `apps/web/src/lib/services.ts` binds the existing safe-logger via the standard bridge pattern: `logger: { warn: (event, ctx) => appLog.warn(event, ctx) }`. New unit test asserts the logger fires when the provider rejects.

### 2. Snapshot-replace cache eviction — applied
New `replaceCacheSnapshot(cache, next)` helper. `warm()` and `getAllFlags()` now call it instead of write-only `set()` loops. The helper:
1. Computes the set of keys in the new snapshot.
2. Deletes any pre-existing cache key not in that set.
3. Writes every flag from the snapshot.

Single-key writes from `isEnabled` / `getVariant` are unchanged — a single-key lookup doesn't imply intent to delete other keys. New unit test seeds two flags, drops one in the provider, calls `warm()`, asserts the dropped flag's `peekEnabled` returns `defaultValue` (no stale truthy entry).

### LOW findings — deliberately left as-is

- **Last-finisher-wins races**: documented in JSDoc; left for the day a remote provider lands. Generation counters would be overengineering for the current synchronous in-process providers.
- **Always-built anomaly gate**: deliberate operational win — runtime-toggleable via `peekEnabled` without process restart. Per-request overhead is one function call + one `Map.get`.

---

## Round 2 GO Verdicts

### Codex
> The two material issues are resolved. `feature-flag-service.ts` now treats `getAllFlags()`/`warm()` as authoritative snapshots, so deleted flags no longer persist as stale truthy cache entries, and `services.ts` binds a logger so startup/provider failures are visible instead of silently pinning `peekEnabled()` to defaults. The remaining low-severity tradeoffs are documented and reasonable for the current in-process providers. The added tests in `peek.test.ts` cover the new behavior well enough for this task. **GO.**

### Gemini
> The implementation is now fully hardened. **Logger injection** resolves the silent-failure risk, and **snapshot-replacement** ensures cache consistency with the registry. Tests confirm 100% coverage of new signaling and eviction logic. **GO.**

---

## Final Diff Summary

5 files, +151/-31:

- `apps/web/src/lib/feature-flags/feature-flag-service.ts` (+91/-3) — new in-process `Map<string, FeatureFlag>` cache; `peekEnabled(key, defaultValue): boolean`; `warm(): Promise<void>` with logger-emitted error visibility; write-through on isEnabled/getVariant; snapshot-replace on getAllFlags + warm; new `FeatureFlagLogger` deps interface; exported `FeatureFlagService` type alias.
- `apps/web/src/lib/services.ts` (+18/-23) — `getFeatureFlagService` lazy getter binds safe-logger and fires `void service.warm()`; `buildInjectionClassifier` ML branch + `buildAnomalyGate` rebound to `peekEnabled`; old `KNOWN LIMITATION` comments deleted; `if (!envEnabled) return undefined` short-circuit in `buildAnomalyGate` removed (gate built unconditionally).
- `apps/web/src/lib/feature-flags/local-provider.ts` (+2/-2) — descriptions for `ml-injection-classifier` + `anomaly-blocking` updated; "S16 note: env var fallback" replaced with "Read by the gateway via FeatureFlagService.peekEnabled" + cold-cache semantics.
- `apps/web/tests/p1.5-02-llm-providers.test.ts` (+7) — added `createAnomalyDetector` to the `@aptivo/audit` mock (now imported even when gate is functionally off).
- `apps/web/tests/feature-flags/peek.test.ts` (new file, +33 in round 2) — 8 unit tests: cold→default, warm→sync, write-through from isEnabled, stale-while-revalidate, refresh propagation, rule-based targeting NOT applied, snapshot-replace eviction, logger fires on warm failure.

## Test Results
- llm-gateway: 181/181
- audit: 67/67
- apps/web: 1814/1814 (was 1806; +8 for new feature-flag tests, but `tests/feature-flags/peek.test.ts` carries 8 — net delta is +8 = 1814)
- All Sprint 9/10 typecheck residuals unchanged.

## Provenance

- **Codex via MCP thread `019db890-f7db-7f93-950c-25898ec0232a`** (GPT-5, sandbox read-only, approval-policy never). Round-1 delivered ~600-word structured review with 2 MEDIUM + 2 LOW findings and explicit AC/TDD coverage check. Round-2 GO at ~110 words.
- **Gemini via `mcp__pal__clink`** (continuation `277d631b-3773-4690-8f22-d6605e0ed83f`). Independently flagged the warm-failure visibility gap (Codex's MEDIUM #1). Round-2 GO.
- **Lead (Claude Opus 4.7)**: ran tests after every edit; verified env-var bypass removal via `rg ML_INJECTION_ENABLED|ANOMALY_BLOCKING_ENABLED apps/web/src/ packages/` (zero matches in source code; only inline doc references remain in the carry-forward comments and this multi-review doc).
