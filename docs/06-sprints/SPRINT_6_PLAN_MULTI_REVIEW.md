# Sprint 6: Platform Closure & Domain Foundations — Multi-Model Plan Review

**Date**: 2026-03-11
**Reviewers**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview, Codex/GPT
**Theme**: "Close the loop, light the domains"
**Duration**: 2 weeks (Weeks 13-14)
**Total SP**: 26 SP committed (6 carry-forward + 10 domain infra + 8 domain business + 2 documentation)
**Team**: 3 developers (1 Senior, 2 Web Devs)
**Capacity**: ~30 SP (5 SP/dev/sprint historical) — 4 SP buffer for domain unknowns

---

## Executive Summary

Sprint 6 is the transition sprint — closing Sprint 5's carry-forward gaps and establishing the foundation for domain-specific development. The sprint splits into three sequential phases:

1. **Platform Closure** (Days 1-3): Resolve 3 must-fix carry-forwards from Sprint 5's multi-model review + minor tech debt cleanup
2. **Domain Foundation** (Days 4-7): Create domain schemas, store adapters, event schemas, RBAC seeds, and service composition for both Crypto and HR domains
3. **Domain Kickoff** (Days 8-10): Implement one workflow per domain using the newly created infrastructure

INT-02 (Admin Dashboard) and INT-03 (LLM Usage Dashboard) are **deferred to Sprint 7** — dashboards are meaningful only after domain data flows through the system.

---

## Consensus Findings (All 3 Models Agree)

### CF-1: Sprint Duration = 2 Weeks

All models agree Sprint 6 should remain a 2-week sprint (Weeks 13-14), consistent with all prior sprints. No extension needed despite the dual focus.

### CF-2: INT-02 (Admin Dashboard) Deferred to Sprint 7

The admin dashboard bundles approvals, audit log, role management, and cost views. This is too broad for Sprint 6 while carry-forwards and domain infrastructure are the priority. Dashboard becomes useful in Sprint 7 when domain traffic generates data worth viewing.

### CF-3: Domain Infrastructure Is a Blocking Prerequisite

All models (after debate) agree that domain business logic tasks require explicit foundational infrastructure:
- Domain Drizzle schema files in `packages/database/src/schema/`
- Domain store interfaces + adapters in `packages/database/src/adapters/`
- Domain Inngest event schemas composed into `apps/web/src/lib/inngest.ts`
- Domain service composition in `apps/web/src/lib/services.ts`
- Domain RBAC role/permission seeds
- Domain notification template seeds

Without these, domain workflows cannot persist data, fire events, or enforce access control.

### CF-4: D-1 (Demo HITL Fix) = 1 SP

The Sprint 5 review correctly estimated this at 1 SP. The scope is narrow:
1. Replace `crypto.randomUUID()` at `demo-workflow.ts:147` with `hitlService.createRequest()`
2. Update `waitForEvent` match predicate
3. Add `getHitlService()` getter to `services.ts`

Codex initially estimated 4 SP but revised to 1 SP after challenge.

### CF-5: Tech Debt Batch Worth Doing

All models agree the low-effort tech debt items should be batched and resolved:
- Extract shared `DrizzleClient` type to `packages/database/src/adapters/types.ts`
- Fix PII sanitizer `includes()` → exact field name matching in `sanitize-logging.ts`
- Unexport `TransactionalAuditStore` from adapters barrel
- S3 `deleteObject` idempotency fix deferred (not blocking)

---

## Debated Items

### D-1: CF-5 SLO Runtime Integration SP Estimate

**Codex**: 4 SP (includes metrics infrastructure)
**Gemini**: 2 SP
**Claude (Lead)**: 2 SP

**Verdict**: **2 SP**. The SLO evaluators already exist and work (12 tests pass). The remaining work is:
1. Create an Inngest cron function (`slo-evaluate`, every 5m)
2. Write a `collectSloMetrics()` function that queries audit DLQ count, workflow/MCP success counts from stores
3. Call `evaluateAllSlos(metrics)` and log/alert results
4. Register in `route.ts`

