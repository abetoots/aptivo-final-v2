# Sprint 7 Implementation Plan: Phase 1 Final Delivery

**Theme**: "Close the dashboards, master the domains"
**Duration**: 2 weeks (Week 15-16)
**Total Story Points**: 28 SP (11 tasks)
**Packages**: `apps/web` (dashboards, workflows, carry-forwards) + `@aptivo/database` (schema additions, aggregation adapters) + `@aptivo/llm-gateway` (usage aggregation) + `@aptivo/file-storage` (S3 idempotency)
**FRD Coverage**: INT-02, INT-03/S2-W12, CRYPTO-WF-SEC-001, HR-WF-INTERVIEW-001, HR-WF-CONTRACT-001
**WARNING Closure**: S2-W12 (LLM spend dashboard)
**Multi-Model Review**: [SPRINT_7_PLAN_MULTI_REVIEW.md](./SPRINT_7_PLAN_MULTI_REVIEW.md) — Claude Opus 4.6 + Gemini 3 Flash Preview + Codex/GPT

---

## Executive Summary

Sprint 7 closes Phase 1. It delivers the twice-deferred Admin and LLM dashboards (now viable with domain data flowing), adds the crypto security detection workflow (the safety gate for systematic trading), and implements the two remaining HR workflows (interview scheduling + contract approval). Sprint 6 carry-forwards (SLO real metrics, body limits, approver notification) are resolved in the foundation phase.

SMT-001 (smart money tracking), NS-001 (narrative scouting), and the full TRD-001 trading lifecycle are deferred to Phase 2 — they require real MCP server implementations that don't exist yet.

### Multi-Model Consensus

This plan was produced via multi-model synthesis. All three models agree on:

- 28 SP committed scope with 2 SP buffer
- 4-phase sequential approach: foundation → dashboards → domain workflows → documentation
- SEC-001 is the right crypto scope (establishes safety gate pattern)
- SMT-001 and NS-001 deferred (no real MCP transport)
- API-first dashboards with minimal server-rendered UI (no chart libraries in Sprint 7)
- Schema additions as a blocking prerequisite before domain workflows

---

## 1. Task Breakdown

### Phase 1: Foundation & Carry-Forwards (Days 1-3)

#### S7-CF-01: Wire Real SLO Metric Providers (3 SP)

**Description**: Replace the 6 stub metric providers in `slo-cron.ts` with real Drizzle aggregation queries. Create a shared `MetricService` used by both the SLO cron and dashboard APIs.

**Acceptance Criteria**:
- [ac] `workflowSuccessRate`: Real count from audit store (workflow.complete / workflow.total)
- [ac] `hitlLatencyP95`: Real P95 calculation from HITL request store (created_at → decided_at)
- [ac] `mcpSuccessRate`: Real count from audit store (mcp.call.success / mcp.call.total)
- [ac] `auditDlqPending`: Real count from DLQ store (pending entries)
- [ac] `retentionFailureCount`: Real count from audit store (retention.failure events)
- [ac] `notificationDeliveryRate`: Real count from delivery log store (delivered / total)
- [ac] Shared `MetricService` interface used by both cron and dashboard APIs
- [ac] SLO cron function wired with real deps in `route.ts`
- [ac] Tests for each metric provider + cron integration

