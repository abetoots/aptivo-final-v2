# Sprint 17 Plan — Safety Enablement + Case Tracking

**Sprint duration**: 6 days
**Total Story Points**: 23 SP (9 tasks) — revised from Phase-3 roadmap's original 10 SP (Epic 4 only) after absorbing the 5 S16 enablement gates that were explicitly punted to S17; re-verified across two multi-model review rounds (see `S17_PLAN_MULTI_REVIEW.md`).
**Tracks**: Senior 8 SP (all Epic 2 gate work) / Web Dev 1 8 SP (Epic 4 Case Tracking API) / Web Dev 2 7 SP (baseline job + escalation + Epic 3 publisher)
**Prev sprint**: S16 (`sprint-16-plan.md`, `sprint-16-delivery-review.md`) — shipped Epic 2/3/8 as API-complete; 6 enablement gates carry forward
**Next sprint**: S18 — Epic 5 Domain Workflows (Crypto live-trading + HR onboarding + MOD-02) once the safety pipeline is flipped and observed
**Contingency**: S19 buffer remains untouched

---

## 1. Sprint Goal

Clear the 5 Epic-2 production enablement gates plus the 1 Epic-3 gate from `sprint-16-delivery-review.md §6`, and deliver Epic 4 Case Tracking as a reusable-primitives API. Every gate gets an explicit acceptance criterion below; none slips to S18.

Sprint 16 shipped `API-complete` work but deliberately held production flag flips for `ml-injection-classifier`, `anomaly-blocking`, and `ws-server-enabled` behind five Epic-2 gates (request→actor plumbing, aggregate-key alignment, FeatureFlagService sync-peek, real anomaly baseline job, timeout alert) and one Epic-3 gate (Inngest → Redis publisher). S17 picks those up as a cohesive stream on the Senior track while WD1 builds Case Tracking and WD2 balances the baseline job + escalation + publisher.

Epic 5 Domain Workflows is **explicitly deferred to S18**. Crypto live-trading depends on Epic 2 being production-enabled AND observed; flipping safety flags mid-sprint and having a new domain consume them in the same sprint is not defensible. S18 inherits a staging-stable Epic 2 and can commit Crypto + HR + MOD-02 (~12 SP) alongside FA3-02 (~3 SP) and any tech-debt bundle (~3 SP) for a realistic 18-23 SP total.

---

## 2. Sprint 17 Baseline (What Exists After S16)

| Component | Current state (end of S16) | S17 target |
|---|---|---|
| LLM gateway actor resolution | `resolveActor: () => undefined` in `apps/web/src/lib/services.ts:641-646`; `CompletionRequest` has no user context (`packages/llm-gateway/src/providers/types.ts:63-74`) | Widen `CompletionRequest` with optional `actor`; `GatewayDeps.resolveActor` bound to JWT-derived helper |
| `llm_usage_logs.departmentId` | Column exists with FK to `departments.id` (`packages/database/src/schema/llm-usage.ts:47-57`) but `UsageLogger` never populates it | Thread `departmentId` through `UsageLogger` (`packages/llm-gateway/src/usage/usage-logger.ts:15-35,69-83`) + Drizzle adapter (`packages/database/src/adapters/llm-usage-log-store-drizzle.ts:25-42,52-69`) |
| Anomaly gate aggregate-key | Gateway binding in `services.ts:753-770` passes `request.domain` as `resourceType`; audit rows use `resource_type` like `'candidate'`/`'employee'` with actions like `'pii.read.bulk'` → silent zero-count | Per-domain action whitelist via `aggregateAccessPattern.actions` (parameter widened in S16) or resource-specific keys; decision documented in PR |
| Anomaly baseline | Placeholder constant `{mean:10, stdDev:3, sampleSize:100}` in `services.ts:734-745` | Scheduled Inngest cron `anomaly-baseline-builder` aggregates trailing-window audit rows into new `anomaly_baselines` table; services.ts reads from table, fails open on unknown keys |
| FeatureFlagService | Async-only `isEnabled()` (`apps/web/src/lib/feature-flags/feature-flag-service.ts:70-127`); safety gates in `services.ts:682-698,719-730` bypass the service and read env vars | New `peekEnabled(key, defaultValue): boolean` against in-process cache; safety gates rebound; env-var bypass removed |
| `ml_classifier_timeout` metric | Counter emitted from `packages/llm-gateway/src/safety/ml-injection-classifier.ts` but no alert wiring | `slo-cron.ts` evaluator `mlClassifierTimeoutRate` (threshold 5% over 5-min window) + runbook entry |
| Legacy `console.warn` in `@aptivo/llm-gateway` | 3 sites: `rate-limit/redis-rate-limit-store.ts`, `gateway/llm-gateway.ts`, `cost/pricing.ts` | All 3 migrated to injected `SafeLogger` (absorbed into S17-B4 per multi-model sign-off) |
| `apps/ws-server` event bridge | In-process only (`apps/ws-server/src/event-bridge.ts`); no cross-instance path | Inngest → Redis pub/sub publisher (`apps/web/src/lib/inngest/functions/ws-event-publisher.ts`); ws-server subscribes to `ws:*` Redis channels |
| Case Tracking | Does not exist | `tickets` + `ticket_sla_configs` schemas; Ticket CRUD API; SLA engine; escalation via sequential chains; reporting queries |

---

## 3. Task Breakdown

### Phase A — Epic 2 Safety Enablement Gates (Days 1-4, critical path)

---

#### S17-B1: Merged Actor / Department / Aggregate-Key Stream

**Estimate**: 5 SP (6 SP documented ceiling)
**Owner**: Senior
**Priority**: P0 — critical path
**Unlocks**: Gate #2 (anomaly-gate aggregate-key alignment) + Gate #3 (request→actor plumbing + department stamping for FA3-01 attribution)
**Dependencies**: none
**Parallelism**: blocks S17-B2 (same `services.ts` binding)

**Description**: Three threads — request→actor resolution, departmentId stamping on usage logs, and anomaly-gate aggregate-key alignment — are merged into a single stream because they share `apps/web/src/lib/services.ts` bindings, the `CompletionRequest` shape, and the `anomaly-gate` wiring. Splitting across owners triples cross-package review cost and risks one ripple shipping without the others, re-introducing the S16-documented silent zero-count bug. The current `resolveActor` returns `undefined`, usage logs are unstamped, and the anomaly gate passes `request.domain` into an audit query keyed by `resource_type` that uses real values like `'candidate'` / `'employee'` — so it always returns 0 and the gate never fires. Post-S17 the anomaly gate fires correctly on real PII-access patterns, `getSpendReport(deptId, range)` returns non-zero on stamped traffic, and `SpendReport.coverageLevel` transitions `'none' → 'full'` once any authenticated request lands.