The evaluator logic is done — this is pure wiring. 2 SP is appropriate.

### D-2: INT-03 (LLM Usage Dashboard) in Sprint 6 or Sprint 7

**Codex**: Include minimal v1 in Sprint 6 (1-3 SP) — read-only spend page
**Gemini (revised)**: Defer to Sprint 7
**Claude (Lead)**: Defer to Sprint 7

**Verdict**: **Defer to Sprint 7**. Rationale:
- The composition root still uses stub LLM providers (`providers: new Map()`, `modelToProvider: {}`) — there is no real usage data to display
- S2-W12 (LLM spend dashboard) is conceptually the same as INT-03 — consolidate into one task in Sprint 7
- Sprint 6 is already loaded with carry-forwards + domain infrastructure; adding UI dilutes focus
- Sprint 7 will have domain workflows calling real LLM providers → actual data to visualize

### D-3: Domain Infrastructure SP per Domain

**Gemini**: 3 SP per domain + 2 SP shared seeds = 8 SP total
**Codex**: 6 SP per domain = 12 SP total
**Claude (Lead)**: 4 SP per domain + 2 SP shared seeds = 10 SP total

**Verdict**: **4 SP per domain + 2 SP shared = 10 SP total**. Rationale:
- Schema work follows established patterns (copy from existing schema files, adjust columns)
- Store interfaces follow established factory patterns
- Event schemas are type definitions composed into existing Inngest client
- Composition wiring follows `services.ts` lazy getter pattern
- 3 SP (Gemini) underestimates the scope — event schemas + composition wiring + adapter tests add up
- 6 SP (Codex) overestimates — this is pattern replication, not novel architecture

### D-4: Monitoring Extras (S4-W10, T1-W23)

**Codex**: 2 SP explicit (separate tasks)
**Gemini**: Included implicitly
**Claude (Lead)**: 1 SP incremental

**Verdict**: **1 SP incremental** — bundled with CF-5 SLO wiring. S4-W10 (retention failed-run detection) and T1-W23 (notification delivery monitoring) are additional SLO evaluators using the same pattern as the existing 4. The `collectSloMetrics()` function adds 2 more counters; 2 more evaluators follow the existing template. This is incremental work on CF-5, not separate tasks.

S2-W12 (LLM spend dashboard) is functionally identical to INT-03 and deferred to Sprint 7.

---

## Sprint 6 Plan

### Phase 1: Platform Closure (Days 1-3) — 6 SP

| Task ID | Description | SP | Owner | Dependencies |
|---------|-------------|----|-------|--------------|
| **S6-CF-01** | Wire SLO evaluators as Inngest cron function (every 5m). Create `collectSloMetrics()` querying audit DLQ, workflow/MCP success from stores. Add S4-W10 + T1-W23 evaluators. Register in `route.ts`. | 3 | Senior | None |
| **S6-CF-02** | Replace synthetic HITL in demo workflow with real `createRequest()` from `@aptivo/hitl-gateway`. Add `getHitlService()` to `services.ts`. Update `waitForEvent` match. | 1 | Senior | None |
| **S6-CF-03** | Wire body limits into API route handlers via higher-order function (not Edge middleware). Apply to existing POST routes + establish pattern for domain routes. | 1 | Web Dev 1 | None |
| **S6-CF-04** | Tech debt batch: Extract shared `DrizzleClient` type, fix PII sanitizer exact matching, unexport `TransactionalAuditStore`. | 1 | Web Dev 2 | None |

