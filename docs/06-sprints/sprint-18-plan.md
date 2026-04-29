# Sprint 18 Plan — Operational Closure + Epic 5 Domain Workflows

**Sprint duration**: 6 days
**Total Story Points**: 26 SP (8 task threads — counting C1 cleanup bundle as one with 4 sub-threads); re-verified across two multi-model review rounds (see [`S18_PLAN_MULTI_REVIEW.md`](./S18_PLAN_MULTI_REVIEW.md))
**Tracks**: Senior 10 SP (A1 actor + B1 Crypto live-trade + C1a verifyJwt) / Web Dev 1 8 SP (B2 HR onboarding + C1b/c/d cleanup) / Web Dev 2 8 SP (A2 ws-server multi-instance + B3 budget notifications + B1 pair-review buffer)
**Prev sprint**: S17 (`sprint-17-plan.md`, `sprint-17-delivery-review.md`) — Epic 4 production-ready; Gates #4 + #5 cleared; Gates #2/#3 contract layer + Gate #6 single-instance; Item #2 HR PII bulk-read carry-forward
**Next sprint**: S19 contingency (MOD-02 + production flag-flip calendar)
**Phase**: **Phase 3 Sprint 4 of 4** (S15-S18 + S19 contingency) — last planned Phase 3 backend sprint; Phase 3.5 UI track starts S20

---

## 1. Sprint Goal

Close S17's operational debt **and** ship Epic 5 (Crypto live-trading + HR onboarding) so Phase 3 backend exits with the safety stack production-observable. Front-load actor-propagation work because Epic 5 workflow LLM steps must be born actor-stamped — without that, B1's S17 contract layer + B3's S17 baseline are silently inert in production.

S17 cleared Gates #4 and #5 cleanly, shipped Gate #6 single-instance, and delivered Epic 4 Case Tracking. **What's still required for production GO/NO-GO on `anomaly-blocking` and multi-instance ws-server scaling is Sprint 18 work.** S18's deliverable is an API-complete, production-observable platform ready for Phase 3.5 UI consumption.

**User decisions cemented before sprint kickoff (via AskUserQuestion 2026-04-28)**:
1. **D1** — ws-server multi-instance: TCP Redis + Streams (per-instance consumer groups). New vendor surface; ADD §1.2 must reflect.
2. **D2** — HR PII bulk-read instrumentation merged into HR onboarding (Task B2). Endpoints don't exist yet; instrument from day one.
3. **D3** — MOD-02 deferred to S19. MOD-01 deliverable not located in the codebase; can't validate against an absent contract.

Epic 5's MOD-02 + S17 carry-forward (per-tenant escalation chain config + ticket SLA admin UI) explicitly defer to S19/Phase 3.5.

---

## 2. Sprint 18 Baseline (What Exists After S17)

| Component | Current state (end of S17) | S18 target |
|---|---|---|
| LLM gateway actor resolution | Contract layer shipped (`CompletionRequest.actor`, `GatewayDeps.resolveActor`); `services.ts:678` binds `resolveActor: () => undefined`; **3 of 5 workflow `gateway.complete()` calls pass `userId: 'system'`** AND several workflow audit emitters set `actor.type='workflow'`/`'system'` instead of `'user'` (`hr-contract-approval`, `hr-candidate-flow`, `crypto-paper-trade`, `demo-workflow`); `crypto-security-scan.ts` is the only fully-correct callsite | Workflow steps stamp `request.actor` via new `resolveWorkflowActor` helper + `completeWorkflowRequest` typed wrapper; workflow `emitAudit()` calls set `actor.type='user'` when a user is in scope; CI grep gate prevents bare `gateway.complete()` in workflow files; anomaly aggregate query matches non-zero `audit_logs.user_id` rows |
| HR PII bulk-read audit | `auditPiiReadBulk`/`auditPiiReadExport` exist at `packages/audit/src/middleware/pii-read-audit.ts`; `withPiiReadAudit` HOF emits `pii.read` (NOT `pii.read.bulk`/`pii.read.export`); HR list/export endpoints don't exist yet | HR onboarding (B2) creates `/api/hr/{candidates,employees,contracts}` + `/export` variants; route handlers call `auditPiiReadBulk(...)` and `auditPiiReadExport(...)` directly inside handlers (after computing the response) |
| ws-server multi-instance scaling | Upstash list+polling LPUSH/RPOP — single-consumer per item; thin `WsPublisherRedis`/`WsSubscriberRedis` interfaces make transport swappable; tests use in-memory stub | TCP Redis + Streams (XADD producer + XREADGROUP consumer with **per-instance consumer groups** — `ws-instance-<WS_INSTANCE_ID>`) — every ws-server instance receives every event via its own group cursor; `ioredis` as `optionalDependency`; transport selected via `WS_TRANSPORT_MODE=list\|dual\|streams` env (dual-write + dual-read default during 24h cutover window); S17 list+polling fallback preserved for `mode=list` |
| Crypto live-trading | Paper-trade scaffold at `apps/web/src/lib/workflows/crypto-paper-trade.ts` (signal → LLM analyze → risk → HITL quorum → paper execute); `exchange: 'paper'` hardcoded; no live exchange MCP, no SL/TP exit monitoring, no daily-loss circuit breaker | New `crypto-live-trade.ts` + exchange MCP adapter contract (`executeOrder` + `getCurrentPrice` + batch `getCurrentPrices`) + `crypto_positions` state + 30s position monitor cron + daily-loss `CircuitBreakerService` per FR-CRYPTO-RISK-002 |
| HR onboarding | Candidate state machine ends at `hired`; contract state machine ends at `signed` (currently emits `hr/contract.approved`); no onboarding workflow defined; `packages/types/src/events/hr.ts` does not exist | New `hr-onboarding.ts` triggered on `candidate.hired`/`hr.contract.signed`: account provisioning, document collection task list, manager assignment, HITL approval gates; HR list/export endpoints with PII audit; new `packages/types/src/events/hr.ts` |
| FA3-02 budget notifications | `checkBudget` returns `{ allowed, remaining }` or `MonthlyBudgetExceeded`; no notification hook; HITL sequential-chain unintegrated | `BudgetNotificationService` wraps `checkBudget` results, fires `getNotificationAdapter()`; HITL escalation triggered on threshold breach; **Redis SET dedupe** (NOT in-memory ring) keyed on `{deptId, period, threshold}` |
| Cleanup carry-forward | `verifyJwt` parallel impls (web + `apps/ws-server/src/auth.ts`); `UsageRecord` duplicate definitions; ticket escalation `notifications: undefined` (`services.ts:1469-1488`); HITL `approval-sla-service` stub at `services.ts:990-1003` returns `[]` | `verifyJwt` consolidated to shared package; `UsageRecord` in `@aptivo/types`; ticket escalation notifications wired with same Redis-SET dedupe; `approval-sla-service` real impl via `policyType` join through `approvalPolicies` |

---

## 3. Task Breakdown

### Phase A — Operational closure of S17 contract layer (Days 1-3, critical path)

---

#### S18-A1: Workflow → User Actor Propagation

**Estimate**: 3 SP
**Owner**: Senior
**Priority**: P0 — critical path
**Unlocks**: Gates #2/#3 production paths from `sprint-17-delivery-review.md §6` (B1's contract layer becomes operationally observable)
**Dependencies**: none for impl; sequences before B1/B2 final actor wiring (B1/B2 scaffolding starts Day 1 against stubbed wrapper interfaces)

**Description**: TWO surfaces both contribute to anomaly-gate observability and must be fixed in lockstep:
1. **LLM gateway callsites** (5 across 4 workflow files): pass `actor` to `CompletionRequest` so `llm_usage_logs.userId` is populated.
2. **Workflow audit emitters** (`emitAudit()` calls in the same 4 files): set `actor.type='user'` with the resolved `userId` so `audit_logs.user_id` is populated. **The anomaly gate's aggregate query reads `audit_logs.user_id`, not `llm_usage_logs.userId`** — without the audit-emitter fix, A1 doesn't actually close Gates #2/#3 even if the gateway plumbing is perfect (post-Codex review).

`crypto-security-scan.ts` is the reference for both surfaces — emits audit with `actor.type: 'user'` and propagates `requestedBy` from Inngest event context. Generalize this pattern.

**Cross-step actor mutation policy**: when an authenticated user (e.g., HITL approver) interacts with a system-triggered workflow, downstream LLM and audit emits stamp the *approver's* `userId` going forward — both initiating-system and acting-user audit rows are kept; anomaly aggregate matches the acting user's bulk-access pattern. Tested explicitly.

**Compile-time enforcement**: introduce `completeWorkflowRequest({ gateway, actor, request })` wrapper that takes `ActorContext` as a *required* parameter; workflow files use this wrapper exclusively, never bare `gateway.complete()`. CI grep gate fails the build if `gateway.complete(` appears in any workflow file (non-test paths). Replaces reviewer-discipline-only enforcement.