**Files**:
- Create: `apps/web/src/lib/observability/metric-service.ts`
- Modify: `apps/web/src/lib/observability/slo-cron.ts` (use MetricService)
- Modify: `apps/web/src/app/api/inngest/route.ts` (wire real providers)
- Modify: `apps/web/src/lib/services.ts` (add `getMetricService()`)
- Create: `apps/web/tests/s7-cf-01-real-metrics.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `MetricService.getWorkflowSuccessRate(window)` returns rate from store
2. Green: Implement Drizzle COUNT query on audit logs with time-range filter
3. Red: `MetricService.getHitlLatencyP95(window)` returns real P95
4. Green: Implement Drizzle query calculating P95 from HITL request timestamps
5. Red: `collectSloMetrics(deps)` returns real metrics via MetricService
6. Green: Wire MetricService into SloMetricsDeps
7. Red: Cron function uses real providers (not stubs)
8. Green: Update `route.ts` to pass MetricService-backed providers

---

#### S7-CF-02: Apply Body Limits on Domain Routes (1 SP)

**Description**: Apply the `withBodyLimits` HOF created in Sprint 6 to all new domain API routes.

**Acceptance Criteria**:
- [ac] All new domain POST routes wrap handlers with `withBodyLimits()`
- [ac] Oversized body → 413 response
- [ac] Deep JSON → 400 response
- [ac] Tests verify limits on each domain route

**Files**:
- Modify: domain API route files (created in Phase 3)
- Create: `apps/web/tests/s7-cf-02-domain-routes.test.ts`

**Dependencies**: Domain routes created in Phase 3

---

#### S7-CF-03: Crypto Approver Notification (1 SP)

**Description**: Paper trade workflow currently creates a HITL request but doesn't send a notification to the approver. Add a notification step after HITL request creation using the `crypto-signal-approval` template seeded in Sprint 6.

**Acceptance Criteria**:
- [ac] After `createRequest()`, send notification using `getNotificationService()`
- [ac] Uses `crypto-signal-approval` notification template
- [ac] Notification failure is non-blocking (fire-and-forget)
- [ac] Audit event recorded for notification dispatch

**Files**:
- Modify: `apps/web/src/lib/workflows/crypto-paper-trade.ts`
- Modify: `apps/web/tests/s6-cry-01-paper-trade.test.ts` (add notification test)

**Dependencies**: None

---

#### S7-TD-01: S3 deleteObject Idempotency (1 SP)

**Description**: Ensure `deleteFile` in `S3StorageAdapter` is idempotent — deleting a non-existent object should return success, not a not-found error.

**Acceptance Criteria**:
- [ac] `deleteFile('non-existent-key')` returns `Result.ok()`
- [ac] Double-delete returns success both times
- [ac] Tests verify idempotent behavior

**Files**:
- Modify: `packages/file-storage/src/storage/s3-adapter.ts`
- Modify: `packages/file-storage/tests/int-w3-s3-adapter.test.ts`

**Dependencies**: None

---

#### S7-INF-01: Domain Schema Additions (2 SP)

**Description**: Add missing FRD entities to the domain schemas: `securityReports` for crypto (SEC-001), `contracts` and `positions` for HR (CONTRACT-001). Create corresponding store adapters.

**Acceptance Criteria**:
- [ac] `securityReports` table: tokenAddress, chain, liquidityUsd, isHoneypot, isMintable, riskScore (0-100), reasons JSON, status, scannedAt
- [ac] `contracts` table: candidateId FK, templateSlug, terms JSON, version, status (drafting → compliance_check → pending_approval → approved → sent → signed), complianceFlags JSON
- [ac] `positions` table: title, clientId, requirements JSON, status, slaBusinessDays
- [ac] `SecurityReportStore` + `createDrizzleSecurityReportStore(db)`: create, findByToken, findRecent
- [ac] `ContractStore` + `createDrizzleContractStore(db)`: create, findById, updateStatus
- [ac] `PositionStore` + `createDrizzlePositionStore(db)`: create, findById, findOpen
- [ac] Barrel exports in `schema/index.ts` and `adapters/index.ts`
- [ac] Store getters added to `services.ts` composition root

**Files**:
- Modify: `packages/database/src/schema/crypto-domain.ts` (add securityReports)
- Modify: `packages/database/src/schema/hr-domain.ts` (add contracts, positions)
- Modify: `packages/database/src/schema/index.ts` (export new tables)
- Create: `packages/database/src/adapters/security-report-store.ts`
- Modify: `packages/database/src/adapters/hr-stores.ts` (add ContractStore, PositionStore)
- Modify: `packages/database/src/adapters/index.ts` (export new adapters)
- Modify: `apps/web/src/lib/services.ts` (add getters)
- Create: `packages/database/tests/s7-inf-01-schema-additions.test.ts`

**Dependencies**: None (blocking for S7-CRY-01, S7-HR-01, S7-HR-02)

**TDD Micro-Tasks**:
1. Red: `securityReports` table insertable with all required fields
2. Green: Define table schema with appropriate indexes
3. Red: `SecurityReportStore.findByToken()` returns cached report within TTL
4. Green: Implement with Drizzle WHERE + ORDER BY scannedAt DESC
5. Red: `ContractStore.updateStatus()` transitions through valid states
6. Green: Implement with Drizzle UPDATE

---

### Phase 2: Platform Dashboards (Days 4-7)

#### S7-INT-02: Admin Dashboard (5 SP)

**Description**: Primary Admin Dashboard for platform oversight. API-first approach: robust backends with RBAC enforcement and minimal server-rendered pages.

**Acceptance Criteria**:
- [ac] `GET /api/admin/overview` returns: pending HITL count, recent audit events (last 50), SLO health status, active workflow count
- [ac] `GET /api/admin/audit?page=1&limit=50` returns paginated audit logs with resource/actor filtering
- [ac] `GET /api/admin/hitl?status=pending` returns pending HITL requests with signal/candidate context
- [ac] RBAC: `checkPermission('platform/admin.view')` middleware enforced on all `/api/admin/*` routes
- [ac] Admin page: minimal server-rendered page with pending approvals table, recent audit table, SLO status indicators
- [ac] `AdminStore` adapter with Drizzle aggregation queries (count, pagination)
- [ac] Tests for RBAC enforcement, API responses, store aggregation

**Files**:
- Create: `apps/web/src/app/api/admin/overview/route.ts`
- Create: `apps/web/src/app/api/admin/audit/route.ts`
- Create: `apps/web/src/app/api/admin/hitl/route.ts`
- Create: `apps/web/src/lib/security/rbac-middleware.ts`
- Create: `packages/database/src/adapters/admin-store.ts`
- Modify: `packages/database/src/adapters/index.ts`
- Modify: `apps/web/src/lib/services.ts` (add `getAdminStore()`)
- Create: `apps/web/src/app/admin/page.tsx`
- Create: `apps/web/tests/s7-int-02-admin-dashboard.test.ts`

**Dependencies**: S7-CF-01 (MetricService for SLO status)

**TDD Micro-Tasks**:
1. Red: Non-admin user gets 403 on `/api/admin/overview`
2. Green: Implement `checkPermission()` RBAC middleware
3. Red: `AdminStore.getPendingHitlCount()` returns correct count
4. Green: Implement Drizzle COUNT query on HITL requests WHERE status = 'pending'
5. Red: `GET /api/admin/audit?page=2&limit=50` returns correct page
6. Green: Implement paginated query with OFFSET/LIMIT
7. Red: Admin page renders pending approvals table
8. Green: Implement minimal server-rendered page

---

#### S7-INT-03: LLM Usage & Cost Dashboard (3 SP)

**Description**: LLM Usage Dashboard utilizing the usage logs and cost calculation logic from Sprint 1. Closes S2-W12 (LLM spend monitoring). API-first with minimal tabular page.

**Acceptance Criteria**:
- [ac] `GET /api/admin/llm-usage?range=30d` returns: total cost, cost per domain, cost per provider, cost per model, daily totals
- [ac] `GET /api/admin/llm-usage/budget` returns: daily spend vs limit, monthly spend vs limit, burn rate
- [ac] S2-W12: Response includes alert flags when any domain exceeds $5/day threshold
- [ac] `LlmUsageStore` adapter with Drizzle GROUP BY aggregation queries
- [ac] Integrated under `/admin/llm-usage` path, RBAC-gated
- [ac] Minimal page: tabular cost breakdown by domain/provider/day
- [ac] Tests for aggregation queries and alert thresholds

**Files**:
- Create: `apps/web/src/app/api/admin/llm-usage/route.ts`
- Create: `apps/web/src/app/api/admin/llm-usage/budget/route.ts`
- Create: `packages/database/src/adapters/llm-usage-store.ts`
- Modify: `packages/database/src/adapters/index.ts`
- Modify: `apps/web/src/lib/services.ts` (add `getLlmUsageStore()`)
- Create: `apps/web/src/app/admin/llm-usage/page.tsx`
- Create: `apps/web/tests/s7-int-03-llm-usage.test.ts`

**Dependencies**: S7-CF-01 (shared MetricService)

**TDD Micro-Tasks**:
1. Red: `LlmUsageStore.getCostByDomain(range)` returns correct aggregates
2. Green: Implement Drizzle GROUP BY domain query on llm_usage_logs
3. Red: `LlmUsageStore.getDailySpend()` returns current day total
4. Green: Implement Drizzle SUM query with date filter
5. Red: API includes alert flag when domain cost > $5/day
6. Green: Compare daily spend against threshold in API handler

---

### Phase 3: Domain Workflows (Days 5-9)

#### S7-CRY-01: Security Detection Workflow — SEC-001 (3 SP)

**Description**: Automated token screening workflow. Validates token safety before any trade execution. Uses MCP tools for liquidity and security checks, persists reports for caching.

**Acceptance Criteria**:
- [ac] Inngest function `crypto-security-scan` triggered by `crypto/security.scan.requested` event
- [ac] Step 1 (**liquidity-check**): Query DexScreener MCP for token liquidity; reject if < $50k
- [ac] Step 2 (**contract-scan**): Query GoPlus/Honeypot.is MCP for honeypot, mintable, renounced ownership
- [ac] Step 3 (**risk-scoring**): Calculate 0-100 risk score based on checks; persist `SecurityReport`
- [ac] Step 4 (**audit-trail**): Record scan result in audit service
- [ac] Returns `{ passed: boolean, riskScore: number, reasons: string[], reportId: string }`
- [ac] Cached: skip re-scan if report exists within TTL (default 1 hour)
- [ac] Registered in Inngest route
- [ac] Tests for pass/fail/cache-hit scenarios

**Files**:
- Create: `apps/web/src/lib/workflows/crypto-security-scan.ts`
- Modify: `apps/web/src/lib/inngest.ts` (add `crypto/security.scan.requested` event)
- Modify: `apps/web/src/app/api/inngest/route.ts` (register function)
- Create: `apps/web/tests/s7-cry-01-security-scan.test.ts`

**Dependencies**: S7-INF-01 (SecurityReportStore)

**TDD Micro-Tasks**:
1. Red: Safe token with >$50k liquidity and no flags returns `passed: true`
2. Green: Implement liquidity check step with MCP call
3. Red: Token with <$50k liquidity returns `passed: false, reasons: ['Insufficient liquidity']`
4. Green: Add threshold check
5. Red: Honeypot token returns `passed: false, riskScore: 95`
6. Green: Add GoPlus MCP check for is_honeypot
7. Red: Recently scanned token returns cached report (skip re-scan)
8. Green: Check SecurityReportStore.findByToken() within TTL

---

#### S7-HR-01: Interview Scheduling Workflow — INTERVIEW-001 (3 SP)

**Description**: Automates interview scheduling using Google Calendar MCP. Proposes available slots, waits for candidate selection, creates calendar event.

**Acceptance Criteria**:
- [ac] Inngest function `hr-interview-scheduling` triggered by `hr/interview.scheduling.requested` event
- [ac] Step 1 (**check-availability**): Query interviewer calendar via Google Calendar MCP for free slots
- [ac] Step 2 (**propose-slots**): Send notification to candidate with top 3 available slots
- [ac] Step 3 (**wait-for-selection**): `waitForEvent('hr/interview.slot.selected', timeout: '48h')`
- [ac] Step 4 (**create-event**): Create Google Calendar event via MCP, update `interviews` table to `confirmed`
- [ac] Step 5 (**notify-parties**): Send confirmation notification to candidate + interviewer
- [ac] Step 6 (**audit-trail**): Record scheduling in audit service
- [ac] Handles: no available slots → manual_intervention, selection timeout → canceled
- [ac] Registered in Inngest route

**Files**:
- Create: `apps/web/src/lib/workflows/hr-interview-scheduling.ts`
- Modify: `apps/web/src/lib/inngest.ts` (add interview events)
- Modify: `apps/web/src/app/api/inngest/route.ts` (register function)
- Create: `apps/web/tests/s7-hr-01-interview-scheduling.test.ts`

**Dependencies**: S7-INF-01 (PositionStore for context)

**TDD Micro-Tasks**:
1. Red: Happy path: slots found → candidate selects → calendar event created
2. Green: Implement 6-step pipeline
3. Red: No available slots → manual_intervention status
4. Green: Handle empty slot list from MCP
5. Red: Candidate doesn't select within 48h → canceled
6. Green: Handle null from waitForEvent

---

#### S7-HR-02: Contract Approval Workflow — CONTRACT-001 (3 SP)

**Description**: Template-based contract drafting with DOLE compliance checks and HITL approval for hiring managers.

**Acceptance Criteria**:
- [ac] Inngest function `hr-contract-approval` triggered by `hr/offer.approved` event
- [ac] Step 1 (**draft-contract**): Populate contract template with candidate/salary/position data
- [ac] Step 2 (**compliance-check**): LLM validates mandatory DOLE benefits (SSS, PhilHealth, Pag-IBIG) and probation terms
- [ac] Step 3 (**hitl-approval**): Create HITL request for hiring manager with contract preview
- [ac] Step 4 (**wait-for-approval**): `waitForEvent('hitl/decision.recorded', timeout: '72h')`
- [ac] Step 5 (**finalize**): Update `contracts` table status to `approved`, emit `hr/contract.approved` event
- [ac] Step 6 (**audit-trail**): Record contract approval chain
- [ac] Handles: compliance failure → return to drafting, HITL rejection → rejected, timeout → expired
- [ac] Registered in Inngest route

**Files**:
- Create: `apps/web/src/lib/workflows/hr-contract-approval.ts`
- Modify: `apps/web/src/lib/inngest.ts` (add contract events)
- Modify: `apps/web/src/app/api/inngest/route.ts` (register function)
- Create: `apps/web/tests/s7-hr-02-contract-approval.test.ts`

**Dependencies**: S7-INF-01 (ContractStore)

**TDD Micro-Tasks**:
1. Red: Happy path: draft → compliance pass → HITL approved → contract approved
2. Green: Implement 6-step pipeline
3. Red: Missing SSS in contract terms → compliance failure
4. Green: LLM check with Zod structured output for compliance flags
5. Red: Hiring manager rejects → contract rejected
6. Green: Handle rejection from waitForEvent

---

### Phase 4: Documentation (Day 10)

#### S7-DOC: Phase 1 Closure Documentation (2 SP)

**Description**: Final documentation for Sprint 7 and Phase 1 closure.

**Acceptance Criteria**:
- [ac] `WARNINGS_REGISTER.md` updated — S2-W12 marked resolved
- [ac] `phase-1-sprint-plan.md` Sprint 7 section with DoD checkboxes
- [ac] `MEMORY.md` updated with Sprint 7 deliverables
- [ac] Multi-model implementation review conducted
- [ac] Phase 1 handover summary: test count, package inventory, FRD traceability matrix update

**Files**:
- Modify: `docs/WARNINGS_REGISTER.md`
- Modify: `docs/06-sprints/phase-1-sprint-plan.md`

**Dependencies**: All tasks complete

---

## 2. Dependency Graph

```
Phase 1 (Days 1-3) — all independent:
  S7-CF-01 (SLO metrics, 3SP)     ─────────────────────────────┐
  S7-CF-02 (Body limits, 1SP)     ─ depends on Phase 3 routes  │
  S7-CF-03 (Approver notif, 1SP)  ─────────────────────────────┤
  S7-TD-01 (S3 idempotent, 1SP)   ─────────────────────────────┤
  S7-INF-01 (Schema adds, 2SP)    ───────┐                     │
                                          ▼                     ▼
Phase 2 (Days 4-7):
  S7-INT-02 (Admin Dashboard, 5SP) ← S7-CF-01 (MetricService)
  S7-INT-03 (LLM Dashboard, 3SP)  ← S7-CF-01 (MetricService)
                                          │
Phase 3 (Days 5-9):                       │
  S7-CRY-01 (Security Scan, 3SP) ← S7-INF-01 (SecurityReportStore)
  S7-HR-01 (Interviews, 3SP)     ← S7-INF-01 (PositionStore)
  S7-HR-02 (Contracts, 3SP)      ← S7-INF-01 (ContractStore)
                                          ▼
Phase 4 (Day 10):
  S7-DOC (Documentation, 2SP)    ← all above
```

**Critical path**: S7-INF-01 → S7-CRY-01/HR-01/HR-02 → S7-DOC

---

## 3. Architectural Decisions

### Q1: Dashboard Data Aggregation

**Decision**: Create a shared `MetricService` interface in `apps/web/src/lib/observability/metric-service.ts` with Drizzle aggregation implementations. Both the SLO cron and dashboard APIs consume this service, ensuring metric consistency.

### Q2: Dashboard UI Scope

**Decision**: API-first with minimal server-rendered pages. No chart library (Recharts, Chart.js) in Sprint 7. Dashboards display tabular data with server-rendered HTML tables. Interactive charts and widgets are Phase 2 scope when a UI framework is established.

### Q3: Domain Workflow Colocation

**Decision**: Continue placing domain workflows in `apps/web/src/lib/workflows/{crypto,hr}-*.ts`. Extraction to domain packages (`@aptivo/crypto`, `@aptivo/hr`) is Phase 2 — colocation with the composition root is simpler for now.

### Q4: RBAC Middleware Pattern

**Decision**: Create `checkPermission(permission: string)` middleware factory in `apps/web/src/lib/security/rbac-middleware.ts`. Returns 403 with `ProblemDetails` on permission failure. Used by admin routes and future domain routes.

### Q5: Security Report Caching

**Decision**: Security scan results are persisted in `securityReports` table with `scannedAt` timestamp. Re-scan is skipped if a report exists within the configurable TTL (default 1 hour). This avoids redundant MCP calls for tokens scanned recently.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| SLO real metric wiring | 3 | **Commit** | Carry-forward from Sprint 6; blocks dashboards |
| Domain route body limits | 1 | **Commit** | Security carry-forward |
| Crypto approver notification | 1 | **Commit** | Carry-forward from Sprint 6 review |
| S3 deleteObject idempotency | 1 | **Commit** | Tech debt closure |
| Domain schema additions | 2 | **Commit** | Blocking for domain workflows |
| Admin Dashboard (API-first) | 5 | **Commit** | Deferred from Sprint 5; Phase 1 closure requirement |
| LLM Usage Dashboard (API-first) | 3 | **Commit** | Deferred from Sprint 5; closes S2-W12 |
| Security Detection Workflow | 3 | **Commit** | Safety gate for systematic trading |
| Interview Scheduling Workflow | 3 | **Commit** | Core HR requirement (CM-003) |
| Contract Approval Workflow | 3 | **Commit** | Core HR requirement (CM-004, COMP-003) |
| Phase 1 Closure Documentation | 2 | **Commit** | Sprint completion requirement |
| CRYPTO-WF-SMT-001 (Smart Money) | 5 | **Defer → Phase 2** | Requires real MCP transport (Basescan) |
| CRYPTO-WF-NS-001 (Narrative) | 4 | **Defer → Phase 2** | Requires social data MCP sources |
| CRYPTO-WF-TRD-001 full lifecycle | 8 | **Defer → Phase 2** | Depends on SEC-001 + real exchange MCP |
| FR-CRYPTO-RISK-002 (Daily loss limit) | 3 | **Defer → Phase 2** | Requires position monitoring loop |
| FR-HR-CM-002 (Workflow editor UI) | 5 | **Defer → Phase 2** | Full UI feature |
| FR-HR-CM-005 SAR/anonymization | 3 | **Defer → Phase 2** | Compliance reporting |
| Dashboard full UI (charts) | 5 | **Defer → Phase 2** | Chart library not established |

**Committed**: 28 SP | **Deferred**: ~33 SP to Phase 2

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | S7-CF-01 (3), S7-CF-03 (1), S7-INF-01-crypto (1), S7-CRY-01 (3), S7-DOC (0.5) | 8.5 |
| **Web Dev 1** | S7-INT-02 (5), S7-CF-02 (1), S7-HR-02 (3), S7-DOC (0.5) | 9.5 |
| **Web Dev 2** | S7-INT-03 (3), S7-TD-01 (1), S7-INF-01-hr (1), S7-HR-01 (3), S7-DOC (1) | 9 |
| **Total** | | **28 SP** |

Senior has lower load (8.5 SP) because crypto security detection requires deeper MCP integration work. Web Devs are balanced at 9-9.5 SP with dashboard + HR workflow splits.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dashboard aggregation query performance | Medium | Low | Indexed time-range queries + pagination (max 200) |
| MCP integration flakiness for security checks | Medium | Medium | Circuit breaker fail-closed for safety; mock-driven tests |
| DOLE compliance LLM accuracy | Medium | Low | Zod structured output + HITL fallback for edge cases |
| Schema additions causing migration complexity | Low | Medium | Idempotent migrations with existing patterns |
| Phase 1 timeline pressure (28 SP) | Medium | Medium | Dashboards can simplify further if domain work overflows |
| No real Google Calendar MCP for interviews | High | Low | Mock MCP adapter; real integration deferred to deployment |

---

## 7. Definition of Done

- [ ] SLO cron uses real store data via MetricService (no stubs) *(S7-CF-01)*
- [ ] All new domain routes protected by `withBodyLimits` *(S7-CF-02)*
- [ ] Paper trade HITL step sends notification to approver *(S7-CF-03)*
- [ ] S3 `deleteFile` is idempotent *(S7-TD-01)*
- [ ] `securityReports`, `contracts`, `positions` tables + store adapters *(S7-INF-01)*
- [ ] Admin Dashboard: RBAC-gated APIs + minimal admin page with approvals and audit tables *(S7-INT-02)*
- [ ] LLM Usage Dashboard: cost aggregation API + minimal usage page; S2-W12 closed *(S7-INT-03)*
- [ ] Security scan workflow: liquidity + honeypot + mintable checks → risk score *(S7-CRY-01)*
- [ ] Interview scheduling workflow: availability → propose → confirm → calendar event *(S7-HR-01)*
- [ ] Contract approval workflow: draft → compliance check → HITL → approved *(S7-HR-02)*
- [ ] Multi-model implementation review conducted *(S7-DOC)*
- [ ] 80%+ test coverage across new code
- [ ] Phase 1 closure documentation complete *(S7-DOC)*

---

## 8. Phase 2 Preview

Based on Sprint 7 deferrals and natural progression:

| Item | SP (est.) | Source |
|------|-----------|--------|
| CRYPTO-WF-SMT-001: Smart Money Tracking | 5 | Requires Basescan/Arbiscan MCP servers |
| CRYPTO-WF-NS-001: Narrative Scouting | 4 | Requires social data MCP sources |
| CRYPTO-WF-TRD-001: Full Trading Lifecycle | 8 | Live execution + position monitoring |
| FR-CRYPTO-RISK-002: Daily Loss Limit | 3 | Trading circuit breaker |
| Dashboard full UI (charts, interactive widgets) | 5 | Recharts or similar |
| FR-HR-CM-002: Custom workflow editor | 5 | Drag-and-drop stage management |
| FR-HR-CM-005: SAR/anonymization exports | 3 | Data subject rights |
| FR-HR-COMP-002/004/005: Full PH compliance | 5 | DPA subject rights, BIR retention, tax export |
| Real MCP server implementations | 8 | DexScreener, GoPlus, Gmail, Google Calendar |
| Domain package extraction | 3 | `@aptivo/crypto`, `@aptivo/hr` |