**Files to modify**:
- `packages/llm-gateway/src/providers/types.ts:63-74` — widen `CompletionRequest` with optional `{ actor?: { userId: string; roles: string[]; departmentId?: string } }`
- `packages/llm-gateway/src/gateway/llm-gateway.ts:61-67,172-177` — `GatewayDeps.resolveActor?: (req: CompletionRequest) => { userId: string; departmentId?: string } | undefined`; pipeline step invokes before injection classifier
- `packages/llm-gateway/src/usage/usage-logger.ts:15-35,69-83` — accept `departmentId` on `UsageLogger.log()`; pass through to store
- `packages/database/src/adapters/llm-usage-log-store-drizzle.ts:25-42,52-69` — persist `departmentId` on insert; the `UsageRecord` interface in this file must gain `departmentId` field to match the gateway's widened shape (field-level coherence only; full consolidation into `@aptivo/types` remains S18)
- `packages/llm-gateway/src/safety/anomaly-gate.ts` — consume merged `actor` rather than ad-hoc `resolveActor`
- `packages/database/src/adapters/audit-store-drizzle.ts:109-151` — verify `actions?: readonly string[]` parameter path (widened in S16); integration test asserts non-zero aggregate
- `apps/web/src/lib/services.ts:641-646,753-770` — bind real `resolveActor` from request-context middleware; anomaly-gate binding passes per-domain action whitelist (e.g., `{ hr: ['pii.read.bulk'] }`) OR resource-specific keys; decision + rationale documented inline and in PR description
- `packages/database/src/schema/index.ts`, `packages/database/src/adapters/index.ts` — update barrels so new exports are discoverable

**Files to create**:
- `apps/web/src/lib/middleware/require-llm-context.ts` — helper that resolves JWT → user → department and stamps `actor` onto `CompletionRequest`; reuses `apps/web/src/lib/auth/*` verifiers

**Acceptance criteria**:
- [ac] `CompletionRequest.actor` is optional; existing callers compile without change
- [ac] `GatewayDeps.resolveActor` is optional; if unset, pipeline skips actor resolution
- [ac] `UsageLogger.log({ departmentId })` persists the field; unstamped rows still accepted (nullable column, per S16 FA3-01 schema)
- [ac] `requireLlmContext` middleware reads JWT via the same `verifyJwt` path as HITL; returns `null` when no JWT or verification fails
- [ac] `aggregateAccessPattern({ actor, resourceType, actions: ['pii.read.bulk'] })` returns non-zero on matching audit rows
- [ac] Anomaly gate integration test: 50 `pii.read.bulk` events from one actor within 10 minutes → `{ action: 'block' }`
- [ac] `getSpendReport(deptId, range).coverageLevel === 'full'` after any authenticated request lands
- [ac] Anomaly-gate binding decision (action whitelist vs resource-specific keys) is documented in PR description with citation to the S16 `S17 BLOCKER` comment it closes
- [ac] No regression: existing tests in `packages/llm-gateway/tests/` + `apps/web/tests/` pass unchanged

**TDD micro-tasks**:
1. Red/Green: `CompletionRequest` type accepts optional `actor`; compile passes with existing callers
2. Red/Green: `createGatewayDeps({ resolveActor })` factory accepts + wires `resolveActor`
3. Red/Green: `UsageLogger.log({ departmentId: 'd1' })` persists the ID; lookup returns it
4. Red/Green: `UsageLogger.log({})` without `departmentId` still works (backward-compat)
5. Red/Green: `requireLlmContext(req)` returns `{ userId, departmentId }` on valid JWT
6. Red/Green: `requireLlmContext(req)` returns `null` on missing JWT
7. Red/Green: `aggregateAccessPattern` with action filter returns non-zero count against seeded audit rows
8. Red/Green: anomaly gate with mock audit store + 50-event pattern returns `{ action: 'block' }`
9. Red/Green: integration — `POST /api/llm/complete` with JWT stamps `departmentId` on `llm_usage_logs`
10. Red/Green: `getSpendReport(deptId, { from, to }).coverageLevel === 'full'` after the integration test's insert
11. Red/Green: gateway end-to-end — unauthenticated request passes `actor: undefined` through, no stamping, no anomaly evaluation

**Risk ceiling**: 6 SP if auth/session plumbing exposes untouched surface (e.g., middleware ordering conflicts, JWT claim mismatch between HITL and ws-server). 23 SP total provides absorption.

---

#### S17-B2: FeatureFlagService Sync-Peek

**Estimate**: 2 SP
**Owner**: Senior
**Priority**: P0 — gate-critical
**Unlocks**: Gate #4 — production flag flips for `ml-injection-classifier` and `anomaly-blocking` stop relying on env-var overrides
**Dependencies**: S17-B1 (shares `services.ts` binding surface; merge-order: B1 first, then B2)

**Description**: The `FeatureFlagService.isEnabled()` contract is async (`Promise<boolean>`), but the ML injection classifier and anomaly gate call `isEnabled()` synchronously on every request — so S16 bound those gates to `process.env.ML_INJECTION_ENABLED` and `process.env.ANOMALY_BLOCKING_ENABLED` instead of the flag registry. This prevents the flag registry from being the source of truth for production flips. S17-B2 adds an additive sync `peekEnabled(key, defaultValue): boolean` against the in-process cache (populated by the existing async warm path), leaving `isEnabled()` unchanged for all other callers. Safety gates rebind to `peekEnabled`, and the env-var overrides are removed from `local-provider.ts` flag descriptions.

**Files to modify**:
- `apps/web/src/lib/feature-flags/feature-flag-service.ts:70-127` — expose `peekEnabled(key: string, defaultValue: boolean): boolean` reading from in-process cache; returns `defaultValue` when cache is cold
- `apps/web/src/lib/services.ts:682-698,719-730` — rebind ML classifier + anomaly gate `isEnabled` factories to `() => service.peekEnabled('ml-injection-classifier', false)` and `() => service.peekEnabled('anomaly-blocking', false)`
- `apps/web/src/lib/feature-flags/local-provider.ts:64-78` — remove "env var override" qualifier from `ml-injection-classifier` and `anomaly-blocking` flag descriptions

**Files to create**:
- `apps/web/tests/feature-flags/peek.test.ts` (repo convention: tests live under `apps/web/tests/`)

**Acceptance criteria**:
- [ac] `peekEnabled` returns `defaultValue` before first async warm
- [ac] After `isEnabled(key)` async warm, subsequent `peekEnabled(key)` returns the cached value synchronously
- [ac] Cache invalidation (new provider poll) triggers async re-warm; between invalidation and next warm, `peekEnabled` returns the last-known value (not `defaultValue`)
- [ac] `isEnabled()` behaviour is unchanged for all non-safety-gate callers
- [ac] `services.ts` no longer reads `process.env.ML_INJECTION_ENABLED` or `process.env.ANOMALY_BLOCKING_ENABLED`
- [ac] Flag descriptions in `local-provider.ts` no longer mention env-var fallback

**TDD micro-tasks**:
1. Red/Green: `peekEnabled('unknown-key', false) === false` before warm
2. Red/Green: `peekEnabled('unknown-key', true) === true` (defaultValue respected)
3. Red/Green: after `await service.isEnabled('ml-injection-classifier')`, `peekEnabled('ml-injection-classifier', false)` returns the warmed value
4. Red/Green: cache invalidation → `peekEnabled` returns last-known value, not `defaultValue`
5. Red/Green: existing `isEnabled()` tests in `apps/web/tests/` still pass
6. Red/Green: `services.ts` factory closure reads from `peekEnabled` (grep asserts no env-var access)