**Files to create**:
- `apps/web/src/lib/llm/resolve-workflow-actor.ts` — pure helper accepting `{ requestedBy?, fallbackDepartmentId? }`, returns `ActorContext | undefined`
- `apps/web/src/lib/llm/complete-workflow-request.ts` — typed wrapper requiring `ActorContext`; workflow files import this, never bare `gateway.complete()`
- `apps/web/tests/llm/resolve-workflow-actor.test.ts`
- `apps/web/tests/llm/complete-workflow-request.test.ts`
- `apps/web/tests/workflows/actor-propagation.integration.test.ts` — drives Inngest event with `requestedBy`, asserts both `llm_usage_logs.user_id` AND `audit_logs.user_id` populated; covers HITL-approver mutation case
- `scripts/lint-workflow-gateway-calls.sh` (or vitest custom rule) — CI gate that greps `apps/web/src/lib/workflows/*.ts` non-test paths for naked `gateway.complete(` and fails on hit
- `packages/types/src/actor.ts` — centralize `ActorType` literal union (`'user' | 'system' | 'workflow'`) so workflow audit emitters + audit-store aggregate query reference the SAME constant (post-Gemini review)

**Files to modify**:
- `apps/web/src/lib/workflows/{hr-contract-approval,hr-candidate-flow,crypto-paper-trade,demo-workflow}.ts` — TWO threads per file: (a) all `gateway.complete()` calls become `completeWorkflowRequest({ ..., actor })`; (b) all `emitAudit()` calls stamp `actor.type='user'` with the resolved `userId` when a user is in scope (initiator or HITL approver)
- `apps/web/src/lib/services.ts:678` — annotate fallback intent (workflow callsites bypass; HTTP callers consume via `requireLlmContext`)
- Event payload schemas in `packages/types/src/events/*` — add optional `requestedBy: { userId, departmentId? }` field where missing
- `package.json` scripts + CI workflow YAML — add the workflow-gateway-call lint as a pre-merge gate

**Acceptance criteria**:
- [ac] All 5 workflow `gateway.complete()` calls go through `completeWorkflowRequest({ ..., actor })`; bare `gateway.complete()` removed from `apps/web/src/lib/workflows/*` non-test paths
- [ac] CI grep gate green: zero hits of `gateway.complete(` in workflow files
- [ac] All workflow `emitAudit()` calls set `actor.type='user'` when a user is in scope (initiator, HITL approver, or downstream user step)
- [ac] Integration test asserts `aggregateAccessPattern({ actor: { userId, ... } })` returns non-zero counts after a workflow run
- [ac] Integration test: HITL-approver acts on a system-triggered workflow → downstream LLM + audit rows attribute to approver's `userId`
- [ac] `getSpendReport(deptId, range).coverageLevel === 'full'` after any workflow LLM step lands
- [ac] Anomaly gate integration test: 50 PII-bulk audit events from same `userId` across workflow steps in window → `{ action: 'block' }`
- [ac] No regressions in S17 anomaly/usage tests
- [ac] `ActorType` union centralized in `@aptivo/types`; workflow emit sites + aggregate query both import from same source

**TDD micro-tasks**:
1. Red/Green: `resolveWorkflowActor({ requestedBy: { userId: 'u1' } })` returns `ActorContext` with `userId='u1'`, `type='user'`
2. Red/Green: `resolveWorkflowActor({})` (no requestedBy) returns `undefined`
3. Red/Green: `completeWorkflowRequest` requires `actor: ActorContext` parameter — compile fails when omitted (tsc error)
4. Red/Green: `completeWorkflowRequest({ gateway, actor, request })` calls `gateway.complete(request)` with `actor` stamped
5. Red/Green: `crypto-paper-trade.ts:74` LLM call uses `completeWorkflowRequest`; `actor.type='user'` when `requestedBy` present in event
6. Red/Green: `hr-contract-approval.ts:60,110` LLM calls both use `completeWorkflowRequest`; second-step (compliance-check) gets the same `actor` as first-step (draft)
7. Red/Green: `hr-candidate-flow.ts:57` external-trigger event `hr/application.received` has no `requestedBy` → `actor.type='system'` documented inline
8. Red/Green: `demo-workflow.ts:103` LLM call uses `completeWorkflowRequest`; existing `requestedBy` propagation preserved
9. Red/Green: workflow audit emitters in 4 files now use `actor.type='user'` when user in scope
10. Red/Green: CI grep gate script exits non-zero when staged change adds `gateway.complete(` to any workflow file
11. Red/Green: integration — workflow run ends with non-NULL `audit_logs.user_id` and non-NULL `llm_usage_logs.user_id` for `actor.type='user'` rows
12. Red/Green: HITL-approver mutation — system-triggered workflow + HITL approve → downstream audit + LLM rows attribute to approver

**Risks**: cross-step actor mutation correctness (test the HITL-approver case explicitly); CI grep gate false-positives if test fixtures use `gateway.complete()` in mocks (limit gate scope to `lib/workflows/` non-test paths).

---

#### S18-A2: ws-server Multi-Instance Scaling (TCP Redis + Streams)

**Estimate**: 3 SP
**Owner**: Web Dev 2
**Priority**: P0 — Phase 3.5 UI-F dependency
**Unlocks**: Gate #6 multi-instance carry-forward; horizontal-scale of `apps/ws-server`
**Dependencies**: TCP Redis provisioning (DevOps lead-time — flag in week 1 standup)

**Description**: Switch the publisher/subscriber transport to TCP Redis (Railway or DO managed) using `ioredis`. **Each ws-server instance gets its OWN consumer group**, NOT a shared one — Redis Streams' `XREADGROUP` with a shared group is *work distribution*, the opposite of broadcast fan-out (post-Codex round-1 finding). Per-instance consumer groups give every instance its own cursor; XADD writes once and every group reads it.

Specifically:
- **Publisher** (`apps/web` Inngest function): `XADD ws:events MAXLEN ~ 50000 * eventFrame <json>` — single writer, single stream, retention bounded
- **Subscriber** (each `apps/ws-server` instance): on boot, creates a per-instance consumer group `ws-instance-<WS_INSTANCE_ID>` against `ws:events` (with `MKSTREAM` flag). Polls via `XREADGROUP GROUP ws-instance-<id> consumer-default COUNT n BLOCK 100 STREAMS ws:events >`. On crash, relaunched instance recreates the group from `$` (skip backlog) — no `XAUTOCLAIM` because we don't share work; lost-during-crash events accept the same trade-off as S17.

**Cutover plan (post-Codex round-1)**: NOT env-flag-selected one-or-the-other. Default to **dual-write + dual-read** for a 24-hour transition window with shared Redis-SET dedupe by `eventId` (1h TTL — already-bounded dedupe window from S17 ring). Sequence: `WS_TRANSPORT_MODE=list` → `dual` → `streams` flipped by ops at deploy time. Flag-day cutover (β) documented as fallback if dual-write proves complex.

Thin `WsPublisherRedis`/`WsSubscriberRedis` interfaces (preserved through S17) make this a transport swap, not a redesign. In-memory test stub preserved — adapter swappable via DI.

**Files to create**:
- `packages/redis/` (new shared package) — `ioredis` wrapper exporting `createTcpRedis(opts)` returning typed client; barrel exports
- `apps/web/src/lib/inngest/functions/ws-event-publisher-streams.ts` — XADD publisher with `MAXLEN ~ 50000`; ESM-import-safe pattern from S17 ws-server bootstrap
- `apps/ws-server/src/streams-subscriber.ts` — per-instance-group XREADGROUP consumer; group name from `WS_INSTANCE_ID` env var (or process-stable hash if env missing)
- `apps/ws-server/src/redis-dedupe-store.ts` — shared `Set ws:dedupe:<eventId> 1 EX 3600` for cross-transport dedupe during cutover window
- `apps/ws-server/tests/streams-subscriber.test.ts` — multi-instance fan-out test: two consumer-group instances both receive the SAME event
- `apps/ws-server/tests/streams-publisher.integration.test.ts` — round-trip with stubbed XADD/XREADGROUP per-group
- `apps/ws-server/tests/dual-transport-dedupe.test.ts` — events arriving via both list (RPOP) and streams (XREADGROUP) during cutover dedupe by `eventId` exactly once

**Files to modify**:
- `apps/web/src/app/api/inngest/route.ts` — register streams publisher; **dual-write** by default during cutover window controlled by `WS_TRANSPORT_MODE=streams|dual|list` env
- `apps/ws-server/src/index.ts` — async bootstrap selects subscriber by `WS_TRANSPORT_MODE`; in `dual` mode runs BOTH list-poller and streams-consumer with shared dedupe store
- `apps/ws-server/package.json` — add `ioredis` as `optionalDependency`
- `docs/03-architecture/platform-core-add.md §1.2` — new vendor row for TCP Redis (DO managed or Railway), rationale + alternatives + reversibility per `evolving-docs` skill
- `docs/06-operations/01-runbook.md` — new section: ws-server scaling, per-instance consumer groups, cutover sequence (`list` → `dual` → `streams`), lagged-consumer detection via `XLEN`/`XPENDING`, consumer-group cleanup ops procedure

