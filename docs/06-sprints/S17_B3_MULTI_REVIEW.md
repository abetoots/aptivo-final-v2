# Sprint 17 Task S17-B3 — Multi-Model Review

**Date**: 2026-04-23
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dba5d-0ce8-7c41-94ae-6caa97e25c5e`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `bd99214e-acb6-4a16-9ecb-0483f924212a`).
**Subject**: S17-B3 — real anomaly baseline job. Pre-commit review of 12-file diff (+545/-11, 6 new).
**Outcome**: Round 1: GO from both with one shared MEDIUM finding (scope-key drift risk). Codex framed it as NO-GO without the centralization fix. Round 2 after applied fix: **unconditional GO** from both.

---

## Executive Summary

S17-B3 closes Sprint-16 enablement gate #5 by replacing the placeholder constant baseline (`{mean:10, stdDev:3, sampleSize:100}`) used by the LLM3-04 anomaly gate with a real historical baseline computed from `audit_logs`. New `anomaly_baselines` table populated by a 6h Inngest cron that buckets the trailing 7 days into 10-minute windows and computes per-(actor, scope) `AVG` + `STDDEV_SAMP` + sample size. The detector consumes the baseline via a Drizzle store; cold-start `(actor, scope)` pairs return `null`, which the existing `if (sampleSize < minBaselineSamples)` branch handles as "insufficient baseline data" — preserving the documented fail-open posture.

Both reviewers gave Round-1 GO with one shared concern: the scope key (`resourceTypes.join(',')`) was duplicated in `audit-store-drizzle.aggregateAccessPattern` AND `services.ts:getAnomalyBaselineScopes`. Any future normalization drift on one side without the other would silently fail open — gate looks up a baseline keyed under a different string, gets `null`, and never fires. Codex was emphatic this was a NO-GO without centralization.

Applied as Round-2 fix: extracted `formatAnomalyScopeKey(resourceTypes)` to `@aptivo/audit`, both callsites converted, drift-prevention test added. Round-2 GO from both, unconditional.

---

## Round 1 Findings

### Both reviewers (shared MEDIUM)

- **Scope-key fragility**: the implicit contract that audit-store and services.ts produce the same scope key via `.join(',')` is brittle. Sorting, separator change, lowercasing, or any normalization on one side would break the lookup with no compile error and no runtime exception. The detector would silently return `insufficient baseline data` forever.

### Codex extras

- **MEDIUM**: confirmed the SQL parameterization is safe (`lookbackInterval` interpolated through Drizzle's `sql\`...\`` template tag becomes a `$N` placeholder, not a string concat), but flagged that the fragility above renders the baseline functionally inert if drift occurs.

### Gemini extras

- **LOW**: per-scope error isolation aborts the rest of a scope's upserts when a single SQL/upsert call fails. Acceptable now (next 6h run retries); flagged for re-evaluation if user count per scope grows significantly.
- **POSITIVE**: pure SQL aggregation in `computeScopeBaselines` is testable independently of the cron; numeric column coercion handled correctly; idempotent upserts make multi-instance safe.

Both confirmed: SQL bucketing math is correct, `STDDEV_SAMP` + `COALESCE(...,0)` handles single-bucket actors, the 6h cadence is defensible against the 7-day window, all 7 ACs + 8 TDD micro-tasks satisfied.

---

## Round 2 — Applied Resolution

### Centralized scope-key formatter
New module `packages/audit/src/anomaly/scope-key.ts` exporting one function:

```ts
export function formatAnomalyScopeKey(resourceTypes: readonly string[]): string {
  return resourceTypes.join(',');
}
```

Re-exported from `@aptivo/audit` package root.

**Both callsites converted:**
- `packages/database/src/adapters/audit-store-drizzle.ts:163-167` — `aggregateAccessPattern` now sets `AccessPattern.resourceType: formatAnomalyScopeKey(params.resourceTypes)` (was inlined `.join(',')`).
- `apps/web/src/lib/services.ts:894-901` — `getAnomalyBaselineScopes` builds `scope.key: formatAnomalyScopeKey(scope.resourceTypes)` (was inlined `.join(',')`).