**Files (Phase 1)**:
- Modify: `apps/web/src/lib/observability/slo-alerts.ts` (add 2 evaluators)
- Create: `apps/web/src/lib/observability/slo-cron.ts` (Inngest cron + metrics collector)
- Modify: `apps/web/src/app/api/inngest/route.ts` (register cron)
- Modify: `apps/web/src/lib/workflows/demo-workflow.ts` (real HITL)
- Modify: `apps/web/src/lib/services.ts` (add `getHitlService()`)
- Create: `apps/web/src/lib/security/route-guard.ts` (body limit HOF)
- Create: `packages/database/src/adapters/types.ts` (shared DrizzleClient)
- Modify: `packages/database/src/adapters/*.ts` (import shared type)
- Modify: `packages/database/src/adapters/index.ts` (unexport TransactionalAuditStore)
- Modify: `apps/web/src/lib/security/sanitize-logging.ts` (exact matching)

**Verification**: `pnpm test` across all packages — no regressions.

---

### Phase 2: Domain Foundation (Days 4-7) — 10 SP

| Task ID | Description | SP | Owner | Dependencies |
|---------|-------------|----|-------|--------------|
| **S6-INF-CRY** | Crypto domain infrastructure: Drizzle schema (`crypto-domain.ts`), store interfaces, Drizzle adapters, Inngest event schemas, service composition wiring. | 4 | Senior | Phase 1 |
| **S6-INF-HR** | HR domain infrastructure: Drizzle schema (`hr-domain.ts`), store interfaces, Drizzle adapters, Inngest event schemas, service composition wiring. | 4 | Web Dev 1 + 2 | Phase 1 |
| **S6-INF-SEED** | Shared domain seeds: RBAC roles (`trader`, `recruiter`, `hiring_manager`) + permissions. Notification templates for both domains (`crypto-trade-alert`, `hr-interview-scheduled`, etc.). | 2 | Web Dev 1 | S6-INF-CRY, S6-INF-HR |

**S6-INF-CRY Details** (from `docs/02-requirements/crypto-domain-frd.md`):
- Schema: `monitoredWallets`, `tradeSignals`, `tradeExecutions`, `portfolioStates` tables
- Store interfaces: `WalletStore`, `TradeSignalStore`, `TradeExecutionStore`
- Event schemas: `crypto/signal.created`, `crypto/trade.requested`, `crypto/trade.executed`
- Composition: `getCryptoService()` lazy getter in `services.ts` or `services-crypto.ts`

**S6-INF-HR Details** (from `docs/02-requirements/hr-domain-frd.md`):
- Schema: `candidates`, `applications`, `interviews`, `interviewFeedback` tables
- Store interfaces: `CandidateStore`, `ApplicationStore`, `InterviewStore`
- Event schemas: `hr/application.received`, `hr/interview.scheduled`, `hr/offer.approved`
- Composition: `getHrService()` lazy getter

**S6-INF-SEED Details**:
- RBAC: Insert domain roles + permissions into `userRoles`/`rolePermissions` tables
- Templates: Seed `notificationTemplates` with domain-specific slugs + variables
- MCP: Register domain tool servers in `mcpServers` + `mcpTools` (exchange APIs, Gmail/Calendar)

**Files (Phase 2)**:
- Create: `packages/database/src/schema/crypto-domain.ts`
- Create: `packages/database/src/schema/hr-domain.ts`
- Modify: `packages/database/src/schema/index.ts` (barrel export)
- Create: `packages/database/src/adapters/crypto-stores.ts`
- Create: `packages/database/src/adapters/hr-stores.ts`
- Modify: `packages/database/src/adapters/index.ts` (barrel export)
- Create: `packages/database/tests/s6-inf-crypto.test.ts`
- Create: `packages/database/tests/s6-inf-hr.test.ts`
- Modify: `apps/web/src/lib/inngest.ts` (compose domain events)
- Modify: `apps/web/src/lib/services.ts` (domain service getters)
- Create: `packages/database/src/seeds/` (RBAC + template seeds)

**Verification**: `pnpm -F @aptivo/database test` + `pnpm -F @aptivo/web typecheck`

---

### Phase 3: Domain Kickoff (Days 8-10) — 8 SP

