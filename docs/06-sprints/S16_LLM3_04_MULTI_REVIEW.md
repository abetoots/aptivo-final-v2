# LLM3-04 Pre-Commit Review — Multi-Model

**Date**: 2026-04-21
**Reviewers**: Claude Opus 4.7 (Lead), Gemini via PAL clink (`gemini-3-flash-preview`), Codex MCP (GPT-5, fresh session `019dadd1-6dec-7ac1-a57f-8408bf49916f`).
**Subject**: LLM3-04 anomaly gate + audit-store aggregate + gateway integration prior to commit

---

## Executive Summary

Gemini judged the implementation safe-to-merge ("no immediate code changes required"). **Codex found a real correctness bug** that Gemini missed: the audit aggregate query is keyed differently from the audit rows it's supposed to consume, so the gate will query an empty set once it's wired in S17. Codex also flagged test fixtures that use impossible z/score pairings (tests pass, but don't validate the real detector→gate coupling). Lead-verified both findings against the source; both are correct.

Gate is dormant in S16 (`resolveActor: () => undefined`), so the key-alignment bug has no runtime effect today. Fixing now prevents a silent failure when S17 wires the actor. Tests can be fixed unconditionally.

---

## Consensus Findings

1. **Threshold math is conservative but consistent** — defaults `throttleAt=0.7`, `blockAt=0.9` with detector normalization `score = z / 6` (deviationThreshold=3) map to real trigger z-scores of **~4.2 (throttle)** and **~5.4 (block)**. Stricter than the detector's own anomaly threshold (`z >= 3.0`), so many "anomalies" still pass the gate — acceptable for an automated blocking system where precision matters more than recall.
2. **Fail-open scope is broad but deliberate** — cold-start, detector error, aggregate-fetch error all pass. No domain-specific fail-closed path. Matches the plan's AD.
3. **Pipeline ordering (injection → anomaly → content filter) is correct** — pattern-matching attacks fire first (cheap, deterministic); anomaly gates volume-based attacks before expensive filter work.
4. **Placeholder baseline is a ticking bomb if operator flips the flag** — both reviewers flagged the risk. In S16 it's doubly guarded (env var off + `resolveActor` returns undefined), so the concrete risk is negligible today; must be called out loudly for S17.
5. **SQL is parameterised safely** via Drizzle's `sql\`\`\`` tagged templates. No injection risk.
6. **`AuditStore` interface widening was covered** — the one manual mock in `aud-02-write-path.test.ts` was updated; no other mock stores found.

## Critical Finding (Codex) — Aggregate Key Mismatch

**Claim**: Gateway passes `request.domain` (values: `'crypto' | 'hr' | 'core'`) as `resourceType` to `aggregateAccessPattern`; the adapter filters `audit_logs.resource_type = :resourceType AND action = :action` with action defaulting to `'read'`. But the PII audit middleware emits rows with:
- `action`: `'pii.read'`, `'pii.read.bulk'`, `'pii.read.export'`
- `resource.type`: `'candidate'`, `'employee'`, `'contract'`, etc.

So the query looks for rows like `resource_type='crypto' AND action='read'` while the real audit trail stores `resource_type='candidate' AND action='pii.read.bulk'`. The aggregate will always return 0 → detector sees zero-count → anomaly path is never triggered.

**Lead-verified** against:
- `packages/audit/src/middleware/pii-read-audit.ts:74,96,119` — real action strings
- `packages/llm-gateway/src/gateway/llm-gateway.ts` — passes `request.domain` as resourceType
- `packages/database/src/adapters/audit-store-drizzle.ts` — filters `action = :action` with default `'read'`

**Severity**: latent correctness bug. Silent when dormant (S16); becomes a defect the moment S17 wires `resolveActor`. Defense appears to work but never fires.

**Fix applied pre-commit**:
1. Widen `aggregateAccessPattern` to accept `actions?: string[]` (array). When omitted, matches **any** action — conservative "all reads by this actor on this resource_type" semantic. When provided, filters `action IN (...)`.
2. Drizzle adapter builds an `IN` clause when actions are given; drops the action filter when omitted.
3. Document the key-alignment question prominently in `services.ts`: S16 uses `request.domain` as resourceType, which **does not match** real audit rows. S17 must decide the correct key semantics alongside `resolveActor` wiring. Flagged as a blocker for S17 enablement.
4. Add S17 preview in `sprint-16-plan.md`: "Align anomaly-gate aggregate query with real audit-event schema" as a prerequisite to enabling the flag.

## Codex Test-Quality Findings

1. **Impossible fixture z/score pairs**: tests use `score: 0.95, reason: 'z=5.2'` but real detector maps z=5.2 → score=0.867. Tests validate the gate's own threshold math but disconnect from the detector's actual output.
   - **Fix**: updated test fixtures to use real detector math (`score = z / 6`). Reason strings now reflect realistic z-scores for each action bucket.
2. **No test for `getAccessPattern` throwing** — the catch/fail-open branch has no coverage.
   - **Fix**: added a test where `getAccessPattern` throws and asserts `{ action: 'pass' }` + `logger.warn('anomaly_gate_error', ...)`.
3. **No adapter test for `aggregateAccessPattern`** — new Drizzle method uncovered.
   - **Deferred**: the existing `int-w1-audit-adapters.test.ts` uses a real pg connection and is outside the scope of a pre-commit fix. Tracked as S17 pre-enablement task alongside the aggregate-key alignment work.
4. **No integration test asserting step ordering** (injection → anomaly → content filter).
   - **Fix**: added a test that wires an injection-blocker + anomaly-blocker simultaneously and asserts `PromptInjectionBlocked` wins (injection ran first).

## Debated / Deferred

### D1: Should `resolveActor: undefined` skip the gate, or evaluate conservatively?

| Reviewer | Position |
|---|---|
| Gemini | "Skip — correct secure-but-available choice for S16." |
| Codex | "Don't evaluate conservatively — would collapse unrelated traffic into one bucket and create noisy blocks." |
| Lead | Agree with both: skip. |

**Verdict**: no change.

### D2: Should HR/crypto fail closed on infra errors?

Both reviewers note the fail-open scope is broad. No concrete proposal for fail-closed semantics on sensitive domains. Deferred — if domain-specific fail-closed is needed, it's an S17+ policy call, not a code bug in S16.

## Actionable Recommendations (applied pre-commit)

1. ✅ **Widen `aggregateAccessPattern` to accept `actions?: string[]`** — unblocks S17 from hard-coding a single action value.
2. ✅ **Fix test fixtures to use real detector math** (`score = z / 6`).
3. ✅ **Add missing test: `getAccessPattern` throws → fail-open + logger.warn**.
4. ✅ **Add missing test: pipeline ordering (injection before anomaly)**.
5. ✅ **Document the aggregate-key-alignment blocker prominently** in `services.ts` + S17 preview in the sprint plan.
6. ⏳ **Deferred to S17**: integration test for `aggregateAccessPattern` against the real Drizzle adapter (requires test DB infra; part of S17 actor-wiring work).
7. ⏳ **Deferred to S17**: proper feature-flag wiring for `anomaly-blocking` (same as LLM3-02 env-var tradeoff).
8. ⏳ **Deferred to S17**: real historical baseline job (replaces the placeholder constant).

## Provenance

- Gemini via `mcp__pal__clink` (routed to `gemini-3-flash-preview`).
- Codex via MCP thread `019dadd1-6dec-7ac1-a57f-8408bf49916f` (back online after the auth refresh).
- Lead verification: direct source read of `pii-read-audit.ts` confirmed Codex's action/resource-type claim.