Any future change to scope-key semantics now lands in one file.

**Drift-prevention test** added in `apps/web/tests/jobs/anomaly-baseline-builder.test.ts` asserting both sources produce character-for-character identical output for the same input.

### LOW findings — accepted as-is

- **Per-scope error isolation**: kept at scope-level. Next 6h run retries any failed scope; upgrading to per-actor isolation would obscure the more useful "this scope's query is broken" signal in operational logs. Re-evaluable if actor count scales.

---

## Round 2 GO Verdicts

### Codex
> The centralization fix resolves the silent-fail-open risk. Both callsites now go through one formatter that returns the same string by construction, and the drift-prevention test would catch any future divergence in CI. Combined with the SQL correctness (already verified) and the cold-start fail-open path (preserved), this is now a complete closure of Gate #5. **GO.**

### Gemini
> The centralized `formatAnomalyScopeKey` in `@aptivo/audit` successfully addresses the key-drift risk identified in review. Both `audit-store-drizzle` and `services.ts` now rely on a single source of truth, and the added drift-prevention test ensures character-for-character alignment. With SQL correctness, fail-open semantics, and error isolation already verified, the implementation is robust and follows the S17 plan precisely. **GO.**

---

## Final Diff Summary

12 files, +545/-11, 6 new:

- `packages/audit/src/anomaly/scope-key.ts` (new) — centralized formatter
- `packages/audit/src/index.ts` — re-export
- `packages/database/src/schema/anomaly-baselines.ts` (new) — table with unique index on `(actor_id, resource_type)` + `computed_at` index
- `packages/database/src/schema/index.ts` — barrel
- `packages/database/src/adapters/anomaly-baseline-store-drizzle.ts` (new) — `findBaseline`, `upsertBaseline` (`.onConflictDoUpdate`), `latestComputedAt`
- `packages/database/src/adapters/audit-store-drizzle.ts` — uses `formatAnomalyScopeKey`
- `packages/database/src/adapters/index.ts` — barrel
- `packages/database/tests/anomaly-baseline-store.test.ts` (new) — 4 tests
- `apps/web/src/lib/jobs/anomaly-baseline-builder.ts` (new) — `computeScopeBaselines`, `runAnomalyBaselineBuilder`, `createAnomalyBaselineBuilder`
- `apps/web/src/lib/services.ts` — replaced placeholder; new lazy getter; `getAnomalyBaselineScopes` uses centralized formatter
- `apps/web/src/app/api/inngest/route.ts` — registers cron
- `apps/web/tests/jobs/anomaly-baseline-builder.test.ts` (new) — 6 tests including drift-prevention
- `apps/web/tests/p1.5-02-llm-providers.test.ts` — adapter mock extended

## Test Results
- audit 67/67
- database 174/174 (+4 store)
- apps/web 1826/1826 (+6 builder, +1 drift-prevention)
- llm-gateway 188/188

Pre-existing Sprint 9/10 typecheck residuals unchanged.

---

## Provenance

- **Codex via MCP thread `019dba5d-0ce8-7c41-94ae-6caa97e25c5e`** (GPT-5, sandbox read-only, approval-policy never). Round 1: ~700 words with 1 shared MEDIUM (key drift, framed as NO-GO blocker), 1 confirmation (SQL injection safety). Round 2: GO at ~120 words.
- **Gemini via `mcp__pal__clink`** (continuation `bd99214e-acb6-4a16-9ecb-0483f924212a`). Round 1: independently flagged the same scope-key drift risk; framed as MEDIUM with explicit "centralise" recommendation. Round 2: GO unconditional.
- **Lead (Claude Opus 4.7)**: ran tests after each edit; verified the formatter is the only producer of scope keys via `rg "join\(','\)" packages/database/src/adapters/audit-store-drizzle.ts apps/web/src/lib/services.ts` (zero matches after the centralization).