**Acceptance criteria**:
- [ac] Two ws-server instances with DIFFERENT `WS_INSTANCE_ID` against same TCP Redis stream — both receive every event (true broadcast fan-out via per-instance consumer groups)
- [ac] Dual-transport mode: events published via both list and streams arrive at subscriber and dedupe to exactly one fan-out per `eventId` (Redis SET-based dedupe)
- [ac] Single-instance back-compat: `WS_TRANSPORT_MODE=list` falls back to S17 path with no behavioural change
- [ac] Stream retention bounded via `MAXLEN ~ 50000` — old events don't accumulate
- [ac] Integration test asserts no duplicate fan-out across instance restart in `streams` mode; events published while instance is down are intentionally not replayed (per-instance group recreated from `$` on restart)
- [ac] Per-instance consumer group cleanup: documented runbook procedure to remove abandoned `ws-instance-<id>` groups (S19 hardening)
- [ac] ESM dynamic-import pattern from S17 preserved for `ioredis` (optional dep, targeted error on `MODULE_NOT_FOUND`)
- [ac] ADD §1.2 vendor row for TCP Redis added per `evolving-docs` vendor-commitment-sync rule

**TDD micro-tasks**:
1. Red/Green: `createTcpRedis({ url, ... })` returns typed `ioredis` client; ESM dynamic import handles missing dep gracefully
2. Red/Green: streams publisher: `XADD ws:events MAXLEN ~ 50000 * eventFrame <json>` succeeds against in-memory stub
3. Red/Green: streams subscriber: per-instance-group `XREADGROUP ws-instance-A consumer-default COUNT 32 BLOCK 100 STREAMS ws:events >` returns published events
4. Red/Green: TWO subscriber instances with `WS_INSTANCE_ID=A` and `B` both receive the SAME XADD'd event (broadcast fan-out — the actual fix verification)
5. Red/Green: `WS_TRANSPORT_MODE=list` invokes S17 path unchanged; existing tests pass
6. Red/Green: `WS_TRANSPORT_MODE=dual` invokes both list-poller AND streams-consumer in parallel
7. Red/Green: dual-mode dedupe: same `eventId` published via list+streams arrives at subscriber once after fan-out (Redis SET dedupe)
8. Red/Green: `WS_TRANSPORT_MODE=streams` skips list path entirely
9. Red/Green: instance restart in `streams` mode — relaunched instance recreates group from `$`; events published while down are NOT replayed; events published after restart ARE
10. Red/Green: consumer-group cleanup procedure: ops command via `XGROUP DELETE` removes abandoned `ws-instance-<id>` groups
11. Red/Green: ADD §1.2 row added for TCP Redis with rationale + alternatives (doc-lint test asserts row presence)

**Risks**: TCP Redis provisioning is calendar-gated (DevOps lead-time); cutover semantics during transition (some publishers on Upstash REST, some on TCP — dedupe ring at subscriber must work across transports); per-instance consumer group registry leak if instances die without cleanup (bounded by deployed count ~10 max — S19 hardening).

**Calendar dependency**: TCP Redis provisioning by Day 3. If not provisioned by Day 3, escalate or fall back to deferring A2 (reclaim 3 SP into Cleanup or buffer).

---

### Phase B — Epic 5 Domain Workflows (Days 1-5)

#### S18-B1: Crypto Live-Trading Workflow

**Estimate**: 6 SP *(re-estimated from 5 after multi-model review)*
**Owner**: Senior
**Priority**: P0 — Epic 5 headline; FR-CRYPTO-TRD-001..004 + FR-CRYPTO-RISK-001..003
**Unlocks**: Phase 3 Epic 5 completion
**Dependencies**: A1 wrapper interface ready Day 1 (B1 scaffolds against stub); A1 final actor wiring merges Day 2-3; reuses paper-trade scaffold + multi-approver HITL chain from S11

**Description**: Three live-vs-paper differences:
1. **Real exchange execution** — pluggable exchange MCP adapter contract (impl out-of-scope for S18; in-memory test impl validates the workflow loop)
2. **Position lifecycle** — `crypto_positions` table; entry → SL/TP-monitored hold → exit; 30-second cron polls open positions and closes on SL/TP per FR-CRYPTO-TRD-004
3. **Risk circuit breaker** — daily loss limit per department; breach blocks new entries until next UTC day; reuses `getCryptoExecutionStore` for fill data; per FR-CRYPTO-RISK-002

HITL quorum (already enforced in paper-trade) stays. Live-trading requires explicit `live: true` opt-in per request; audit event records this clearly.

**Files to create**:
- `apps/web/src/lib/workflows/crypto-live-trade.ts` — workflow definition: signal → LLM analyze → risk validate → daily-loss circuit-breaker check → HITL quorum → live execute via exchange MCP → position record
- `packages/database/src/schema/crypto-positions.ts` — `crypto_positions` (id UUID, signalId UUID FK, departmentId UUID FK, entryPrice NUMERIC, sizeUsd NUMERIC, slPrice NUMERIC, tpPrice NUMERIC, openedAt, closedAt nullable, exitReason ENUM['sl','tp','manual'])
- Drizzle migration up + down
- `packages/database/src/adapters/crypto-position-store-drizzle.ts`
- `apps/web/src/lib/jobs/crypto-position-monitor.ts` — Inngest cron, 30s schedule, polls open positions, evaluates current price vs SL/TP, fires exit
- `apps/web/src/lib/crypto/exchange-mcp-adapter.ts` — adapter contract with `executeOrder(...)` + `getCurrentPrice(symbol)` + batch `getCurrentPrices(symbols: string[])` (post-Gemini review: cron may monitor many positions; batch read avoids rate-limiting against real venues post-S18) + in-memory test impl returning deterministic price walks
- `apps/web/src/lib/crypto/daily-loss-circuit-breaker.ts` — `CircuitBreakerService` reading from `getCryptoExecutionStore`
- `apps/web/tests/{workflows/crypto-live-trade,jobs/crypto-position-monitor,crypto/daily-loss-circuit-breaker}.test.ts`
- `packages/types/src/events/crypto.ts` — append new B1 events (`crypto.position.opened`, `crypto.position.closed`, `crypto.trade.live-executed`); create file if not present

**Files to modify**:
- `apps/web/src/lib/services.ts` — `getCryptoLiveTradeWorkflow()`, `getCryptoPositionStore()`, `getDailyLossCircuitBreaker()` lazy getters
- `apps/web/src/lib/inngest.ts` — register `crypto-position-monitor` cron
- `apps/web/openapi.yaml` — v1.2.x bump for any new admin endpoints (manual position close, circuit-breaker override)
- `packages/database/src/schema/index.ts`, `packages/database/src/adapters/index.ts` — barrel exports

**Acceptance criteria**:
- [ac] Live-trade workflow completes with `live: true` only after HITL quorum approve
- [ac] Daily-loss circuit breaker blocks new entries when threshold breached; resets at UTC day rollover
- [ac] Position monitor cron fires every 30s, closes positions on SL/TP cross via `getCurrentPrice`/`getCurrentPrices`
- [ac] Exchange MCP adapter contract has in-memory impl; real venue impl deferred to post-S18 (AD-S18-4)
- [ac] Audit event `crypto.trade.live-executed` records `live: true`, `requestedBy`, exchange ID, fill price
- [ac] `actor.type='user'` on every workflow LLM step (verifies A1 propagation); `audit_logs.user_id` populated end-to-end
- [ac] HITL approver UX surfaces `live: true` clearly (existing paper-trade prompt shape extended; test asserts)
- [ac] Drizzle migration reversible

**TDD micro-tasks**:
1. Red/Green: `crypto_positions` schema migration creates table + reverse-migration drops it
2. Red/Green: `createDrizzlePositionStore(db).create({ ... })` persists row
3. Red/Green: `createDailyLossCircuitBreaker({ executionStore })` returns `{ allowed: false, reason: 'daily-loss-exceeded' }` when window losses > threshold
4. Red/Green: circuit breaker resets at UTC day rollover (test pins clock)
5. Red/Green: `createInMemoryExchangeMcp()` adapter implements all 3 methods (`executeOrder`, `getCurrentPrice`, `getCurrentPrices`)
6. Red/Green: position monitor cron polls open positions every 30s; closes when current >= TP or <= SL
7. Red/Green: position close emits `crypto.position.closed` event with `exitReason`
8. Red/Green: live-trade workflow requires `live: true` in request; refuses without it
9. Red/Green: HITL quorum approve in live-trade workflow → `executeOrder` invoked once + position created
10. Red/Green: HITL quorum reject → no execution; audit event `crypto.trade.rejected`
11. Red/Green: live-trade workflow LLM step uses `completeWorkflowRequest({ ..., actor })` (A1 dependency)
12. Red/Green: integration — full workflow ends with `audit_logs.user_id` populated for `actor.type='user'`

