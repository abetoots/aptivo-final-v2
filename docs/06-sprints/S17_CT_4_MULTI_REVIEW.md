# Sprint 17 Task S17-CT-4 — Multi-Model Review

**Date**: 2026-04-28
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dd1df-7613-79d3-8993-bcb4d454c0d9`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `79fba18c-7abd-4081-9224-e428070c39c0`).
**Subject**: S17-CT-4 — case-tracking reporting (`GET /api/tickets/reports`). Pre-commit review.
**Outcome**: 3 rounds of Codex review (NO-GO → NO-GO → GO). Gemini independent round-1 GO. Final state — both reviewers GO. Closes Sprint 17.

---

## Executive Summary

S17-CT-4 ships the admin-facing case-tracking reporting endpoint. `GET /api/tickets/reports?range=Nd` returns three sub-reports keyed by ticket priority over a 1-365 day window:

- `openByPriority` — current snapshot of tickets in `open` / `in_progress` / `escalated` (NOT windowed; live "what's on the board" view)
- `resolution` — average minutes from `createdAt` → `closedAt` for tickets closed within the window
- `slaCompliance` — fraction of closed tickets whose `closedAt - createdAt` ≤ the priority's configured `resolveMinutes`

~520 LOC + 22 new tests. RBAC `platform/tickets.read`. Read-only — no audit emission, no rate-limit (admin reads are cheap aggregations).

**Plan deviation**: the plan AC said to add the new query methods to `apps/web/src/lib/observability/metric-service.ts:13-79`. We deviated — that file is the SLO cron's metric provider for 5-minute alert windows; admin dashboard analytics over 30/90 day ranges have different semantics (richer per-priority shape, pull SLA configs as the threshold lookup, no SLO cron consumer). New `TicketReportService` lives sibling to `ticket-sla-service.ts` with its own DB queries adapter. Both reviewers explicitly endorsed the split.

Codex took **three rounds** to GO. The original implementation had one HIGH and a string of cascading correctness issues that surfaced as each fix exposed the next. The full chain is captured below — each round's NO-GO finding became the next round's regression test.

---

## Round 1 Findings

### Codex — NO-GO (1 HIGH + 1 MEDIUM + 2 LOW)

**HIGH (NO-GO #1): Silent denominator loss in `slaCompliance`**

Closures of priorities WITHOUT an SLA config row (e.g., `low` if its config row was missing) silently disappeared from `slaCompliance.totalClosed` entirely — the service only built compliance entries from priorities that returned compliance rows, which only included priorities the caller passed thresholds for. Net effect: the rate looked better than reality. The empty-config test even locked this behavior in.

> "For admin reporting, silently dropping denominator rows is a correctness bug." — Codex round 1

**MEDIUM (NO-GO #2): Test clock injection didn't reach SQL**

The service computed `windowStart`/`windowEnd` from injected `now()`, but the adapter recomputed `cutoff = new Date(Date.now() - windowMs)` from ambient time. Boundary tickets could be included/excluded differently from the advertised window; tests pinning the clock had no effect on SQL.

**LOW: Route docs claimed "clamped" but code rejects**
The route header + OpenAPI parameter description said "clamped to [1, 365]" but the implementation returned 400 for out-of-range values. Doc drift.

**LOW: Negative durations counted as SLA-compliant**
`extract(epoch from (closed_at - created_at)) <= seconds` accepts `closed_at < created_at` (clock skew, imported data). Drag-down on `avg_minutes`; false-compliance contribution.

### Codex — accepted positives (round 1)

- Plan deviation defensible (`metric-service.ts` is wrong fit)
- 4 parallel per-priority queries acceptable (not premature optimization candidate)
- `openByPriority` not windowed is honest given the docs
- SLA config caching not needed at this layer (admin-triggered reads)
- No-audit-no-rate-limit justified (read-only analytics)
- `compliancePct: null` on empty is the right shape

---

## Round 2 — Round-1 fixes + new MEDIUM

### Round-2 fixes

**Fix 1 (HIGH)**: New `evaluatedClosed` field; `totalClosed` sourced from `resolutionByPriority` to cover all priorities; `unconfiguredPriorities` array surfaces the gap; per-priority `compliancePct: null` when no config; overall rate computed only over evaluated subset (consistent population).

**Fix 2 (MEDIUM)**: Adapter signature changed from `windowMs: number` to `cutoff: Date`. Service computes the cutoff from injected `now()` and passes the same Date to both adapter calls.

**Fix 3 (LOW)**: Route header + OpenAPI parameter description rewritten to say "rejects with 400 problem+json (NOT silently clamped)".

**Fix 4 (LOW)**: Both queries gained `WHERE ${tickets.closedAt} >= ${tickets.createdAt}`.

**Bonus**: OpenAPI byPriority schemas tightened from `additionalProperties` → explicit `required: [critical, high, medium, low]` + per-priority refs. New `TicketPriority` schema.

### Codex round-2 — NEW MEDIUM (regression in my fix)

> "`slaCompliance` can now produce impossible rates (`withinSlaCount > evaluatedClosed`, `compliancePct > 1`) under normal read-committed races. The denominator for configured priorities now comes from `resolutionByPriority`, while the numerator comes from the separate `slaComplianceByPriority` query. Those source queries are issued independently in `Promise.all`. Under Postgres `READ COMMITTED`, each statement gets its own snapshot, so a ticket closed between the resolution query and the compliance query can increment `withinSlaCount` without incrementing `evaluatedClosed`."

This was a real regression I introduced. The HIGH was fixed but I'd traded it for a different correctness bug — under heavy churn, `compliancePct` could exceed 1, contradicting both the OpenAPI `maximum: 1` and the metric semantics.

Codex offered two fix options. I picked option 2: source `evaluatedClosed` from the compliance query itself (paired with numerator), not from resolution.

---

## Round 3 — Race fix + final LOWs

### Round-3 fixes

**Fix 5 (NEW MEDIUM)**: `slaComplianceByPriority` adapter now ALWAYS returns all four priorities (one per-priority parallel aggregation each). For unconfigured priorities, `withinSlaCount: null` (cast as `null::int` in SQL) — distinguishes "no config" from "0 met SLA". `PriorityComplianceRow.withinSlaCount: number | null`. `summarizeCompliance` no longer takes `resolution` or `configuredPriorities` — it derives everything from compliance rows alone:

- Per-priority `totalClosed` and `withinSlaCount` come from the SAME SQL row → paired in one snapshot → READ COMMITTED race cannot push numerator above denominator.
- Top-level `withinSlaCount` and `evaluatedClosed` are sums over consistent per-priority pairs → top-level rate stays in `[0, 1]`.
- Resolution data is now used ONLY for the `resolution` sub-report (avg minutes). Resolution and compliance can disagree slightly under heavy churn on the all-priority `totalClosed` view — that's a freshness gap, not a correctness gap.

**Fix 6 (LOW)**: Route test fixture rebuilt to mirror the real shape (all four priority keys, `evaluatedClosed`, `unconfiguredPriorities`).

**Fix 7 (LOW)**: OpenAPI route description still said "clamped" in one spot — fixed.

New regression test: `compliancePct stays in [0, 1] — paired numerator/denominator from the same row`.

### Codex round-3 — GO

> "The race-correctness issue is cleared. `slaCompliance` now derives per-priority numerator and denominator from the same SQL row, so the rate cannot exceed `1` under `READ COMMITTED`. The implementation and tests line up on that. The two prior LOWs are also fixed: the route test now matches the real payload shape, and the OpenAPI/route contract no longer claims silent clamping. The previous HIGH and both MEDIUM findings are closed."

One residual LOW: a wording bug in the OpenAPI route description ("out-of-range values in [1, 365] are rejected" — should be "outside [1, 365]"). Fixed before commit.

---

## Gemini Round 1 — Independent Verification

After Codex GO, sent Gemini the full diff cold (no priming with Codex's findings list — just an independent critical re-read).

**Verdict: GO**

Confirmed:
- Single-snapshot compliance integrity (paired numerator/denominator within `FILTER` clause)
- Cutoff propagation from injected `now()` correctly reaches SQL
- 4 parallel per-priority queries are acceptable (static dimension, low frequency)
- `withinSlaCount: number | null` ergonomic for the adapter→service contract
- Computing rate over evaluated subset only is the most defensible dashboard semantics
- OpenAPI fidelity, RFC 7807 compliance, rounding consistency all good

Two LOW findings:
- **LOW: Idiomatic Drizzle in `openByPriority`** — `sql.raw('ARRAY[...]')` works but Drizzle's `inArray` is cleaner. Applied as a final cleanup before commit.
- **LOW: Defensive clamping redundancy** — service `Math.floor` + clamp duplicates the route's range validation. Acknowledged as defense-in-depth (direct service callers from Inngest/cron should hit the same bounds).

**Reviewer-calibration note**: Gemini's review was substantive and engaged with the race semantics in depth — different from the S17-CT-1/CT-3 pattern where Gemini gave surface-only GOs. Possible reasons: (a) round-3 prompt explicitly framed the race-condition concern, giving Gemini a specific thing to verify, (b) the code as shipped to Gemini was already through 3 rounds of fixes so there were fewer landmines, or (c) actual variance in review depth across tasks. Worth keeping the same structured-prompt approach in S18.

---

## Final Diff Summary

8 files, ~520 LOC + 22 new tests:

- `packages/database/src/adapters/ticket-report-queries.ts` (new) — 3 Drizzle aggregations: `openByPriority`, `resolutionByPriority(cutoff)`, `slaComplianceByPriority(cutoff, thresholds)`. All return all four priorities; compliance row pairs `totalClosed` + `withinSlaCount` in one SQL snapshot.
- `packages/database/src/adapters/index.ts` — barrel export for the new queries factory + types
- `apps/web/src/lib/case-tracking/ticket-report-service.ts` (new) — `TicketReportService.getReport({ windowDays })`. Pulls SLA configs as threshold lookup; orchestrates the 3 parallel queries; rate computed over `evaluatedClosed` (configured priorities only); `unconfiguredPriorities` surfaces the config gap.
- `apps/web/src/app/api/tickets/reports/route.ts` (new) — GET with `?range=Nd`/`?range=N`, RBAC `platform/tickets.read`, RFC 7807 problem+json on input validation; out-of-range rejected (NOT clamped) so callers can detect they sent something wrong.
- `apps/web/src/lib/services.ts` — `getTicketReportQueries` + `getTicketReportService` lazy getters
- `apps/web/openapi.yaml` — 1.2.2 → 1.2.3; new path; `TicketReport` + 4 sub-schemas (`TicketReportPriorityCounts`, `TicketReportResolutionByPriority`, `TicketReportComplianceByPriority`, `TicketPriority`); explicit per-priority required keys
- `apps/web/tests/case-tracking/ticket-report-service.test.ts` (new) — 15 tests including the post-Codex regression coverage (partial-config closures, paired numerator/denominator, clock injection)
- `apps/web/tests/case-tracking/ticket-reports-route.test.ts` (new) — 7 tests including the full-shape success envelope assertion

## Test Results
- ticket-report-service 15/15, ticket-reports-route 7/7
- apps/web full sweep 1924/1924 pass
- Pre-existing Sprint 9/10/15 typecheck residuals unchanged
- CT-4-touched files: 0 typecheck errors (database + web)

## Documented Limitations / Carry-forward

1. **Resolution vs compliance freshness gap** — they're separate aggregates issued in `Promise.all`; under heavy churn, the all-priority `slaCompliance.totalClosed` (from compliance rows) could differ slightly from the sum of `resolution.byPriority[*].totalClosed`. Documented inline. Not a correctness bug; for stricter snapshot semantics, future work could wrap the report in a single read-only repeatable-read transaction.
2. **No SLA config caching at the report-service layer** — the CT-2 SLA service caches configs for 60s; this service pulls fresh on every report call. Acceptable for admin-triggered reads (low frequency); future iteration could share the cache.
3. **No safety cap or max-rows** — these are pure aggregation queries (no row materialization to JS). For pathological backlogs (10M+ closures) the query layer might want windowing. Not in scope for S17.
4. **`unconfiguredPriorities` only lists priorities that contributed closures** — a configured priority with zero closures + an unconfigured priority with zero closures both look the same (absent from the array). By design — the array is for "you have a real gap to fill", not "audit your config table".
5. **Migration artifacts not committed** — repo convention; `db:generate` runs at deploy.

---

## Provenance

- **Codex via MCP thread `019dd1df-7613-79d3-8993-bcb4d454c0d9`** (GPT-5, sandbox read-only). Three rounds:
  - Round 1: 1 HIGH (NO-GO) + 1 MEDIUM + 2 LOW with explicit code citations
  - Round 2: GO on round-1 findings, but new MEDIUM caught (race introduced by my fix to round 1)
  - Round 3: GO with one residual wording-LOW (fixed before commit)
- **Gemini via `mcp__pal__clink`** (continuation `79fba18c-7abd-4081-9224-e428070c39c0`, `gemini-3-flash-preview`). Single round after Codex GO: independent re-read with detailed engagement; GO with 2 LOWs (one applied as cleanup, one acknowledged as defense-in-depth).
- **Lead (Claude Opus 4.7)**: deferred to Codex's NO-GO framing on rounds 1 and 2; did not skip the freshness/race re-check between rounds. Each Codex finding generated a regression test that's now in the suite. Reinforces the standing `feedback_honest_reviewer_attribution` memory and `feedback_multi_model_sign_off` workflow preference.