---

#### S17-B3: Real Anomaly Baseline Job

**Estimate**: 2 SP (3 SP risk ceiling per Codex)
**Owner**: Web Dev 2
**Priority**: P0 — gate-critical
**Unlocks**: Gate #5 — production flip of `anomaly-blocking` is defensible only against real baseline, not placeholder
**Dependencies**: none for impl; **numbers are only meaningful after S17-B1 merges** (aggregate-key alignment)

**Description**: S16 ships a placeholder baseline constant `{mean:10, stdDev:3, sampleSize:100}` in `services.ts:734-745`. Flipping `ANOMALY_BLOCKING_ENABLED=true` against that placeholder would produce arbitrary false positives/negatives. S17-B3 creates an `anomaly_baselines` table keyed by `(actor_id, resource_type)`, a scheduled Inngest cron that aggregates trailing-window audit events into mean/stdDev/sampleSize tuples, and rewires the `services.ts` lookup to read from the table. The anomaly detector's existing fail-open behaviour on `reason: 'insufficient baseline data'` holds — unknown keys (cold start) pass through without blocking.

**Sequencing note**: B3 is *implementation-independent* of B1. WD2 can land schema + migration + cron + service lookup on Days 1-3 against the current key shape. When B1 merges (Day 3-4), one follow-up commit switches the baseline query from `domain` to the aligned `(actor, resource_type, actions)` shape.

**Files to create**:
- `packages/database/src/schema/anomaly-baselines.ts` — `anomaly_baselines` (id UUID, actor_id TEXT, resource_type TEXT, mean NUMERIC, std_dev NUMERIC, sample_size INTEGER, computed_at TIMESTAMP; unique index on `(actor_id, resource_type)`)
- Drizzle migration (up + down)
- `apps/web/src/lib/jobs/anomaly-baseline-builder.ts` — Inngest cron function (runs every 6h), aggregates last 7 days of audit `resource_read` events keyed by `(actor_id, resource_type)`, writes mean/stdDev/sampleSize tuples to the table
- `apps/web/tests/jobs/anomaly-baseline-builder.test.ts`

**Files to modify**:
- `apps/web/src/lib/services.ts:734-745` — replace placeholder with table lookup; `undefined` result → `baselineData: undefined` → detector returns `insufficient baseline data` → gate passes
- `apps/web/src/lib/inngest.ts` — register the new cron function
- `packages/database/src/schema/index.ts`, `packages/database/src/adapters/index.ts` — barrel export updates

**Acceptance criteria**:
- [ac] Drizzle migration creates table + unique index; down-migration drops cleanly; verified in test harness
- [ac] Cron fires on schedule (mocked in test) and writes at least one baseline row per distinct `(actor_id, resource_type)` pair in the window
- [ac] Mean and stdDev match the mathematical expected values for seeded audit data (within floating-point tolerance)
- [ac] `services.ts` baseline lookup returns computed tuple for known keys
- [ac] `services.ts` baseline lookup returns `undefined` for unknown keys (cold-start keys)
- [ac] Anomaly gate: unknown key → `{ action: 'pass' }` (fail-open preserved)
- [ac] Anomaly gate: known key with z-score over threshold → `{ action: 'block' }`

**TDD micro-tasks**:
1. Red/Green: schema migration creates table with unique index
2. Red/Green: down-migration drops table
3. Red/Green: `anomaly-baseline-builder` with seeded audit data writes expected tuples
4. Red/Green: mean computation matches `sum(count) / N`; stdDev matches sample-stdev formula
5. Red/Green: running the job twice doesn't duplicate rows (upsert on unique key)
6. Red/Green: `services.ts` lookup returns tuple; unknown key returns `undefined`
7. Red/Green: anomaly gate with unknown baseline → `{ action: 'pass' }`
8. Red/Green: anomaly gate with seeded baseline + z>threshold → `{ action: 'block' }`

---

#### S17-B4: ml_classifier_timeout Alert Wiring + Legacy console.warn Migration