**Risks**: out-of-scope creep (real exchange MCP impl is *not* in S18 — reviewer hard-stop per AD-S18-4); position monitor DST/timezone (SL/TP prices are venue-quoted in UTC; daily-loss reset at UTC day — test explicitly); HITL approver UX (paper-trade prompt shape must change to surface `live: true` clearly so approvers don't mistake it for paper).

---

#### S18-B2: HR Onboarding Workflow + PII Audit Endpoints

**Estimate**: 4 SP *(absorbs S17 carry-forward Item #2 per D2)*
**Owner**: Web Dev 1
**Priority**: P0 — Epic 5 + closes Item #2
**Unlocks**: Phase 3 Epic 5 completion + HR PII audit (closes anomaly-gate inert-on-HR-scope state)
**Dependencies**: A1 wrapper interface ready Day 1 (B2 scaffolds against stub); A1 final actor wiring merges Day 2-3

**Description**: Two threads merged. Onboarding workflow triggers on `candidate.hired` or `hr.contract.signed` (final names — see Trigger-model corrections below).

**Trigger-model corrections (post-Codex review)**:
- `candidate.hired` event does NOT exist today — must be added; `hr-candidate-flow.ts` extended to emit it at the `hired` terminal.
- Contract flow currently emits `hr/contract.approved`, NOT `signed`. Introduce a separate `hr.contract.signed` event for the actual signed terminal (semantic clarity over reuse).
- `packages/types/src/events/hr.ts` does NOT exist — this task creates the file.
- **Idempotency rule**: `hr_onboarding` table has unique constraint `(candidateId)`; if both `candidate.hired` and `contract.signed` fire for the same candidate, the second trigger detects the existing onboarding row and resumes/no-ops rather than starting a duplicate workflow.

**PII audit middleware correction (post-Codex review)**: `withPiiReadAudit()` from `packages/audit/src/middleware/pii-read-audit.ts` emits `action: 'pii.read'`, NOT `pii.read.bulk` or `pii.read.export`. The list/export endpoints must call `auditPiiReadBulk(...)` and `auditPiiReadExport(...)` directly inside route handlers (after the response is computed) — the HOF wrapper is the wrong tool.

Onboarding state: `pending → docs_collected → manager_assigned → approved → onboarded` (AD-S18-5: minimal viable; FRD doesn't formally define). HITL approval gate before account provisioning (manager + HR head). Consent enforcement (FR-HR-CM-005) on PII access — `requireConsent` guard in front of read paths, with self-access exemption.

**Retry/restart semantics**: each step is durable (Inngest `step.run`); if a step fails mid-execution, Inngest retries the step (not the whole workflow) — onboarding state column annotated with `lastStepFailedAt` so admin UI (Phase 3.5) can surface stuck workflows.

**Files to create**:
- `apps/web/src/lib/workflows/hr-onboarding.ts` — workflow definition triggered on `candidate.hired`/`hr.contract.signed`
- `packages/database/src/schema/hr-onboarding.ts` — onboarding state + task checklist tables; unique `(candidateId)`; `lastStepFailedAt` column; Drizzle migration up + down
- `packages/database/src/adapters/hr-onboarding-store-drizzle.ts`
- `apps/web/src/app/api/hr/candidates/route.ts`, `apps/web/src/app/api/hr/employees/route.ts`, `apps/web/src/app/api/hr/contracts/route.ts` — list + export endpoints; route handlers call `auditPiiReadBulk(actor, resourceType, recordCount)` (list) and `auditPiiReadExport(actor, resourceType, recordCount, format)` (export) directly **after computing the response** (NOT via `withPiiReadAudit` HOF)
- `apps/web/src/app/api/hr/onboarding/[id]/route.ts` — onboarding state read + task update endpoints
- `apps/web/src/lib/hr/require-consent.ts` — middleware enforcing FR-HR-CM-005
- `apps/web/tests/workflows/hr-onboarding.test.ts`
- `apps/web/tests/api/hr/pii-audit.integration.test.ts` — asserts `pii.read.bulk` + `pii.read.export` events emitted on list/export hits
- `packages/types/src/events/hr.ts` (new file) — `hr.onboarding.started`, `hr.onboarding.completed`, `candidate.hired`, `hr.contract.signed` event schemas

**Files to modify**:
- `apps/web/src/lib/services.ts` — `getHrOnboardingService()`, `getHrCandidateStore()` (if missing) lazy getters
- `apps/web/src/lib/workflows/hr-candidate-flow.ts` — add `candidate.hired` emit at terminal state (does NOT exist today); trigger onboarding workflow
- `apps/web/src/lib/workflows/hr-contract-approval.ts` — emit new `hr.contract.signed` event at terminal (currently emits `hr.contract.approved`); trigger onboarding workflow with idempotency check on `candidateId`
- `apps/web/openapi.yaml` — v1.2.x bump for HR endpoints + RFC 7807 error shapes
- `apps/web/src/lib/services.ts` (B1's `DOMAIN_AUDIT_SCOPE` comment from S17-B1) — update HR mapping comment from "inert until endpoints exist" to "wired"

**Acceptance criteria**:
- [ac] Onboarding workflow fires on `candidate.hired` or `hr.contract.signed`; runs to terminal `onboarded` state
- [ac] HITL approval gate before account provisioning (manager + HR head)
- [ac] Idempotency: second trigger for same `candidateId` resumes existing onboarding row, doesn't create duplicate
- [ac] PII audit events `pii.read.bulk` and `pii.read.export` emitted on every list/export hit (anomaly gate now matches non-zero rows for HR scope)
- [ac] Consent enforcement: missing consent → RFC 7807 403 with `type='/errors/consent-required'`; self-access exemption tested
- [ac] All workflow LLM steps carry `actor.type='user'` from A1 (verifies dependency)
- [ac] Onboarding state column `lastStepFailedAt` set when Inngest step retry exhausts
- [ac] ≥80% coverage on new code; no regressions in S17 HR tests

**TDD micro-tasks**:
1. Red/Green: `packages/types/src/events/hr.ts` exports `candidate.hired`, `hr.contract.signed`, `hr.onboarding.started`, `hr.onboarding.completed` schemas
2. Red/Green: `hr_onboarding` schema migration creates table with unique `(candidateId)` + `lastStepFailedAt`; reverse-migration drops it
3. Red/Green: `hr-candidate-flow.ts` terminal step emits `candidate.hired` with `{ candidateId, requestedBy }`
4. Red/Green: `hr-contract-approval.ts` terminal step emits `hr.contract.signed` (not `hr.contract.approved`)
5. Red/Green: onboarding workflow consumes `candidate.hired` → creates onboarding row → fires `hr.onboarding.started`
6. Red/Green: idempotency — second `candidate.hired` for same `candidateId` resumes existing row, returns no-op
7. Red/Green: HITL approval gate before `manager_assigned → approved` transition
8. Red/Green: `auditPiiReadBulk` direct call from `/api/hr/candidates` route emits `action='pii.read.bulk'` audit row
9. Red/Green: `auditPiiReadExport` direct call from `/api/hr/candidates/export` emits `action='pii.read.export'`
10. Red/Green: `requireConsent` middleware blocks PII read when no consent record; allows self-access exemption
11. Red/Green: Inngest step retry exhausted → `lastStepFailedAt` populated on onboarding row
12. Red/Green: integration — Crypto-equivalent: full onboarding workflow ends with `audit_logs.user_id` populated for `actor.type='user'` from A1

**Risks**: state machine ambiguity (FRD doesn't formally define onboarding states; AD-S18-5 commits to minimal definition; ratify with FRD owner via doc-only PR week 1); consent enforcement scope (don't block self-access — test the exemption); legacy candidates without onboarding records (endpoints return 404 not 500; nullable FK on onboarding state).

---

#### S18-B3: FA3-02 Budget Notifications + HITL Escalation Wiring

**Estimate**: 3 SP
**Owner**: Web Dev 2
**Priority**: P1 — Epic 8 residual; lands wiring template for C1c
**Unlocks**: Multi-instance-correct budget notifications; HITL chain integration
**Dependencies**: reuses `getNotificationAdapter()` failover pattern; reuses HITL sequential-chain primitive

**Description**: `checkBudget` returns `{ allowed, remaining }` or `MonthlyBudgetExceeded` today; callers must check and notify themselves. On threshold crossings (default 80%, 100%) the budget service emits notifications via the failover adapter; on full exhaustion, escalates through HITL chain (department head → finance lead). Notification adapter exists at `services.ts:326-349`; this task wires it.

**Dedupe semantics (post-Gemini review correction)**: dedupe by `{deptId, period, threshold}` composite key in **Redis SET with TTL** — `SET ws:budget-dedupe:<deptId>:<period>:<threshold> 1 NX EX <period_seconds>`. Persisted across multi-instance apps/web AND across process restarts. Original plan was in-memory ring; reviewers correctly flagged that 3 web instances would each fire the same threshold-breach notification → user-visible spam.

Pattern parallels S17-CT-3 ticket escalation notification — once landed here, C1c replicates the same pattern for ticket escalation.

**Files to create**:
- `packages/budget/src/budget-notification-service.ts` — wraps `checkBudget` results; threshold detection (configurable: default 80%/100%); fires `getNotificationAdapter()`
- `packages/budget/src/budget-hitl-escalation.ts` — wraps HITL sequential-chain; triggers on 100% breach
- `packages/budget/src/redis-dedupe-store.ts` — `SET NX EX` Redis primitive for period-keyed dedupe
- `packages/budget/tests/{budget-notification-service,budget-hitl-escalation,redis-dedupe-store}.test.ts`

**Files to modify**:
- `packages/budget/src/department-budget-service.ts:97-220` — `checkBudget` calls notification service on threshold crossings; HITL escalation triggered on `MonthlyBudgetExceeded` Result
- `apps/web/src/lib/services.ts` — `getBudgetNotificationService()`, `getBudgetHitlEscalation()` lazy getters; wire into `checkBudget` deps; bind session-Redis (existing from S15 split) into the dedupe store
- `apps/web/openapi.yaml` — bump if any new admin override endpoints surface (likely none — wiring is internal)

**Acceptance criteria**:
- [ac] Budget at 80% → single notification per period across **multi-instance** apps/web (Redis SET dedupe with `NX EX`)
- [ac] Budget at 100% → notification + HITL chain triggered (same Redis-keyed dedupe to prevent re-fire on subsequent over-budget calls)
- [ac] HITL approve → temporary increase recorded with audit event `budget.exception.approved`
- [ac] HITL reject → `MonthlyBudgetExceeded` Result preserved; no spend allowed
- [ac] Notification adapter failover (SMTP → Novu) exercised in test
- [ac] Pattern documented inline so C1c (ticket escalation notifications) replicates the **same Redis-keyed dedupe** approach
- [ac] Dedupe key includes `period` (e.g., `2026-04`) so previous month's suppression doesn't block new month

**TDD micro-tasks**:
1. Red/Green: `BudgetNotificationService.fireForBreach({ deptId, threshold: 0.8 })` calls notification adapter once
2. Red/Green: second call within same `period` → Redis SET `NX` returns 0 → no second notification
3. Red/Green: third call in next `period` → new SET key → notification fires
4. Red/Green: `notifyOnWarning: false` config suppresses 80% emission but allows 100%
5. Red/Green: 100% breach fires both notification AND HITL chain start
6. Red/Green: HITL chain approve → `budget.exception.approved` audit event + temporary increase recorded
7. Red/Green: HITL chain reject → `MonthlyBudgetExceeded` preserved; spend blocked
8. Red/Green: SMTP primary → Novu failover when SMTP unavailable
9. Red/Green: dedupe TTL bounded by period seconds; expires correctly after period rollover
10. Red/Green: multi-instance simulation — 3 simulated `apps/web` processes hit threshold concurrently → exactly 1 notification fires (Redis SET NX is the contention point)

**Risks**: Redis SET dedupe key collision (use full `{deptId, period, threshold}` composite); HITL chain selection (fixed `budget-exception` chain for S18, parameterizable post); Redis dependency (use existing session-Redis from S15 split — already provisioned).

---

### Phase C — Cleanup track (Days 3-6, parallel)

#### S18-C1: Cleanup Bundle (verifyJwt + UsageRecord + Ticket Escalation Notifications + approval-sla-service)

**Estimate**: 4 SP *(grew from S17 review's 2-3 estimate; absorbs the carry-forward cluster)*
**Owner**: Web Dev 1 + Senior partial
**Priority**: P1 — closes 4 distinct S17 carry-forward items; reduces tech-debt entropy at Phase 3 exit
**Dependencies**: C1c starts after B3 lands so the Redis-dedupe template is fresh; C1a/b/d independent

**Description**: Four small consolidations grouped to amortize multi-model review overhead. Each sub-thread gets its own commit; the multi-review doc lists per-sub-thread findings + verdicts.

##### C1a — `verifyJwt` consolidation (1 SP, Senior)

ws-server has parallel impl at `apps/ws-server/src/auth.ts:37-74` (jose-based, HS256, `WsAuthClaims` shape). Web-side impl needs to be located in week 1 (likely `apps/web/src/lib/middleware/` or auth helpers). Move both to a new `packages/auth-jwt/` shared package (or re-export through `@aptivo/types/auth`); ws-server + web both import from package. Grep-verify all import sites pre-merge; if surface > 5 files, escalate to standalone task.

**Files**: `packages/auth-jwt/` (new package or `packages/types/src/auth/`); modify `apps/ws-server/src/auth.ts`, web-side verifyJwt locations.

**TDD**: import verification (web + ws-server import from same source); existing tests for both surfaces still pass.

##### C1b — `UsageRecord` consolidation into `@aptivo/types` (1 SP, Web Dev 1)

Duplicate definitions in `@aptivo/llm-gateway` and `@aptivo/database` adapter. S17-B1 deferred this — only field-level coherence required at the time. Now consolidate.

**Files**: `packages/types/src/usage-record.ts` (new); modify `packages/llm-gateway/src/usage/*` + `packages/database/src/adapters/llm-usage-log-store-drizzle.ts` to re-export.

**TDD**: `UsageRecord` defined once; `pnpm typecheck` clean across packages.

##### C1c — Ticket escalation notification adapter wiring (1 SP, Web Dev 1)

`services.ts:1469-1488` has `notifications: undefined` for `getTicketEscalationService`. Wire `getNotificationAdapter()` analogously to B3's budget notifications pattern (C1c starts after B3 lands so the template is fresh). CT-3's contract already accepts the adapter — purely wiring + integration test.

**Dedupe semantics (per AD-S18-6)**: same Redis SET dedupe approach as B3, keyed on `{ticketId, fromTier, toTier, attemptHash}` with TTL bounded by retry policy — NOT in-memory; ticket escalations can fan out from multi-instance apps/web.

**Files**: modify `apps/web/src/lib/services.ts:1469-1488`; reuse `packages/budget/src/redis-dedupe-store.ts` shape (or extract to shared `packages/notifications/dedupe`).

**TDD**: ticket escalation tier change → notification adapter called (mock asserts); dedupe across multi-instance simulation.

##### C1d — HITL `approval-sla-service` real impl (1 SP, Web Dev 1)

Stub at `services.ts:990-1003` returns `[]`. Schema `hitl_requests` has `policyId` (nullable) but no `policyType` column. **Approach (AD-S18-7)**: join through `approvalPolicies` to derive type at query time — avoids migration on a hot table.

**S19 contingency budgeted**: if EXPLAIN ANALYZE shows p99 > 100ms in staging, denormalized `policyType` column path is **explicit S19 work at +1 SP**, not absorbed into S18 C1d. C1d delivers the join-only impl; the column pivot is its own task.

**Files**: modify `apps/web/src/lib/services.ts:990-1003`; query change uses INNER JOIN against `approvalPolicies`.

**TDD**: `approval-sla-service` returns real overdue HITL approvals filtered by policy type (via join), not `[]`; staging EXPLAIN ANALYZE shows p99 < 100ms.

**Acceptance criteria (across C1)**:
- [ac] C1a: ws-server + web import `verifyJwt` from same source; tests for both surfaces pass; no runtime regression
- [ac] C1b: `UsageRecord` defined once in `@aptivo/types`; `pnpm typecheck` clean across packages
- [ac] C1c: ticket escalation tier change → notification adapter called (mock asserts); same Redis-keyed dedupe pattern as B3
- [ac] C1d: `approval-sla-service` returns real overdue HITL approvals filtered by policy type (via join), not `[]`; staging EXPLAIN ANALYZE shows p99 < 100ms

**Risks**: hidden import sites for `verifyJwt` (grep-verify); join performance on C1d (fall-back to column + backfill if >100ms — explicit S19); ticket escalation notification dedupe must work across the same Redis pattern as B3.

---

## 4. Dependency Graph

```
Phase A — critical path (Days 1-3):
  S18-A1 Actor propagation (3 SP, Senior) ─────┐
       └ Day 1: wrapper + helper interfaces ready
       └ Day 2-3: 4 workflow files + audit emitter updates + CI gate
  S18-A2 ws-server multi-instance (3 SP, WD2) ─┤  (independent of A1; gated on TCP Redis provisioning)
                                                │
Phase B — Epic 5 (Days 1-5):                   │
  S18-B1 Crypto live-trade (6 SP, Senior) ←────┤  (Day 1 scaffolding against stubbed wrapper; Day 2-3 cut over to real actor)
  S18-B2 HR onboarding + PII audit (4 SP, WD1) ←── (Day 1 scaffolding + state-machine doc-PR; Day 2-3 cut over to real actor)
  S18-B3 Budget notifications (3 SP, WD2) ←─────── (Day 1; independent; lands Redis-dedupe template for C1c)
                                                │
Phase C — Cleanup (Days 3-6):                  │
  S18-C1 Cleanup bundle (4 SP, WD1+Senior) ─── (C1c depends on B3 dedupe pattern; C1a/b/d independent)
```

Critical path: **S18-B1 (6 SP)** on Senior track. Day 5 merge target. A1 wrapper interface ready Day 1 (early), final actor wiring merges Day 2-3.

---

## 5. Owner Allocation

- **Senior (10 SP)**: A1 (3) + B1 (6) + C1a verifyJwt (1) — single owner for the safety-actor + Crypto live-trade + auth-boundary stream. Codex+Gemini flagged Senior bottleneck risk; mitigation: A1 finishes by Day 2-3, freeing Senior for B1 Days 2-5; WD2 pair-reviews B1 so a single point of failure is observable mid-sprint.
- **Web Dev 1 (8 SP)**: B2 (4) + C1b UsageRecord (1) + C1c ticket notifications (1) + C1d approval-sla (1) + 1 SP buffer
- **Web Dev 2 (8 SP)**: A2 (3) + B3 (3) + ~2 SP B1 pair-review buffer (Senior bottleneck mitigation)

Total: **26 SP** at the upper-mid of the 23-29 SP S15-S17 velocity band. **3 SP headroom** against the 29-SP ceiling for unexpected B1 overage.

---

## 6. Starting Order (Day 1)

**Sequencing correction (post-Codex review)**: B1/B2 can start Day 1 against a stubbed `completeWorkflowRequest` interface; A1 merge unblocks the *final actor wiring*, not the workflow scaffolding.

- **Senior** — start **S18-A1**: build `resolveWorkflowActor` helper + `completeWorkflowRequest` wrapper; add CI grep gate scaffold; update `crypto-paper-trade.ts:74` (the `userId: 'system'` line) as the first concrete callsite. The other 4 callsites land in parallel commits on Day 2-3. **Pair-review B1/B2 stub interfaces on Day 1** so they consume the wrapper from the start (no retrofit).
- **Web Dev 2** — start **S18-A2** week 1 standup: confirm TCP Redis provisioning timeline with DevOps. While provisioning, scaffold `packages/redis/` shared package + the in-memory test stub + the dual-write/dual-read cutover scaffolding. Begin **S18-B3** in parallel — Redis SET dedupe approach uses existing session-Redis (no new infra dependency).
- **Web Dev 1** — start **S18-B2** Day 1 with stubbed `completeWorkflowRequest` calls (interface from Senior pair-review): scaffold `hr-onboarding.ts` workflow + onboarding state machine schema + the new `packages/types/src/events/hr.ts` file. **Doc-only PR Day 1** for the onboarding state machine `pending → docs_collected → manager_assigned → approved → onboarded` to get FRD-owner ratification before workflow code lands. Cut over to real `actor` stamping when A1 merges Day 2-3.

---

## 7. Definition of Done (Cross-Sprint)

- [ ] OpenAPI v1.2.x bumped for every new/changed endpoint (HR list/export/onboarding, crypto live-trade admin if any, budget admin overrides if any)
- [ ] Drizzle migrations + reversibility verified for `crypto_positions`, HR onboarding tables
- [ ] Event schemas added to `@aptivo/types` (`hr.onboarding.*`, `candidate.hired`, `hr.contract.signed`, `crypto.position.*`, `crypto.trade.live-executed`)
- [ ] WebSocket protocol v1.0 unchanged
- [ ] Safe-logger DI in every new package component
- [ ] Feature-flag DI: any new feature-flagged capability accepts `isEnabled: () => boolean`
- [ ] RFC 7807 error responses on all new HTTP routes
- [ ] Admin writes audit-emitting + rate-limited
- [ ] ≥80% test coverage on new code
- [ ] No regressions in S17 test suite (2,434 tests baseline)
- [ ] Per-task multi-model reviews under `S18_*_MULTI_REVIEW.md` (6 docs minimum: A1, A2, B1, B2, B3, C1)
- [ ] Workflow→user actor propagation: integration test asserts non-zero anomaly aggregate against real audit rows
- [ ] CI grep gate (per AD-S18-1) green: zero bare `gateway.complete(` in `apps/web/src/lib/workflows/*` non-test paths
- [ ] ws-server multi-instance: two-instance fan-out integration test green (conditional on TCP Redis provisioning)
- [ ] All four C1 sub-threads (verifyJwt, UsageRecord, ticket escalation notifications, approval-sla) have completion evidence in delivery review
- [ ] **Full-tree typecheck** (not per-package spot-checks) clean — lesson from S17 delivery audit
- [ ] ADD §1.2 vendor table updated for TCP Redis (per `evolving-docs` skill — vendor-commitment-sync)

---

## 8. Architectural Decisions

### AD-S18-1: Actor propagation — explicit per-callsite stamping, compile-time enforced
The `services.ts:678` `resolveActor: () => undefined` fallback is intentionally kept inert. Workflow callsites stamp `request.actor` directly via `resolveWorkflowActor(eventPayload)` and call `completeWorkflowRequest({ ..., actor })` — a typed wrapper that takes `ActorContext` as a *required* parameter, never bare `gateway.complete()`. HTTP callsites stamp via `requireLlmContext` middleware. CI grep gate fails the build if `gateway.complete(` appears anywhere under `apps/web/src/lib/workflows/` non-test paths.

**Why compile-time + CI gate, not reviewer-discipline-only**: a global runtime fallback would silently compensate for missing `requestedBy` plumbing, re-introducing the silent-zero-count bug S17-B1 documented. Reviewer discipline is too weak — `CompletionRequest.actor` is `optional` so workflows can compile cleanly while forgetting the stamping. The wrapper makes the requirement structural; the CI gate makes drift detectable.

### AD-S18-2: ws-server multi-instance via TCP Redis Streams + per-instance consumer groups (D1 cemented)
Switch transport from Upstash REST list+polling to TCP Redis Streams (`ioredis` + XADD producer / XREADGROUP consumer). **Each ws-server instance gets its OWN consumer group** (`ws-instance-<WS_INSTANCE_ID>`) — NOT a shared group. A shared group is *work distribution*, the opposite of broadcast fan-out; per-instance groups give every instance its own cursor against the single stream so XADD writes once and every group reads it.

**Cutover (post-Codex)**: env-flag-selected one-or-the-other transport selection causes event loss during rollout. Default to **dual-write + dual-read** for a 24-hour window with shared Redis-SET-keyed dedupe on `eventId` (1h TTL). Sequence: `WS_TRANSPORT_MODE=list` → `dual` → `streams` flipped by ops at deploy time.

Keep S17 list+polling fallback (`mode=list`) for environments without TCP Redis. New vendor surface — ADD §1.2 must reflect (TCP Redis instance, Railway or DO managed). Alternative considered: per-instance queues with Inngest fan-out — rejected because cardinality is fixed.

### AD-S18-3: MOD-02 deferred to S19 (D3 cemented)
MOD-01 deliverable not located in the codebase; MOD-02 explicitly validates MOD-01's interface contract drafts. Building MOD-02 against an absent contract is speculative. S19 contingency holds it. If MOD-01 surfaces in week 1, can promote MOD-02 from S19 buffer.

### AD-S18-4: Crypto live-trade exchange MCP adapter contract only
S18 ships the *contract* + in-memory test impl. Real venue implementations (Binance, Coinbase, etc.) are S20+ work — they require vendor-specific MCP servers, sandbox credentials, and per-venue compliance review. The workflow proves out end-to-end via in-memory impl; production live-trading flag flips wait for real venue implementations.

### AD-S18-5: HR onboarding state machine — minimal viable definition
HR FRD doesn't formally define onboarding states. S18 commits to: `pending → docs_collected → manager_assigned → approved → onboarded`. HITL gate before `approved`. **Action**: B2 owner gets FRD-owner sign-off via doc-only PR week 1 before workflow code lands.

### AD-S18-6: Budget notification dedupe via Redis SET (post-Gemini)
Dedupe by `{deptId, period, threshold}` composite key in **Redis SET with TTL** — `SET ws:budget-dedupe:<deptId>:<period>:<threshold> 1 NX EX <period_seconds>`. Persisted across multi-instance apps/web AND across process restarts. Reuses existing session-Redis from S15 split. Same persisted-dedupe approach mandated for C1c ticket escalation notifications.

### AD-S18-7: HITL approval-SLA via join, not new column
`hitl_requests` has `policyId` (nullable). Join through `approvalPolicies` to derive policy type at query time. Avoids migration on a hot table. **Pivot to denormalized `policyType` column with backfill is explicit S19 +1 SP work** if join shows >100ms p99 in staging EXPLAIN ANALYZE.

### AD-S18-8: Cleanup bundle as one task (C1)
Four small consolidations bundled into a single owner thread so multi-model review overhead amortizes (1 review doc with per-sub-thread findings + verdicts). Each sub-thread gets its own commit.

---

## 9. Scope Decision

| Item | SP | Decision | Rationale |
|---|---|---|---|
| S18-A1 Workflow → user actor propagation | 3 | **Commit** | Closes Gate #2/#3 production paths; unblocks B1/B2 observability |
| S18-A2 ws-server multi-instance (TCP Streams) | 3 | **Commit** | D1 cemented; closes Gate #6 multi-instance; unblocks Phase 3.5 UI-F |
| S18-B1 Crypto live-trading workflow | 6 | **Commit** *(re-estimated from 5 after multi-model review)* | Epic 5 headline; FR-CRYPTO-TRD-001; +1 SP for dual-method MCP adapter + monitor-cron testability |
| S18-B2 HR onboarding + PII audit endpoints | 4 | **Commit** *(absorbs S17 Item #2)* | Epic 5 + closes carry-forward Item #2; D2 cemented |
| S18-B3 FA3-02 budget notifications + HITL escalation | 3 | **Commit** | Epic 8 residual; lands wiring template for C1c |
| S18-C1 Cleanup bundle | 4 | **Commit** | Closes 4 carry-forward threads; tech-debt at Phase 3 exit |
| MOD-02 interface contract validation | 3 | **Defer → S19** | D3 cemented; MOD-01 deliverable not located |
| Per-tenant escalation chain config table | — | **Defer → Phase 3.5** | Admin UI dependency |
| Per-tenant ticket SLA config admin UI | — | **Defer → Phase 3.5** | UI-track |
| Pre-existing typecheck residuals (S9/10/15) | — | **Re-verify in delivery review** | Most resolved or intentional test patterns; 0.5 SP audit only |
| ws-server Railway/DO TCP Redis provisioning | — | **Calendar (DevOps)** | Ops dependency for A2; flag in week 1 standup |
| C1d → `policyType` column path (if join slow) | 1 | **Defer → S19 contingency** | Explicit +1 SP, not absorbed into C1d |

**Committed**: 26 SP · **Deferred**: ~7 SP to S19 + Phase 3.5

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A1 actor-propagation misses a callsite | Medium | High | Grep verification + integration test asserting non-zero aggregate; reviewer must enumerate all 5 callsites pre-merge; **CI grep gate (per AD-S18-1) prevents future bypass** |
| A1 audit-emitter scope missed (anomaly gate reads `audit_logs.user_id` not `llm_usage_logs.user_id`) | Medium | High | A1 explicitly includes audit-emitter updates in the same 4 workflow files; integration test asserts BOTH `llm_usage_logs.user_id` AND `audit_logs.user_id` populated for `actor.type='user'` rows |
| Cross-step actor mutation (HITL approver mid-system-workflow) | Medium | Medium | Test the HITL-approver case explicitly; document policy in workflow file headers |
| Crypto live-trading depends on A1 actor stamping | High | High | Strict sequencing — A1 wrapper interface ready Day 1 (early); B1 starts Day 1 against stub; final actor wiring Day 2-3 |
| HR onboarding contains PII audit instrumentation | High | Medium | One reviewer must verify both threads (workflow + audit middleware wrap) in same review cycle |
| TCP Redis provisioning slips into Day 3+ | Medium | Medium | Flag in week 1 standup; if not provisioned by Day 3, escalate; fall back to deferring A2 (reclaim 3 SP) |
| Crypto exchange MCP adapter scope creep into real venues | High | High | AD-S18-4 explicit: contract + in-memory only; reviewer hard-stops on real venue implementations |
| HR onboarding state machine ambiguity (not in FRD) | Medium | Medium | AD-S18-5 commits to minimal definition; B2 owner gets FRD-owner ratification via doc-only PR week 1 |
| Daily-loss circuit-breaker DST/timezone bugs | Medium | High | Test explicitly with UTC fixtures; document in PR |
| Budget notification dedupe broken multi-instance | Low | Low | Mitigated by Redis SET dedupe in S18 (AD-S18-6); residual risk is key design + TTL tuning |
| Cleanup bundle hidden import sites surface | Medium | Low | Grep all packages before C1a; if surface > 5 files, split into separate task |
| HITL `approval-sla-service` join performance | Low | Medium | Stage query EXPLAIN ANALYZE before merge; pivot to `policyType` column if p99 > 100ms (explicit S19 +1 SP) |
| Multi-model review cost balloons (8 tasks → 8 reviews) | Medium | Medium | C1 bundle keeps reviews at 6; budget 1.5h/review per task |
| Stakeholder pressure to add MOD-02 mid-sprint | Medium | Medium | AD-S18-3 explicit defer; if MOD-01 located in week 1, promote MOD-02 from S19 buffer |
| S18 = last Phase 3 backend sprint → scope creep into Phase 3.5 UI | Medium | Medium | Phase 3.5 hand-off boundary explicit in roadmap; reviewer rejects UI work |
| Anomaly observation window too short for `anomaly-blocking` flip | Medium | Medium | A1 lands real actor data Day 2-3; **concrete bar in delivery review**: ≥500 actor-stamped audit rows across ≥10 distinct users with zero false-positive blocks over 24h staging window |
| ws-server transport cutover loses events during transition | Medium | High | Dual-write/dual-read default (AD-S18-2); shared Redis-SET dedupe by `eventId` (1h TTL); flag-day cutover available as fallback |
| Per-instance consumer group registry leak (instances die without cleanup) | Low | Low | Bounded by deployed instance count (~10 max); explicit S19 hardening item |
| Onboarding workflow double-start (both candidate.hired + contract.signed fire) | Medium | Medium | Idempotency: unique constraint `(candidateId)` on `hr_onboarding`; second trigger detects existing row and resumes/no-ops |

---

## 11. Critical Files to Create / Modify

**New**:
- `apps/web/src/lib/llm/resolve-workflow-actor.ts`
- `apps/web/src/lib/llm/complete-workflow-request.ts`
- `apps/web/src/lib/workflows/crypto-live-trade.ts`
- `apps/web/src/lib/workflows/hr-onboarding.ts`
- `packages/database/src/schema/crypto-positions.ts`
- `packages/database/src/schema/hr-onboarding.ts`
- `packages/database/src/adapters/crypto-position-store-drizzle.ts`
- `packages/database/src/adapters/hr-onboarding-store-drizzle.ts`
- `apps/web/src/lib/jobs/crypto-position-monitor.ts`
- `apps/web/src/lib/crypto/exchange-mcp-adapter.ts`
- `apps/web/src/lib/crypto/daily-loss-circuit-breaker.ts`
- `apps/web/src/app/api/hr/{candidates,employees,contracts}/route.ts`
- `apps/web/src/app/api/hr/onboarding/[id]/route.ts`
- `apps/web/src/lib/hr/require-consent.ts`
- `packages/budget/src/budget-notification-service.ts`
- `packages/budget/src/budget-hitl-escalation.ts`
- `packages/budget/src/redis-dedupe-store.ts`
- `packages/auth-jwt/` (new shared package or `packages/types/src/auth/`)
- `packages/types/src/usage-record.ts`
- `packages/types/src/actor.ts` (centralized ActorType)
- `packages/types/src/events/hr.ts` (new file)
- `packages/redis/` (new shared package)
- `apps/web/src/lib/inngest/functions/ws-event-publisher-streams.ts`
- `apps/ws-server/src/streams-subscriber.ts`
- `apps/ws-server/src/redis-dedupe-store.ts`
- `scripts/lint-workflow-gateway-calls.sh` (or vitest custom rule)
- Drizzle migrations for `crypto_positions`, HR onboarding tables
- Multi-model review docs: `S18_PLAN_MULTI_REVIEW.md`, `S18_A1_MULTI_REVIEW.md`, `S18_A2_MULTI_REVIEW.md`, `S18_B1_MULTI_REVIEW.md`, `S18_B2_MULTI_REVIEW.md`, `S18_B3_MULTI_REVIEW.md`, `S18_C1_MULTI_REVIEW.md`

**Modify (reuse, not rewrite)**:
- `apps/web/src/lib/workflows/{hr-contract-approval,hr-candidate-flow,crypto-paper-trade,demo-workflow}.ts` — actor stamping (A1) + audit emitter `actor.type='user'` updates
- `apps/web/src/lib/services.ts:678` — annotate fallback intent
- `apps/web/src/lib/services.ts:1469-1488` — wire ticket escalation notifications (C1c)
- `apps/web/src/lib/services.ts:990-1003` — approval-sla real impl (C1d)
- `apps/web/src/lib/inngest.ts` — register `crypto-position-monitor`, streams publisher
- `apps/web/src/app/api/inngest/route.ts` — streams publisher registration; dual-write mode
- `apps/ws-server/src/index.ts` — async bootstrap selects streams vs list subscriber by `WS_TRANSPORT_MODE`
- `apps/ws-server/src/auth.ts` — re-export from shared package (C1a)
- `apps/ws-server/package.json` — `ioredis` optionalDependency
- `packages/budget/src/department-budget-service.ts:97-220` — wire notification + HITL escalation (B3)
- `packages/llm-gateway/src/usage/*` — re-export `UsageRecord` from `@aptivo/types` (C1b)
- `packages/database/src/adapters/llm-usage-log-store-drizzle.ts` — re-export `UsageRecord` (C1b)
- `packages/types/src/events/crypto.ts` — append new B1 events (`crypto.position.opened`, `crypto.position.closed`, `crypto.trade.live-executed`); create file if not present
- `apps/web/openapi.yaml` — v1.2.x bump
- `docs/03-architecture/platform-core-add.md §1.2` — TCP Redis vendor row (per `evolving-docs` skill)
- `docs/06-operations/01-runbook.md` — ws-server scaling section + ack semantics
- `package.json` + CI workflow YAML — workflow-gateway-call lint as pre-merge gate
- `packages/database/src/schema/index.ts`, `packages/database/src/adapters/index.ts` — barrel exports

---

## 12. Verification

**How to test end-to-end**:

1. **Unit + integration tests** — `pnpm test` passes across all packages with new tests; `pnpm test:coverage` shows ≥80% on new code; **full-tree** `pnpm typecheck` clean (lesson from S17 delivery audit).

2. **Operational closure (S17 carry-forward)**:
   - **Workflow → user actor propagation**: grep `apps/web/src/lib/workflows/*` for `gateway.complete(` finds zero hits in non-test paths (CI gate); integration test asserts non-zero `aggregateAccessPattern` aggregate; staging SQL query confirms `audit_logs.user_id IS NOT NULL` for ≥80% of LLM-step audit rows over a 24h window.
   - **HR PII bulk-read instrumentation**: hits to `/api/hr/{candidates,employees,contracts}` and their `/export` variants emit `pii.read.bulk` / `pii.read.export` events; anomaly-gate aggregate query confirms HR scope now matches non-zero rows.
   - **ws-server multi-instance**: two ws-server instances against same TCP Redis stream + per-instance consumer groups; integration test asserts both receive every event; staging deployment test confirms client connections to either instance see identical event streams.
   - **Cleanup bundle**: grep confirms `verifyJwt` defined exactly once; `UsageRecord` defined exactly once in `@aptivo/types`; ticket escalation tier change fires notification adapter; `approval-sla-service` returns non-empty list when policy-typed overdue HITL approvals exist.

3. **Epic 5 end-to-end**:
   - **Crypto live-trade**: signal → LLM analyze (with `actor.userId` stamped) → risk validate → daily-loss circuit-breaker check → HITL quorum approve → in-memory exchange MCP execute → position record → 30s monitor → SL/TP exit → audit `crypto.trade.live-executed`.
   - **HR onboarding**: candidate `hired` event → onboarding workflow start → docs collected → manager assigned → HITL approve → state `onboarded` → audit chain.
   - **Budget notification**: department spend at 80% → notification fires once (Redis SET NX); at 100% → notification + HITL chain triggers; HITL approve → exception recorded; HITL reject → spend blocked.

4. **Doc gate verification**:
   - `docs/06-sprints/sprint-18-plan.md` committed
   - `docs/06-sprints/S18_PLAN_MULTI_REVIEW.md` committed (two-round sign-off pattern)
   - 6 per-task multi-review docs (`S18_A1`, `S18_A2`, `S18_B1`, `S18_B2`, `S18_B3`, `S18_C1`)
   - `docs/06-sprints/sprint-17-delivery-review.md §7` updated with carry-forward items marked `CLEARED` (per `evolving-docs` skill)
   - `docs/03-architecture/platform-core-add.md §1.2` updated with TCP Redis vendor row
   - `docs/06-operations/01-runbook.md` updated with ws-server scaling section
   - `apps/web/openapi.yaml` v1.2.x bump

**End state — Sprint 18 completion is signalled when**:
- All 6 committed task threads land with passing tests + green CI + per-task multi-model GO
- CI grep gate (per AD-S18-1) green: zero bare `gateway.complete(` in `apps/web/src/lib/workflows/*` non-test files
- S17 carry-forward items #1, #3 cleanup threads marked `CLEARED` in delivery review (Item #2 absorbed into B2; D3 deferred; multi-instance scaling per D1)
- Crypto live-trade workflow + HR onboarding workflow each demonstrably run end-to-end against in-memory test fixtures
- **`anomaly-blocking` flag flip GO/NO-GO bar (concrete)**: ≥500 actor-stamped audit rows in `audit_logs.user_id` across ≥10 distinct users; zero false-positive `block` decisions in a 24h staging window. SQL query in delivery review.
- ws-server multi-instance fan-out demonstrable in staging: two instances same Redis stream different consumer groups both receive every event over a 1h smoke test
- Phase 3 backend exit: API-complete platform ready for Phase 3.5 UI track at S20

---

## 13. Multi-Model Synthesis Summary

Two rounds of multi-model review (Codex MCP + Gemini PAL clink). Round 1: Codex NO-GO (2 HIGH + 4 MEDIUM + 1 LOW); Gemini GO-conditional (overlapping concerns). Round 2 after fixes applied: GO from both. Full transcripts + lead resolutions in [`S18_PLAN_MULTI_REVIEW.md`](./S18_PLAN_MULTI_REVIEW.md).

**Round 1 — material findings applied**:

| Finding | Reviewer | Fix |
|---|---|---|
| **HIGH** A2 Streams design wrong (XREADGROUP shared group is work-distribution not broadcast) | Codex | Replaced with **per-instance consumer groups** (`ws-instance-<WS_INSTANCE_ID>`). XADD writes once; every group reads it. AD-S18-2 rewritten. |
| **HIGH** A2 cutover env-flag-selected loses events during transition | Codex | Replaced with **dual-write + dual-read** for 24h transition window with shared Redis-SET dedupe by `eventId`. Sequence: `WS_TRANSPORT_MODE=list` → `dual` → `streams`. |
| **HIGH** A1 conflates `gateway.complete(userId)` with audit `actor.type` (anomaly gate reads `audit_logs.user_id` not `llm_usage_logs.user_id`) | Codex | A1 now explicitly includes updating workflow `emitAudit()` calls in 4 files to stamp `actor.type='user'`. Cross-step actor mutation policy documented. |
| **HIGH** B2 PII audit middleware mismatch (`withPiiReadAudit()` emits `pii.read`, not `pii.read.bulk`/`.export`) | Codex | Route handlers call `auditPiiReadBulk` and `auditPiiReadExport` directly inside handlers (after computing response). |
| **MEDIUM** B1 underestimated 5 SP for workflow + schema + cron + circuit breaker + adapter contract | Codex + Gemini | Bumped to 6 SP. Senior 9 → 10 SP, total 25 → 26 SP. Exchange MCP gains `getCurrentPrice` + batch `getCurrentPrices`. |
| **MEDIUM** AD-S18-1 weak gate (reviewer-discipline-only) | Codex + Gemini | Added `completeWorkflowRequest` typed wrapper requiring `ActorContext` + CI grep gate. |
| **MEDIUM** AD-S18-6 in-memory budget dedupe insufficient multi-instance | Gemini | Replaced with Redis SET keyed on `{deptId, period, threshold}` with TTL. Same approach for C1c. |
| **MEDIUM** B2 trigger model incomplete (`candidate.hired` doesn't emit; contract emits `approved` not `signed`; events/hr.ts doesn't exist) | Codex | Added explicit emit additions; new event names; `packages/types/src/events/hr.ts` new file. Idempotency unique-constraint on `(candidateId)`. |
| **MEDIUM** C1d "pivot to column" path not budgeted | Codex | Made S19 column-pivot path explicit at +1 SP, NOT absorbed into S18 C1d. |
| **MEDIUM** Critical path serial sequencing too strict | Codex | B1/B2 start Day 1 against stubbed wrapper; A1 final actor wiring Day 2-3. |
| **LOW** "~4 days of staging" hand-wavy | Codex | Replaced with concrete bar: ≥500 actor-stamped rows across ≥10 distinct users; zero false-positive blocks over 24h. |

**Round 2** — both reviewers GO. Codex residual MEDIUMs (4 doc-consistency cleanups + 3 LOWs from stale text after rewrites) all applied. Gemini independent re-read confirmed corrections + 3 small cleanups (period-keyed dedupe, batch `getCurrentPrices`, centralized `ActorType`) — all applied.

⚠️ **Reviewer-attribution note**: Gemini round-2 response contained a prompt-injection attempt (fake `RESPONSE REQUIRED` claim with bogus continuation_id). Flagged inline and ignored — only legitimate findings applied. Reinforces standing `feedback_honest_reviewer_attribution` workflow preference.

---

## Sprint 19 (Contingency) Preview

If S18 slips:
- MOD-02 interface contract validation (3 SP) — pending MOD-01 location
- Per-tenant escalation chain config (2 SP) — admin-API only; UI in Phase 3.5
- Per-tenant ticket SLA config admin API (2 SP) — admin-API only; UI in Phase 3.5
- Safety threshold tuning post-staging-observation (1 SP)
- C1d → `policyType` column path (1 SP) if join EXPLAIN slow
- Production flag flip calendar items: `anomaly-blocking`, `ml-injection-classifier` (Gate #1 Replicate dependent), `ws-server-enabled` (multi-instance)

S19 budget: 9-12 SP. Comfortably contingency-buffered.