| Task ID | Description | SP | Owner | Dependencies |
|---------|-------------|----|-------|--------------|
| **S6-CRY-01** | Track A: Paper trading workflow skeleton + exchange MCP integration scaffold. Inngest function with LLM analysis → HITL approval → MCP trade execution → audit trail. | 4 | Senior | S6-INF-CRY |
| **S6-HR-01** | Track B: Candidate creation flow + interview scheduling workflow skeleton. Inngest function with resume parsing (LLM) → candidate record → interview scheduling → notification. | 4 | Web Dev 1 + 2 | S6-INF-HR |

**S6-CRY-01 Details**:
- Create: `apps/web/src/lib/workflows/crypto-paper-trade.ts`
  - Step 1: LLM gateway analyzes market signal
  - Step 2: HITL approval for trade (uses real `createRequest()`)
  - Step 3: MCP calls exchange API (paper mode)
  - Step 4: Store execution result + audit trail
- Create: `apps/web/tests/s6-cry-01-paper-trade.test.ts`
- Register in `route.ts`

**S6-HR-01 Details**:
- Create: `apps/web/src/lib/workflows/hr-candidate-flow.ts`
  - Step 1: LLM gateway parses resume
  - Step 2: Create candidate record via store
  - Step 3: Schedule interview → notification
  - Step 4: Audit trail
- Create: `apps/web/tests/s6-hr-01-candidate-flow.test.ts`
- Register in `route.ts`

**Verification**: `pnpm -F @aptivo/web test` — workflow tests pass.

---

### Phase 4: Documentation (Day 10) — 2 SP

| Task ID | Description | SP | Owner | Dependencies |
|---------|-------------|----|-------|--------------|
| **S6-DOC** | Update WARNINGS_REGISTER.md (S4-W10, T1-W23 resolved). Update phase-1-sprint-plan.md Sprint 6 DoD. Update MEMORY.md with Sprint 6 deliverables. Multi-model review. | 2 | All | All tasks |

---

## Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| SLO runtime integration + monitoring extras | 3 | **Commit** | Dead code at runtime — must wire |
| Demo HITL real wiring | 1 | **Commit** | Wrong pattern for domain devs |
| Body limits route guard | 1 | **Commit** | New domain routes need protection |
| Tech debt batch | 1 | **Commit** | Low effort, high cleanup value |
| Crypto domain infrastructure | 4 | **Commit** | Blocking for crypto workflows |
| HR domain infrastructure | 4 | **Commit** | Blocking for HR workflows |
| RBAC + notification seeds | 2 | **Commit** | Blocking for domain access control |
| Crypto paper trading workflow | 4 | **Commit** | Domain kickoff deliverable |
| HR candidate flow workflow | 4 | **Commit** | Domain kickoff deliverable |
| Documentation | 2 | **Commit** | Sprint completion requirement |
| S3 deleteObject idempotency | 0 | **Defer** | Not blocking domain work |
| INT-02 Admin Dashboard | 5 | **Defer → Sprint 7** | Premature — no domain data yet |
| INT-03 LLM Usage Dashboard | 3 | **Defer → Sprint 7** | Stub LLM providers — no real usage data |
| S2-W12 LLM spend dashboard | 0 | **Defer → Sprint 7** | Same as INT-03 |

**Committed**: 26 SP | **Deferred**: 8+ SP

---

## Dependency Graph

```
Phase 1 (Days 1-3):
  S6-CF-01 (SLO cron, 3SP) ─────────────────────────────────────────┐
  S6-CF-02 (HITL fix, 1SP) ─────────────────────────────────────────┤
  S6-CF-03 (Body limits, 1SP) ──────────────────────────────────────┤
  S6-CF-04 (Tech debt, 1SP) ────────────────────────────────────────┤
                                                                     ▼
Phase 2 (Days 4-7):
  S6-INF-CRY (Crypto infra, 4SP) ──┬──→ S6-INF-SEED (Seeds, 2SP) ─┤
  S6-INF-HR (HR infra, 4SP) ───────┘                                │
                                                                     ▼
Phase 3 (Days 8-10):
  S6-CRY-01 (Paper trade, 4SP)   ← depends on S6-INF-CRY + S6-CF-03
  S6-HR-01 (Candidate flow, 4SP) ← depends on S6-INF-HR + S6-CF-03
                                                                     ▼
Phase 4 (Day 10):
  S6-DOC (Documentation, 2SP)    ← depends on all above
```