**Estimate**: 1 SP
**Owner**: Senior
**Priority**: P1 — closes silent-fallback gap
**Unlocks**: Not a hard gate, but flipping `ml-injection-classifier` without this means sustained high-latency regimes silently fall back to rule-based with no ops visibility. Absorbs 3 legacy `console.warn` migrations per multi-model sign-off.
**Dependencies**: S17-B1 (any B4 migrations touching `packages/llm-gateway/src/gateway/llm-gateway.ts` should sequence after B1's gateway changes merge to avoid conflict)

**Description**: S16 emits a `ml_classifier_timeout` counter from `packages/llm-gateway/src/safety/ml-injection-classifier.ts` on every timeout/error/invalid-response fallback. S17-B4 wires that counter into the existing SLO cron with a conservative threshold (5% fallback rate over a 5-min window) and adds a runbook entry so oncall knows the response. The task also absorbs the 3 remaining `console.warn` sites in `@aptivo/llm-gateway` (not 7 as originally planned; grep-verified): `rate-limit/redis-rate-limit-store.ts`, `gateway/llm-gateway.ts`, `cost/pricing.ts`. Each site moves to an injected `SafeLogger`; factories that don't already accept `logger` gain the parameter.

**Files to modify**:
- `apps/web/src/lib/observability/slo-cron.ts` — new evaluator `mlClassifierTimeoutRate` reads counter via `MetricService`, compares to threshold
- `apps/web/src/lib/observability/metric-service.ts:13-79` — query method `getMlClassifierTimeoutRate(windowMinutes: number)`
- `docs/04-specs/slo-runbook.md` — threshold + oncall response entry
- `packages/llm-gateway/src/rate-limit/redis-rate-limit-store.ts` — `console.warn` → injected `SafeLogger`
- `packages/llm-gateway/src/gateway/llm-gateway.ts` — `console.warn` → injected `SafeLogger`
- `packages/llm-gateway/src/cost/pricing.ts` — `console.warn` → injected `SafeLogger`

**Acceptance criteria**:
- [ac] `getMlClassifierTimeoutRate(5)` returns the fraction of ML calls that fell back in the last 5 minutes
- [ac] SLO cron evaluator emits a `burn_rate_alert` when rate > 5%
- [ac] Runbook entry covers: symptom, likely cause (Replicate latency or outage), oncall actions (disable flag, check Replicate status, tune timeout)
- [ac] `grep -r 'console\.warn' packages/llm-gateway/src/` returns zero matches after this task
- [ac] All 3 modified factories accept `logger: SafeLogger` in deps; `services.ts` wires `getSafeLogger()` into each
- [ac] No regression in `packages/llm-gateway/tests/`

**TDD micro-tasks**:
1. Red/Green: `getMlClassifierTimeoutRate` returns 0 when no events
2. Red/Green: seeded metric counter → `getMlClassifierTimeoutRate` returns expected fraction
3. Red/Green: SLO cron evaluator emits alert when rate > threshold
4. Red/Green: factory in `redis-rate-limit-store.ts` accepts `logger` in deps; legacy `console.warn` call now goes through `logger.warn`
5. Red/Green: same for `llm-gateway.ts`
6. Red/Green: same for `cost/pricing.ts`
7. Verification: final `rg 'console\.warn' packages/llm-gateway/src/` returns zero matches

---

### Phase B — Case Tracking API (Days 1-6, parallel track)

---

#### CT-1: Ticket CRUD API

**Estimate**: 3 SP
**Owner**: Web Dev 1
**Priority**: P0 — Epic 4 foundation
**Dependencies**: none
**Parallelism**: blocks CT-2, CT-4 (sequential within WD1 track)

**Description**: Epic 4 foundation. Introduces `tickets` as a first-class entity with workflow-definition linkage, RBAC-guarded CRUD, RFC 7807 error shapes, and audit events on every write. `Tickets` carry `departmentId` from day one so department budgeting / reporting can attribute case work. Uses WFE3-01 graph validator from S16 when a ticket is associated with a workflow definition. No UI in S17 (Phase 3 is backend-only); surfaces are API + OpenAPI docs.

**Files to create**:
- `packages/database/src/schema/tickets.ts` — `tickets` (id UUID, workflowDefinitionId UUID FK nullable, status ENUM['open','in_progress','escalated','closed'], priority ENUM['low','medium','high','critical'], title TEXT, body TEXT, ownerUserId UUID FK, departmentId UUID FK nullable, createdAt, updatedAt, closedAt TIMESTAMP nullable)
- Drizzle migration (up + down)
- `packages/database/src/adapters/ticket-store-drizzle.ts` — `createDrizzleTicketStore(db)` implementing `TicketStore` with `create`, `findById`, `list({ status?, priority?, departmentId?, limit, offset })`, `update`, `delete`
- `apps/web/src/app/api/tickets/route.ts` — `GET` list (paginated; default limit 50, max 200), `POST` create (RBAC: `platform/tickets.create`)
- `apps/web/src/app/api/tickets/[id]/route.ts` — `GET` (RBAC: `platform/tickets.read`), `PATCH` (RBAC: `platform/tickets.update`), `DELETE` (RBAC: `platform/tickets.delete`)
- `packages/types/src/events/ticket.ts` — Zod schemas for `ticket.created`, `ticket.escalated`, `ticket.sla_breached`; barrel-exported from `@aptivo/types`

**Files to modify**:
- `apps/web/src/lib/services.ts` — `getTicketStore()` lazy getter
- `apps/web/openapi.yaml` — v1.2.x bump with full schemas (request/response bodies, RFC 7807 error shapes)
- `packages/database/src/schema/index.ts`, `packages/database/src/adapters/index.ts` — barrel exports

**Tagged errors**: `TicketError = { _tag: 'TicketNotFound' } | { _tag: 'TicketValidationError', issues } | { _tag: 'WorkflowDefinitionNotFound', workflowDefinitionId } | { _tag: 'TicketAlreadyClosed' }`

**Acceptance criteria**:
- [ac] Schema migration creates table; down-migration reversible; verified in test harness
- [ac] `TicketStore` CRUD operations work; list supports pagination + filters
- [ac] `POST /api/tickets` creates + returns 201 + audit event `platform.ticket.created` persisted
- [ac] `GET /api/tickets` returns paginated list; RFC 7807 on bad query params
- [ac] `GET /api/tickets/:id` returns ticket; 404 with `type='/errors/ticket-not-found'` on missing
- [ac] `PATCH /api/tickets/:id` updates + audit event `platform.ticket.updated`
- [ac] `DELETE /api/tickets/:id` soft-closes (sets `closedAt`, status='closed'); hard delete 403
- [ac] Unauthorized role → RFC 7807 403
- [ac] When `workflowDefinitionId` is provided, the graph validator is invoked; invalid graph → RFC 7807 400
- [ac] OpenAPI v1.2.x entry includes request/response schemas + RFC 7807 error schemas
- [ac] ≥80% coverage on new code

**TDD micro-tasks**:
1. Red/Green: Drizzle migration up + down verified
2. Red/Green: `ticketStore.create({ title, body, ownerUserId })` returns `{ id, ... }`
3. Red/Green: `ticketStore.list({ status: 'open' })` filters correctly
4. Red/Green: `ticketStore.list({ departmentId })` filters correctly
5. Red/Green: `ticketStore.update(id, { status: 'in_progress' })` persists; `updatedAt` advances
6. Red/Green: `POST /api/tickets` (valid body) returns 201 + audit event row
7. Red/Green: `POST /api/tickets` with invalid body returns RFC 7807 400 `type='/errors/ticket-validation'`
8. Red/Green: `POST /api/tickets` with `workflowDefinitionId` that fails graph validation → RFC 7807 400
9. Red/Green: `GET /api/tickets/:id` 404 → RFC 7807 `type='/errors/ticket-not-found'`
10. Red/Green: `PATCH /api/tickets/:id` audit event `platform.ticket.updated` persists
11. Red/Green: RBAC — unauthorized role → 403
12. Doc: OpenAPI v1.2.x added for `/api/tickets` + `/api/tickets/{id}`

---

#### CT-2: SLA Engine

**Estimate**: 3 SP *(Codex re-estimated from 2 SP; rationale: `apps/web/src/lib/observability/approval-sla-service.ts:49-57,75-154` is a stub returning `[]` — ticket SLA needs real store plumbing, not a wrapper)*
**Owner**: Web Dev 1
**Priority**: P0 — Epic 4
**Dependencies**: CT-1 (ticket schema + store)

**Description**: Per-priority SLA windows for tickets (e.g., critical: 4h resolve, high: 24h, medium: 72h, low: 1 week). Computes breach status on the fly and schedules burn-rate alerts via the existing SLO cron. Replaces the approval-sla-service stub with real query logic.

**Files to create**:
- `packages/database/src/schema/ticket-sla-configs.ts` — `ticket_sla_configs` (priority ENUM PK, resolveMinutes INTEGER, warningThresholdPct NUMERIC default 0.80)
- Drizzle migration + down-migration + seed (four default rows for the four priorities)
- `apps/web/src/lib/case-tracking/ticket-sla-service.ts` — `createTicketSlaService({ store, ticketStore })`; `computeSla(ticket)` returns `{ deadline, remainingMs, breached, warningThresholdReached }`; `listAtRisk(pct)` returns tickets over `pct` of SLA window consumed
- `apps/web/tests/case-tracking/ticket-sla-service.test.ts`

**Files to modify**:
- `apps/web/src/lib/observability/approval-sla-service.ts:49-57,75-154` — replace `return []` stub with real store query; returns tickets above threshold; preserves existing function signature to avoid downstream churn
- `apps/web/src/lib/observability/slo-cron.ts` — new evaluator `ticketSlaAtRiskRate` emits burn-rate alert when percentage of open tickets over 80% SLA exceeds threshold
- `apps/web/src/lib/services.ts` — `getTicketSlaService()` lazy getter
- `apps/web/openapi.yaml` — no new endpoint (engine is internal); ticket response bodies gain `slaStatus` field

**Acceptance criteria**:
- [ac] Schema migration creates table + seeds four default priority rows; down-migration reversible
- [ac] `computeSla(ticket)` returns deadline = `createdAt + priorityWindow`
- [ac] `computeSla(ticket)` reports `breached: true` when `now > deadline`
- [ac] `computeSla(ticket)` reports `warningThresholdReached: true` when `(elapsed / window) >= 0.80`
- [ac] `listAtRisk(0.80)` returns tickets meeting the warning threshold
- [ac] `approval-sla-service.ts` returns real tickets (not `[]`) after stub replacement
- [ac] SLO cron evaluator emits `ticket_sla_burn_rate_alert` when rate breaches threshold
- [ac] Ticket response bodies in `GET /api/tickets/:id` include `slaStatus` field

**TDD micro-tasks**:
1. Red/Green: Drizzle migration seeds four priority rows
2. Red/Green: `computeSla(ticket{priority:'critical', createdAt: now-1h})` → not breached, not warning
3. Red/Green: `computeSla(ticket{priority:'critical', createdAt: now-5h})` → breached
4. Red/Green: `computeSla(ticket{priority:'high', createdAt: now-20h})` → warning threshold reached
5. Red/Green: `listAtRisk(0.80)` returns ticket from step 4, not step 2
6. Red/Green: `approval-sla-service.ts` stub replaced with real query returning seeded tickets
7. Red/Green: SLO cron evaluator fires when rate > threshold
8. Red/Green: `GET /api/tickets/:id` response includes `slaStatus: { deadline, breached, warningThresholdReached }`

---

#### CT-3: Escalation Logic

**Estimate**: 3 SP
**Owner**: Web Dev 2
**Priority**: P0 — Epic 4
**Dependencies**: CT-1 (ticket schema + store); reuses S11 HITL sequential-chain primitive

**Description**: Escalation wraps the existing S11 HITL sequential-chain primitive at `packages/hitl-gateway/src/policy/sequential-chain.ts:45-132` — tickets move through a tiered chain (L1 owner → L2 manager → L3 department head) on timeout or manual trigger. Pattern-matches existing usage in `apps/web/src/lib/workflows/hr-contract-approval.ts:157-236,257-324`. Ticket schema gains `escalationState` JSONB (current tier, chain history, last advance timestamp). Every tier change emits `platform.ticket.escalated` audit event and optionally fires a notification via the existing adapter.

**Files to create**:
- `apps/web/src/lib/case-tracking/ticket-escalation.ts` — `createTicketEscalationService({ hitlGateway, ticketStore, notificationAdapter })`; `advance(ticketId)`, `getChainStatus(ticketId)`, `manualEscalate(ticketId, reason)`
- `apps/web/src/app/api/tickets/[id]/escalate/route.ts` — `POST` manual escalate (RBAC: `platform/tickets.escalate`); RFC 7807 on invalid state
- `apps/web/tests/case-tracking/ticket-escalation.test.ts`

**Files to modify**:
- `packages/database/src/schema/tickets.ts` — add `escalationState` JSONB column; migration adds column nullable
- `apps/web/src/lib/services.ts` — `getTicketEscalationService()` lazy getter; wires notification adapter
- `apps/web/openapi.yaml` — `/api/tickets/{id}/escalate` endpoint

**Tagged errors**: extends `TicketError` with `{ _tag: 'TicketChainExhausted', ticketId } | { _tag: 'TicketAlreadyAtTopTier', ticketId }`

**Acceptance criteria**:
- [ac] Schema migration adds `escalationState` column nullable; down-migration drops cleanly
- [ac] `createTicketEscalationService` returns service with `advance`, `getChainStatus`, `manualEscalate`
- [ac] `advance(ticketId)` moves ticket from L1 → L2; state persists
- [ac] `advance(ticketId)` at top tier returns `{ _tag: 'TicketAlreadyAtTopTier' }`
- [ac] `manualEscalate` emits `platform.ticket.escalated` audit event with reason
- [ac] `POST /api/tickets/:id/escalate` returns 200 on success, RFC 7807 403 on unauthorized
- [ac] Notification adapter called on tier change (verified via mock)
- [ac] `getChainStatus` returns current tier + history

**TDD micro-tasks**:
1. Red/Green: Drizzle migration adds column; down-migration drops
2. Red/Green: `advance(ticketId)` from L1 → L2; state JSONB persists
3. Red/Green: `advance(ticketId)` at L3 returns `{ _tag: 'TicketAlreadyAtTopTier' }`
4. Red/Green: `manualEscalate(ticketId, 'stakeholder request')` emits audit event with reason field
5. Red/Green: `getChainStatus(ticketId)` returns current tier + history array
6. Red/Green: `POST /api/tickets/:id/escalate` (authorized) → 200 + audit event
7. Red/Green: `POST /api/tickets/:id/escalate` (unauthorized) → RFC 7807 403
8. Red/Green: notification adapter invoked on tier change (mock asserts call)

---

#### CT-4: Reporting Queries

**Estimate**: 2 SP
**Owner**: Web Dev 1
**Priority**: P1 — Epic 4 completion
**Dependencies**: CT-1 (ticket schema queryable)

**Description**: Aggregation queries over the `tickets` + `llm_usage_logs` + audit tables. Reuses the `MetricService` pattern from S7 — per-department counts, average resolution time, SLA compliance rate. API-only (no dashboards in Phase 3; surfaces are `/api/tickets/reports`).

**Files to create**:
- `apps/web/src/app/api/tickets/reports/route.ts` — `GET` reports (RBAC: `platform/tickets.report`); query params: `from`, `to`, `departmentId?`, `priority?`

**Files to modify**:
- `apps/web/src/lib/observability/metric-service.ts:13-79` — add `getOpenByPriority()`, `getAvgResolutionTime({ from, to, departmentId? })`, `getSlaComplianceRate({ from, to, departmentId? })`, `getTicketCountsByStatus({ from, to, departmentId? })`
- `apps/web/openapi.yaml` — `/api/tickets/reports` endpoint with full schemas

**Acceptance criteria**:
- [ac] `getOpenByPriority()` returns `{ low, medium, high, critical }` counts
- [ac] `getAvgResolutionTime({ from, to })` returns ms average over closed tickets in range
- [ac] `getSlaComplianceRate` returns fraction of closed tickets resolved within SLA window
- [ac] `getTicketCountsByStatus` returns `{ open, in_progress, escalated, closed }`
- [ac] `GET /api/tickets/reports` returns aggregated object; RFC 7807 400 on bad range
- [ac] OpenAPI v1.2.x entry includes response schema
- [ac] ≥80% coverage

**TDD micro-tasks**:
1. Red/Green: `getOpenByPriority` with seeded data returns expected counts
2. Red/Green: `getAvgResolutionTime` returns expected ms over seeded closed tickets
3. Red/Green: `getSlaComplianceRate` returns fraction against seeded tickets (some breached, some not)
4. Red/Green: `getTicketCountsByStatus` returns expected counts
5. Red/Green: `GET /api/tickets/reports?from=...&to=...` returns aggregated JSON
6. Red/Green: `GET /api/tickets/reports?from=INVALID` → RFC 7807 400
7. Doc: OpenAPI entry with full schema

---

### Phase C — Epic 3 Publisher (Days 3-5)

---

#### S17-WS-PUB: Inngest → Redis Publisher Path

**Estimate**: 2 SP
**Owner**: Web Dev 2
**Priority**: P1 — gate-critical
**Unlocks**: Gate #6 — `ws-server-enabled` flag can flip; horizontal-scale of `apps/ws-server`; Phase 3.5 UI-F consumer readiness
**Dependencies**: frozen contract at `packages/types/src/websocket-events.ts` (already frozen v1.0 in S16)

**Description**: S16 shipped `apps/ws-server` with an in-process event bridge. For horizontal scale + cross-instance fan-out, `apps/web` publishes selected Inngest events to Redis channels keyed by topic, and `apps/ws-server` subscribes. This is the Epic 3 production-enablement gate. The channel naming convention + frame shape are frozen in `packages/types/src/websocket-events.ts`; this task is the concrete publisher + subscriber implementation.

**Files to create**:
- `apps/web/src/lib/inngest/functions/ws-event-publisher.ts` — Inngest function subscribing to `workflow.step.*`, `hitl.*`, `platform.ticket.*` events; publishes to Redis channel `ws:<topic>` (topic derivation: `ws:workflow/<workflowId>`, `ws:hitl/<requestId>`, `ws:ticket/<ticketId>`)
- `apps/ws-server/tests/publisher.integration.test.ts` — end-to-end Inngest event → Redis publish → ws-server client frame

**Files to modify**:
- `apps/web/src/lib/inngest.ts` — register `ws-event-publisher` function in the Inngest union
- `apps/ws-server/src/event-bridge.ts` — add Redis subscriber; consumes `ws:*` channels; routes to existing in-process fan-out (no new fan-out logic — the subscriber is a new *source* for the existing event bus)

**Acceptance criteria**:
- [ac] Inngest function publishes envelope with `{ eventId, topic, data, timestamp }` matching the frozen frame schema
- [ac] Redis channel naming matches `ws:<topic>` convention
- [ac] ws-server Redis subscriber consumes published events, routes through existing fan-out
- [ac] Integration test: Inngest event fired in `apps/web` → WS client in `apps/ws-server/tests/` receives matching `event` frame within 2 seconds
- [ac] Duplicate-event dedupe: two publishes of the same `eventId` → ws-server emits exactly one `event` frame
- [ac] Publisher errors logged via `SafeLogger`; Redis outage → retry via Inngest's built-in retry semantics, no event loss

**TDD micro-tasks**:
1. Red/Green: `wsEventPublisher` Inngest function registered in `apps/web/src/lib/inngest.ts`
2. Red/Green: firing a `workflow.step.completed` event results in a Redis publish to `ws:workflow/<workflowId>`
3. Red/Green: ws-server Redis subscriber consumes + emits event to connected client
4. Red/Green: duplicate `eventId` dedupe (ws-server tracks recent eventIds in ring buffer)
5. Red/Green: Redis outage → Inngest retries; no data loss verified via mocked outage
6. Integration: full loop end-to-end with a real Redis instance (or Upstash test fixture) in the test harness

---

## 4. Dependency Graph

```
Phase A — critical path (Senior):
  S17-B1 Merged stream (5) ──────────────────────────────┐
  S17-B2 FF sync-peek (2) ← S17-B1 (same services.ts)    │
  S17-B4 ml timeout alert + console.warn (1)             │
        (can parallelize once B1 types merged)            │
                                                          │
Phase B — Epic 4 (WD1, sequential):                      │
  CT-1 Ticket CRUD (3) ──┐                                │
  CT-2 SLA engine (3) ← CT-1 (store)                     │
  CT-4 Reporting (2) ← CT-1 (data)                       │
                                                          │
Phase B — Escalation (WD2):                              │
  CT-3 Escalation (3) ← CT-1 (schema)                    │
                                                          │
Phase A (WD2) + Phase C:                                 │
  S17-B3 Baseline job (2) — impl independent of B1;      │
         numbers meaningful after B1 merges  ←───────────┘
  S17-WS-PUB Redis publisher (2) — frozen contract; no deps
```

Total: **23 SP · 9 tasks**

Critical path: **S17-B1 (5 SP)** on the Senior track; this is the sprint's longest single-owner task. Days 3-4 is review/merge target; Days 5-6 covers B2 + B4. Epic 4 track (WD1) runs in parallel on Days 1-6 with strict CT-1 → CT-2 → CT-4 sequencing. WD2 balances B3 (Days 1-3) + CT-3 (Days 2-5) + WS-PUB (Days 3-5).

---

## 5. Owner Allocation

- **Senior (8 SP)** — S17-B1 (5) + S17-B2 (2) + S17-B4 (1). Single cohesive safety-gates stream on the LLM gateway. All work touches `packages/llm-gateway` + `apps/web/src/lib/services.ts`, so one owner prevents review-coordination overhead.
- **Web Dev 1 (8 SP)** — CT-1 (3) + CT-2 (3) + CT-4 (2). Epic 4 ticket lifecycle: CRUD → SLA → reporting. Strictly sequential within the owner's track.
- **Web Dev 2 (7 SP)** — S17-B3 (2) + CT-3 (3) + S17-WS-PUB (2). Mixed bag: baseline job (Days 1-3), escalation (Days 2-5), Redis publisher (Days 3-5). Lighter load by 1 SP — headroom for pairing on B1 review or absorbing a B1 overage.

Total: **23 SP · 27-30 velocity band → deliberate headroom on critical path**.

---

## 6. Cross-Sprint Definition of Done

- [ ] OpenAPI v1.2.x bumped for every new/changed endpoint (CT-1..CT-4, `/api/tickets/:id/escalate`, `/api/tickets/reports`)
- [ ] Drizzle migrations generated + committed for `tickets`, `ticket_sla_configs`, `anomaly_baselines`; each migration's down-migration verified in test harness
- [ ] Event schemas added to `packages/types/src/events/ticket.ts`; barrel-exported from `@aptivo/types`
- [ ] WebSocket protocol v1.0 unchanged; publisher payload shape matches the existing `event` frame schema
- [ ] Safe-logger passed via DI into every new package component **and** the 3 legacy `console.warn` sites in `@aptivo/llm-gateway` (migrated as part of S17-B4 — zero `console.warn` in the package after S17)
- [ ] Feature-flag DI: `peekEnabled` binding exercised from `services.ts` for both safety gates
- [ ] RFC 7807 error responses on all new HTTP routes (both happy-path and error-path schema-tested)
- [ ] Admin writes emit audit events (ticket.created, ticket.updated, ticket.escalated)
- [ ] Admin routes rate-limited using the S16 admin rate-limit middleware (for `POST /api/tickets`, `PATCH /api/tickets/:id`, `POST /api/tickets/:id/escalate`)
- [ ] ≥80% test coverage on new code (`pnpm test:coverage`)
- [ ] No regressions in S16 test suite (2,106 tests at end of S16)
- [ ] All 5 S17-implementation gates (#2-#6) in `docs/06-sprints/sprint-16-delivery-review.md` §6 marked `CLEARED` in the S17 delivery review; Gate #1 Replicate procurement status reported separately

---

## 7. Architectural Decisions

### AD1: Actor/Dept/Key merge lands as one stream
The three concerns share `apps/web/src/lib/services.ts` bindings, the gateway request shape, and the anomaly-gate wiring. Splitting across owners triples cross-package review cost and creates risk that one ships without the others, re-introducing the silent zero-count bug S16 documented.

### AD2: `peekEnabled` is additive, not a replacement
`FeatureFlagService.isEnabled()` stays async-canonical; `peekEnabled` is a cache-read for sync call sites (safety gates). This preserves the async provider contract for any future remote flag service (LaunchDarkly, Unleash) without forcing synchronous access patterns on the rest of the app.

### AD3: Epic 5 is S18 material
Crypto live-trading depends on Epic 2 being production-enabled AND observed. Flipping flags on Monday and trading on Friday against those flags in the same sprint is not defensible. S18 picks up Epic 5 (Crypto + HR + MOD-02, ~12 SP) with a full sprint of staging observation on the safety pipeline.

### AD4: WS Redis publisher ships in S17, not S18
Phase 3.5 UI-F onboarding needs `ws-server` addressable with real traffic. The publisher is 2 SP and the contract is already frozen (`packages/types/src/websocket-events.ts` at v1.0), so the risk is low. Shipping it here means Phase 3.5 designer engagement doesn't start against a dead island.

### AD5: CT-2 is 3 SP, not 2
`apps/web/src/lib/observability/approval-sla-service.ts:49-57,75-154` is a stub returning `[]` — ticket SLA needs real store plumbing, not a wrapper. Re-estimated after Codex's stub audit in multi-model review round 1.

### AD6: Legacy `console.warn` migration absorbed into S17-B4
Rather than defer 3 remaining sites to S18 (creating half-migrated `@aptivo/llm-gateway`), absorb the edits into B4. Cost is ~30 minutes; benefit is a clean "no console.warn in llm-gateway" guarantee at S17 exit.

### AD7: Anomaly baseline cron schedule
Runs every 6h; each run aggregates the trailing 7 days of `resource_read` events. This trades off freshness against ops-cost and Supabase query volume. First production baseline lands ~6h after staging deploy. Cron schedule revisitable as a post-S17 tuning item; not a breaking change to revise.

### AD8: Baseline fail-open on unknown keys
When an `(actor, resource_type)` pair has no baseline row (cold start or brand-new actor), the detector returns `insufficient baseline data` and the gate passes. This is the same fail-open pattern S16 already documented for the placeholder constant — no new behavioural risk.

---

## 8. Scope Decision

| Item | SP | Decision | Rationale |
|---|---|---|---|
| S17-B1 Merged actor/dept/key stream | 5 | **Commit** | Unlocks Gates #2, #3; critical path |
| S17-B2 FeatureFlagService sync-peek | 2 | **Commit** | Unlocks Gate #4 |
| S17-B3 Real anomaly baseline job | 2 | **Commit** | Unlocks Gate #5 |
| S17-B4 ml_classifier_timeout alert + console.warn migration | 1 | **Commit** | Closes silent-fallback gap + absorbed broken-window cleanup |
| CT-1 Ticket CRUD API | 3 | **Commit** | Epic 4 foundation |
| CT-2 SLA engine | 3 | **Commit** *(was 2, re-estimated)* | Real store plumbing per Codex stub audit |
| CT-3 Escalation logic | 3 | **Commit** | Reuses S11 HITL chains |
| CT-4 Reporting queries | 2 | **Commit** | Epic 4 completion |
| S17-WS-PUB Inngest → Redis publisher | 2 | **Commit** | Unlocks Gate #6 |
| Epic 5 Crypto live-trading | — | **Defer → S18** | Gates need observation, not same-sprint consume |
| Epic 5 HR onboarding | — | **Defer → S18** | Epic 5 block |
| MOD-02 interface contracts | — | **Defer → S18** | Epic 5 block |
| FA3-02 budget notifications + HITL escalation | — | **Defer → S18** | Epic 8 residual; pairs with HITL escalation |
| UsageRecord interface consolidation into `@aptivo/types` | — | **Defer → S18** | Cross-package refactor; B1 only requires field coherence |
| `verifyJwt` consolidation for `apps/ws-server` | — | **Defer → S18** | Cleanup; parallel verifier works |
| ws-server Railway staging deploy verification | — | **Start (calendar)** | Ops task tied to WS-PUB merge |

**Committed**: 23 SP · **Deferred**: ~18 SP to S18

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| S17-B1 merged stream larger than 5 SP | Medium | High | 6 SP ceiling documented; 23 SP total leaves absorption; WD2 has 1 SP headroom for pairing |
| FeatureFlagService sync-peek breaks async callers | Low | Medium | Additive `peekEnabled`; `isEnabled` unchanged; test coverage on both paths |
| Anomaly baseline job blocked by low staging audit volume | Medium | Medium | Seed synthetic audit data in test env; mark staging baseline "insufficient data" until production volume accumulates; fail-open holds |
| Redis publisher introduces event duplication | Low | Medium | Dedupe by `eventId` at ws-server; integration test covers |
| 6-day sprint compresses B1 review cycles | Medium | Medium | Day-4 B1 merge target; Days 5-6 for B2/B4 + Epic 4 polish |
| Epic 5 stakeholder pressure | Medium | High | Plan explicitly defers; S18 takes all of Epic 5 |
| `ml_classifier_timeout` threshold mis-tuned | Low | Low | Conservative 5%/5-min start; revisable in delivery review |
| WS-PUB misses events under throughput | Low | Medium | Inngest retry semantics + dedupe; integration test asserts zero loss |
| Anomaly baseline cron runs before B1 merges, producing stale-key numbers | Medium | Low | Documented sequencing note in B3; one follow-up commit rebinds keys post-B1 merge |

---

## 10. Critical Files to Create / Modify

**New**:
- `packages/database/src/schema/tickets.ts`
- `packages/database/src/schema/ticket-sla-configs.ts`
- `packages/database/src/schema/anomaly-baselines.ts`
- `packages/database/src/adapters/ticket-store-drizzle.ts`
- `packages/types/src/events/ticket.ts`
- `apps/web/src/lib/case-tracking/ticket-sla-service.ts`
- `apps/web/src/lib/case-tracking/ticket-escalation.ts`
- `apps/web/src/lib/jobs/anomaly-baseline-builder.ts`
- `apps/web/src/lib/inngest/functions/ws-event-publisher.ts`
- `apps/web/src/lib/middleware/require-llm-context.ts`
- `apps/web/src/app/api/tickets/route.ts`
- `apps/web/src/app/api/tickets/[id]/route.ts`
- `apps/web/src/app/api/tickets/[id]/escalate/route.ts`
- `apps/web/src/app/api/tickets/reports/route.ts`
- `apps/web/tests/feature-flags/peek.test.ts`
- `apps/web/tests/case-tracking/*.test.ts`
- `apps/web/tests/jobs/anomaly-baseline-builder.test.ts`
- `apps/ws-server/tests/publisher.integration.test.ts`
- Drizzle migrations for `tickets`, `ticket_sla_configs`, `anomaly_baselines`

**Modify (reuse, not rewrite)**:
- `packages/llm-gateway/src/providers/types.ts` — widen `CompletionRequest`
- `packages/llm-gateway/src/gateway/llm-gateway.ts:61-67,172-177` — `GatewayDeps.resolveActor`
- `packages/llm-gateway/src/usage/usage-logger.ts:15-35,69-83` — `departmentId` threading
- `packages/database/src/adapters/llm-usage-log-store-drizzle.ts:25-42,52-69` — persist `departmentId`; `UsageRecord` field coherence
- `packages/database/src/adapters/audit-store-drizzle.ts:109-151` — verify `actions` param (widened in S16)
- `packages/llm-gateway/src/safety/anomaly-gate.ts` — consume merged `actor`
- `packages/llm-gateway/src/rate-limit/redis-rate-limit-store.ts` — `console.warn` → DI SafeLogger
- `packages/llm-gateway/src/gateway/llm-gateway.ts` — `console.warn` → DI SafeLogger
- `packages/llm-gateway/src/cost/pricing.ts` — `console.warn` → DI SafeLogger
- `apps/web/src/lib/services.ts:641-646,682-698,719-730,734-745,753-770` — rebind all safety gates + `resolveActor` + baseline lookup
- `apps/web/src/lib/feature-flags/feature-flag-service.ts:70-127` — `peekEnabled`
- `apps/web/src/lib/feature-flags/local-provider.ts:64-78` — flag descriptions
- `apps/web/src/lib/observability/slo-cron.ts` — `mlClassifierTimeoutRate` + `ticketSlaAtRiskRate` evaluators
- `apps/web/src/lib/observability/metric-service.ts:13-79` — ticket + timeout queries
- `apps/web/src/lib/observability/approval-sla-service.ts:49-57,75-154` — replace stub
- `apps/web/src/lib/inngest.ts` — register `ws-event-publisher`
- `apps/ws-server/src/event-bridge.ts` — Redis subscriber
- `apps/web/openapi.yaml` — v1.2.x bump
- `packages/database/src/schema/index.ts`, `packages/database/src/adapters/index.ts` — barrel exports
- `docs/04-specs/slo-runbook.md` — ml timeout threshold + oncall entry

---

## 11. Verification

### 11.1 Gate-clearance audit

End-of-sprint confirmation that every S16 delivery-review §6 gate has been cleared:

- **Gate #1 (Replicate procurement)** — calendar/finance item. Confirm status in S17 delivery review; not a code check. S17 exit doesn't block on it unless Epic 2 flag-flip GO/NO-GO depends on procurement complete.
- **Gate #2 (aggregate-key alignment)** — anomaly-gate binding in `services.ts` passes resource/action-aware keys; integration test asserts non-zero aggregate against real audit rows.
- **Gate #3 (request→actor plumbing)** — `resolveActor` no longer `() => undefined` (grep `apps/web/src/lib/services.ts`); authenticated request stamps `departmentId` on `llm_usage_logs` (staging SQL query).
- **Gate #4 (FeatureFlagService sync-peek)** — `peekEnabled` symbol exists; safety gates in `services.ts` bound to `peekEnabled`, not `process.env`.
- **Gate #5 (real anomaly baseline job)** — `anomaly_baselines` table exists with a row where `computed_at > now() - 1 day`; `services.ts` baseline lookup reads from table.
- **Gate #6 (Inngest → Redis publisher)** — `ws-event-publisher` Inngest function registered; integration test asserts end-to-end Inngest event → Redis publish → ws-server client frame delivery.

### 11.2 Test suite

`pnpm test` passes across all packages with new tests; `pnpm test:coverage` shows ≥80% on new code.

### 11.3 Case tracking end-to-end

1. `POST /api/tickets` with valid body (admin JWT) → 201 + audit event persists
2. `GET /api/tickets/:id` → ticket body; includes `slaStatus`
3. `PATCH /api/tickets/:id` past SLA window → burn-rate alert emitted by SLO cron
4. `POST /api/tickets/:id/escalate` → sequential chain advances + `platform.ticket.escalated` audit event + notification fired

### 11.4 WS publisher end-to-end

Integration test drives Inngest event in `apps/web` and asserts WS client in `apps/ws-server/tests/` receives matching frame within 2 seconds.

### 11.5 Doc gate

- `docs/06-sprints/sprint-17-plan.md` committed (this doc)
- `docs/06-sprints/S17_PLAN_MULTI_REVIEW.md` committed
- `docs/06-sprints/sprint-16-delivery-review.md §6` updated with gate `CLEARED` status as each lands
- `docs/04-specs/slo-runbook.md` updated with ml_classifier_timeout threshold + oncall entry
- `apps/web/openapi.yaml` v1.2.x bump with all new endpoints

---

## 12. End-of-Sprint Completion Signal

Sprint 17 is complete when:

- All 9 committed tasks land with passing tests and green CI
- All 5 S17-implementation gates (#2-#6) marked `CLEARED`; Gate #1 calendar status reported
- Case Tracking API reachable + RBAC-guarded + audit-logged
- ws-server publisher path integration-tested end-to-end
- Sprint 17 delivery review written with gate-clearance sign-off
- S18 can commit Epic 5 against a production-enabled and staging-observed Epic 2

---

## 13. Sprint 18 Preview

Sprint 18 picks up Epic 5 Domain Workflows + FA3-02 + the consolidation refactors deferred out of S17.

| Task | SP | Notes |
|---|---|---|
| Crypto live-trading workflow | 5 | Consumes Epic 2 production-enabled safety pipeline |
| HR onboarding workflow | 4 | Sequential chain via S11 HITL primitives |
| MOD-02 interface contracts | 3 | Cross-domain Buy integration contracts |
| FA3-02 budget notifications + HITL escalation (merged) | 3 | Epic 8 residual; Redis-backed dedupe for multi-instance |
| UsageRecord consolidation into `@aptivo/types` | 1 | Cross-package refactor |
| `verifyJwt` shared module for `apps/ws-server` | 1 | Parallel verifier consolidation |
| Safety threshold tuning (ml_classifier_timeout, anomaly) | 2 | Based on staging observation data from S17 |
| Production flag flips for `ml-injection-classifier`, `anomaly-blocking`, `ws-server-enabled` | 0 | Calendar item, not SP work |

**S18 target**: ~19 SP, comfortably inside Phase 2 sustained velocity. S19 contingency absorbs any slip.
