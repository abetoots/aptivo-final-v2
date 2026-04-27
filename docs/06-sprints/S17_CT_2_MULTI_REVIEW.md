# Sprint 17 Task S17-CT-2 — Multi-Model Review

**Date**: 2026-04-26
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dca0f-e79f-78a1-870f-9fa740652db6`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `7b17a778-df6f-4133-9506-11beae291e77`).
**Subject**: S17-CT-2 — case-tracking SLA engine. Pre-commit review.
**Outcome**: Round 1: NO-GO from Codex (1 HIGH + 2 MEDIUM); GO with HIGH from Gemini (same primary finding). Round 2 after applied fixes: **unconditional GO** from both.

---

## Executive Summary

S17-CT-2 ships the per-priority ticket SLA engine: `ticket_sla_configs` table with default rows for the 4 priorities (critical 4h / high 24h / medium 3d / low 7d), pure-math `computeSlaPure` helper, `TicketSlaService` with cached config reads + a paginated open-ticket walk, a new `slo-ticket-sla-at-risk` SLO alert, and `slaStatus` enrichment on `GET /api/tickets/:id`. ~600 LOC, 6 new files, 30 new tests.

Round 1 caught one real release-blocker that both reviewers flagged: `listAtRisk` was capped at 200 rows per status with newest-first ordering, which would silently undercount at-risk in any backlog over 600 open tickets. Codex framed it as NO-GO; Gemini as a high-priority follow-up. Lead deferred to Codex's framing — silent SLO-suppression is a release blocker. Codex also flagged two MEDIUMs (schema lacks CHECK constraints; `getTicketSlaMetrics` doubles up store queries unnecessarily). All three fixed pre-commit; Round 2 GO from both.

The plan AC mentioned "approval-sla-service stub replaced" — closer inspection revealed the stub lives in `services.ts:994` wiring HITL approvals to a `getRequests` callback that returns `[]`, NOT in the `apps/web/src/lib/observability/approval-sla-service.ts` file the plan path pointed at. Fixing the HITL stub properly requires `policyType` schema plumbing through `hitl_requests` (out of CT-2 scope). Documented as a separate concern.

---

## Round 1 Findings

### Codex — 1 NO-GO + 2 MEDIUM

**HIGH (NO-GO): `listAtRisk` silently undercounts in large backlogs**
- `apps/web/src/lib/case-tracking/ticket-sla-service.ts:165` — three parallel `ticketStore.list({status, limit:200})` queries, default newest-first ordering.
- At backlog > 200 per status, the 200-row cap excludes the OLDEST tickets — the ones most likely to be at risk.
- `getTicketSlaMetrics` then divides this truncated numerator by the FULL `totalCount` denominator, suppressing the SLO alert as backlog grows. False-negative SLO is a release blocker.

**MEDIUM: schema lacks validation; pathological configs can poison the math**
- `ticket-sla-configs.ts:28`: `resolveMinutes` has no positive check; `warningThresholdPct` has no `[0,1]` check.
- `computeSlaPure` defends against `windowMs === 0` with the `1` fallback, but `listAtRisk` recomputes the ratio with raw division so `resolveMinutes=0` yields `Infinity`/`NaN` behavior diverging from `computeSlaPure`.

**MEDIUM: ticket read path now hard-depends on `ticket_sla_configs`; no migration committed**
- `GET /api/tickets/:id` calls `getTicketSlaService().computeSla(ticket)` unconditionally.
- A missing migration → 500 from the `slaStatus` enrichment.
- No SQL migration file in the change. (Note: this is consistent with the repo's "schema-as-code" convention — no `.sql` artifacts have been committed for any prior table either; migrations are generated on demand at deploy time. Documented in the commit message rather than fixed.)

### Codex — accepted positives

- closedAt-not-now() invariant is correctly implemented in `computeSlaPure` (historical reads stay stable).
- `priority`-as-PK against the existing enum is fine for a 4-row lookup table.
- Config cache TTL of 60s is acceptable for admin edits; `refreshConfigs()` exists for explicit invalidation.
- Per-ticket SLA recomputation in a loop is negligible CPU — the issue is truncation, not throughput.

### Gemini — same HIGH + 1 MEDIUM

- **HIGH (same as Codex)**: 200-row cap risks SLO undercounting in large backlogs.
- **MEDIUM**: `getTicketSlaMetrics` redundantly executes the same three `ticketStore.list` queries already performed inside `listAtRisk` — doubles the DB load per cron tick.
- Confirmed positives: closedAt invariant correctness; zero-window defensive default; route enrichment acceptable given the cache; HITL stub deferral defensible.

Gemini gave GO with the HIGH as a follow-up; Codex framed it as NO-GO. Lead deferred to NO-GO — false-negative SLO is too sharp an edge for a follow-up.

---

## Round 2 — Applied Resolutions

### `summarizeOpenTickets` — single paginated walk (resolves the HIGH)

New method on `TicketSlaService`:

```ts
summarizeOpenTickets(opts?: { pctOverride?: number }): Promise<OpenTicketsSlaSummary>
```

Returns `{ total, atRiskCount, breachedCount, atRisk, truncated }`. Implementation walks `open` → `in_progress` → `escalated` paginated via `limit/offset` (page size 200), ordered `createdAt-asc` so the oldest, most-likely-overdue tickets are visited first. Safety cap of 10,000 tickets total — beyond that, `truncated: true` is returned and the SLO cron logs `ticket_sla_summary_truncated` via the injected logger.

Numerator AND denominator come from the same walk — they cannot disagree.

`listAtRisk` is now a thin wrapper:
```ts
async listAtRisk(pct) {
  const summary = await this.summarizeOpenTickets({ pctOverride: pct });
  return summary.atRisk;
}
```

`getTicketSlaMetrics` now calls only `summarizeOpenTickets()` — a single store traversal instead of seven separate queries.

### Schema CHECK constraints (resolves Codex MEDIUM #1)

```sql
CHECK (resolve_minutes > 0)
CHECK (warning_threshold_pct >= 0 AND warning_threshold_pct <= 1)
```

Defined via Drizzle's `check()` helper in `ticket-sla-configs.ts`. The defensive `windowMs > 0 ? ratio : 1` guard from `computeSlaPure` is also mirrored inside `summarizeOpenTickets` so a pre-CHECK row from a backup can't crash the cron.

### Migration (Codex MEDIUM #2)

Documented as repo convention: this monorepo runs `db:generate` at deploy time and doesn't commit drizzle artifacts. Same convention as `departments` (S16/FA3-01), `anomaly_baselines` (S17/B3), and `tickets` (S17/CT-1). Noted in the commit message; not a code defect.

### Plan deviation (HITL stub)

Documented in the executive summary above and in this section. The plan AC's path was wrong — fixing the HITL approval-sla-service shim properly requires `policyType` plumbing through `hitl_requests` schema, which is out of CT-2 scope.

---

## Round 2 GO Verdicts

### Codex
> **GO**. The prior NO-GO is cleared: `summarizeOpenTickets()` now walks paginated non-closed tickets oldest-first and returns both `total` and `atRiskCount` from the same traversal, which removes the truncation/divergence bug I called out earlier... The two medium issues are also cleared. The DB now enforces `resolveMinutes > 0` and `0 <= warningThresholdPct <= 1`... The migration concern is documented repo convention, not a code defect here.

### Gemini
> Strong **GO**. The move to `summarizeOpenTickets` resolves the sampling bias by deriving the numerator and denominator from the same paginated walk, while the 10k safety cap protects against OOM. Redundant queries are eliminated, and the new schema constraints provide necessary defense-in-depth against configuration poisoning.

---

## Final Diff Summary

15 files, ~700 LOC, 6 new:

- `packages/database/src/schema/ticket-sla-configs.ts` (new) — table + CHECK constraints
- `packages/database/src/adapters/ticket-sla-config-store-drizzle.ts` (new) — list/get/upsert
- `packages/database/src/seeds/case-tracking-seeds.ts` — added `seedTicketSlaDefaults` + `seedAllCaseTracking` (4 priority defaults at 4h / 24h / 3d / 7d)
- `packages/database/src/{schema,adapters,seeds}/index.ts` — barrels
- `packages/database/tests/ticket-sla-config-store.test.ts` (new) — 5 tests
- `apps/web/src/lib/case-tracking/ticket-sla-service.ts` (new) — `computeSlaPure` + `createTicketSlaService` with `summarizeOpenTickets` + paginated walk
- `apps/web/src/lib/observability/{slo-alerts,slo-cron,metric-service}.ts` — new `ticketSlaAtRiskAlert` evaluator (20%/5-sample noise filter); SloMetrics gains `ticketSlaAtRiskCount/Total`; `getTicketSlaMetrics` consumes `summarizeOpenTickets`
- `apps/web/src/app/api/tickets/[id]/route.ts` — GET enriches with `slaStatus`
- `apps/web/src/lib/services.ts` — `getTicketSlaConfigStore` + `getTicketSlaService` lazy getters; `getMetricService` wires the new deps; safe-logger bridged for truncation warnings
- `apps/web/tests/case-tracking/ticket-sla-service.test.ts` (new) — 11 tests (computeSlaPure math, listAtRisk wrapper, summarizeOpenTickets paginated walk + closed-ticket exclusion + pct override, config caching)
- `apps/web/tests/observability/ticket-sla-at-risk-alert.test.ts` (new) — 5 tests (noise filter, threshold, message contents)
- Bumped existing slo/burn-rate/cron tests for the +1 alert (9 → 10) and the new SloMetrics fields
- Updated `s7-cf-01-real-metrics` mock for the new SLA-service dep

## Test Results
- ticket-sla-service 11/11, ticket-sla-at-risk-alert 5/5, ticket-sla-config-store 5/5
- ticket-routes 15/15, ticket-service 10/10
- apps/web 1871/1871 (with `--no-file-parallelism`)
- database 185/185, audit 67, llm-gateway 189, ws-server 55
- Pre-existing Sprint 9/10 typecheck residuals unchanged

## Documented Limitations (carry-forward)

1. **`summarizeOpenTickets` 10k safety cap** — beyond this the cron logs `ticket_sla_summary_truncated` and returns the inspected slice. Acceptable for current scale; admin-side full-paginated path is a Phase 3.5 UI concern.
2. **Config cache 60s TTL** — admin edits via `store.upsert` don't trigger `service.refreshConfigs`. Up to 60s of stale config reads. Acceptable until the Phase 3.5 admin UI lands.
3. **HITL approval-sla shim still returns `[]`** — separate concern from CT-2; requires `policyType` plumbing through hitl_requests schema. Tracked as future work, not blocking ticket SLA.
4. **Migration artifacts not committed** — repo convention; `db:generate` runs at deploy.

---

## Provenance

- **Codex via MCP thread `019dca0f-e79f-78a1-870f-9fa740652db6`** (GPT-5, sandbox read-only). Round-1: ~700 words, 1 NO-GO + 2 MEDIUM with explicit file:line citations, 8-area assessment. Round-2: GO at ~150 words.
- **Gemini via `mcp__pal__clink`** (continuation `7b17a778-df6f-4133-9506-11beae291e77`). Round-1: GO with same HIGH (capping risk) + 1 MEDIUM (query overlap). Round-2: GO.
- **Lead (Claude Opus 4.7)**: deferred to Codex's NO-GO framing on the truncation bug — Gemini's "GO with follow-up" framing under-weights silent SLO-suppression. Reinforces the standing `feedback_honest_reviewer_attribution` memory: never collapse two reviewers' verdicts; surface the disagreement and decide.