**Critical path**: S6-CF-01/02 → S6-INF-CRY/HR → S6-INF-SEED → S6-CRY-01/HR-01 → S6-DOC

---

## Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | S6-CF-01 (3), S6-CF-02 (1), S6-INF-CRY (4), S6-CRY-01 (4), S6-DOC (0.5) | 12.5 |
| **Web Dev 1** | S6-CF-03 (1), S6-INF-HR (2), S6-INF-SEED (2), S6-HR-01 (2), S6-DOC (0.5) | 7.5 |
| **Web Dev 2** | S6-CF-04 (1), S6-INF-HR (2), S6-HR-01 (2), S6-DOC (1) | 6 |
| **Total** | | **26 SP** |

Senior has higher load (12.5 SP) due to crypto domain ownership and SLO wiring complexity. This aligns with the phase-1-sprint-plan's Track A (Senior = crypto) and Track B (Web Devs = HR) allocation. The 4 SP buffer absorbs unknowns.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Domain FRD scope larger than expected | Medium | Medium | Sprint 6 = one workflow per domain only; full business logic in Sprint 7 |
| Domain schema design decisions take time | Medium | Low | Domain FRDs already specify entities; follow existing Drizzle patterns |
| Carry-forwards take longer than estimated | Low | Medium | Phase 1 is all familiar code; 4 SP buffer absorbs overruns |
| MCP exchange/HR tool integration issues | Medium | Low | Use InMemoryTransportAdapter for dev; real integrations in Sprint 7 |
| Cross-domain infrastructure conflicts | Low | Low | Schemas are domain-scoped; adapters are independent files |

---

## WARNING Register Updates (Sprint 6)

| WARNING | Status After Sprint 6 |
|---------|----------------------|
| S4-W10 | **RESOLVED** — retention failed-run detection evaluator added to SLO cron |
| T1-W23 | **RESOLVED** — notification delivery monitoring evaluator added to SLO cron |
| S2-W12 | **DEFERRED → Sprint 7** — LLM spend dashboard (bundled with INT-03) |

---

## Sprint 7 Preview (Weeks 15-16)

Based on Sprint 6 deferrals and natural progression:
- INT-02: Admin Dashboard (5 SP) — now with domain data to display
- INT-03 + S2-W12: LLM Usage Dashboard (3 SP) — with real provider usage
- Crypto domain: Full business logic — remaining workflows, state machines, exchange integrations
- HR domain: Full business logic — interview workflow, offer approval, Gmail/Calendar MCP
- Domain-specific hardening: domain RBAC enforcement tests, domain audit coverage

---

## Final Verdict

**CONSENSUS PLAN** — All 3 models agree on the core structure after debate:
- 2-week sprint
- 3-phase sequential approach (closure → infrastructure → kickoff)
- INT-02/INT-03 deferred to Sprint 7
- Domain infrastructure as explicit prerequisite tasks
- 26 SP committed with 4 SP buffer for domain unknowns

Key insight from this review: **domain kickoff requires more infrastructure setup than the phase-1-sprint-plan originally outlined**. The plan described Sprint 6-7 as "trading state definitions + exchange MCP + paper trading" but omitted the foundational schema/adapter/event/seed work needed first. This review surfaces that gap and allocates 10 SP (38%) of the sprint to infrastructure — a necessary investment before business logic can begin.

---

*Generated by multi-model review: Claude Opus 4.6 (lead) + Gemini 3 Flash Preview + Codex/GPT*
*Date: 2026-03-11*
