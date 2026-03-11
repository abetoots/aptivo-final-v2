# Sprint 6 Implementation Plan: Platform Closure & Domain Foundations

**Theme**: "Close the loop, light the domains"
**Duration**: 2 weeks (Week 13-14)
**Total Story Points**: 26 SP (10 tasks)
**Packages**: `@aptivo/database` (domain schemas + adapters) + `apps/web` (carry-forwards, domain workflows) + existing packages (minor fixes)
**FRD Coverage**: Sprint 5 carry-forwards + FR-CRYPTO-TRD-002 (paper trading) + FR-HR-CM-001 (candidate repository)
**WARNING Closure**: S4-W10 (retention monitoring), T1-W23 (notification monitoring)
**Multi-Model Review**: [SPRINT_6_PLAN_MULTI_REVIEW.md](./SPRINT_6_PLAN_MULTI_REVIEW.md) — Claude Opus 4.6 + Gemini 3 Flash Preview + Codex/GPT

---

## Executive Summary

Sprint 6 transitions Aptivo from platform-only development to domain-specific implementation. Week 1 closes Sprint 5's carry-forward gaps (dead-code SLO evaluators, synthetic HITL, unwired body limits) and establishes domain infrastructure (schemas, adapters, events, seeds). Week 2 implements one workflow per domain — paper trading for Crypto and candidate flow for HR — validating the platform through real domain lenses.

INT-02 (Admin Dashboard, 5 SP) and INT-03 (LLM Usage Dashboard, 3 SP) are deferred to Sprint 7 — dashboards are premature without domain data flowing through the system.

### Multi-Model Consensus

This plan was produced via multi-model synthesis. All three models agree on:

- 26 SP committed scope with 4 SP buffer for domain unknowns
- 3-phase sequential approach: closure → infrastructure → kickoff
- Domain infrastructure is a blocking prerequisite before business logic
- INT-02 and INT-03 deferred to Sprint 7
- S4-W10 + T1-W23 bundled into SLO cron job (not separate tasks)

---

## 1. Task Breakdown

### Phase 1: Platform Closure (Days 1-3)

#### S6-CF-01: SLO Runtime Integration + Monitoring Extras (3 SP)

**Description**: The 4 SLO evaluators in `slo-alerts.ts` are currently dead code — pure functions with no runtime trigger. Wire them as an Inngest cron function that collects metrics from stores and evaluates all SLOs on a 5-minute schedule. Additionally, add 2 new evaluators for S4-W10 (retention failed-run detection) and T1-W23 (notification delivery monitoring).

**Acceptance Criteria**:
- [ac] Inngest cron function `slo-evaluate` runs every 5 minutes
- [ac] `collectSloMetrics()` queries audit DLQ count, workflow success/fail counts, MCP call counts, HITL latency, notification delivery rate from stores
- [ac] Calls `evaluateAllSlos(metrics)` and logs results
- [ac] Firing alerts emit a platform event (`platform/slo.alert.fired`) for future webhook/notification integration
- [ac] S4-W10: New evaluator fires when data retention workflow reports failure
- [ac] T1-W23: New evaluator fires when notification delivery rate drops below 95%
- [ac] Tests for new evaluators + cron function registration

**Files**:
- Create: `apps/web/src/lib/observability/slo-cron.ts`
- Modify: `apps/web/src/lib/observability/slo-alerts.ts` (add 2 evaluators + extend `SloMetrics`)
- Modify: `apps/web/src/lib/inngest.ts` (add `platform/slo.alert.fired` event schema)
- Modify: `apps/web/src/app/api/inngest/route.ts` (register cron function)
- Create: `apps/web/tests/s6-cf-01-slo-cron.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `collectSloMetrics()` returns `SloMetrics` with all 6 counters
2. Green: Implement metrics collector querying DLQ store, audit store, etc.
3. Red: New `retentionFailureAlert` evaluator fires when count > 0
4. Green: Add evaluator to `ALL_SLO_ALERTS`
5. Red: New `notificationDeliveryAlert` evaluator fires when rate < 95%
6. Green: Add evaluator to `ALL_SLO_ALERTS`
7. Red: Inngest cron calls `collectSloMetrics()` → `evaluateAllSlos()`
8. Green: Wire as `inngest.createFunction({ cron: '*/5 * * * *' })`

---

#### S6-CF-02: Wire Real HITL in Demo Workflow (1 SP)

**Description**: The demo workflow at `demo-workflow.ts:147` uses `crypto.randomUUID()` as a synthetic HITL request ID instead of calling `hitlService.createRequest()`. This teaches the wrong integration pattern for domain developers. Replace with real HITL gateway calls.

**Acceptance Criteria**:
- [ac] Demo workflow step 2 calls `createRequest()` from `@aptivo/hitl-gateway` instead of generating synthetic UUIDs
- [ac] `getHitlService()` lazy getter added to `services.ts` composition root
- [ac] `waitForEvent` predicate matches real HITL request ID
- [ac] Existing demo workflow tests updated and passing

**Files**:
- Modify: `apps/web/src/lib/workflows/demo-workflow.ts` (replace synthetic HITL)
- Modify: `apps/web/src/lib/services.ts` (add `getHitlService()` getter)
- Modify: `apps/web/tests/int-01-e2e-workflow.test.ts` (update mocks)

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: Demo workflow step 2 calls `hitlService.createRequest()` instead of `crypto.randomUUID()`
2. Green: Import `createRequest` from `@aptivo/hitl-gateway`, wire into step
3. Red: `getHitlService()` returns a configured HITL service instance
4. Green: Add lazy getter to `services.ts` with request store adapter

---

#### S6-CF-03: Wire Body Limits into Route Handlers (1 SP)

**Description**: `isBodyWithinLimit()` and `checkJsonDepth()` in `body-limits.ts` exist but are not wired into any API route handlers due to Next.js Edge Runtime limitations on the global middleware. Create a route-level higher-order function that wraps POST/PUT handlers with body validation.

**Acceptance Criteria**:
- [ac] `withBodyLimits(handler, options?)` HOF wraps Next.js API route handlers
- [ac] Options allow configuring limit bytes (default: `API_MAX_BODY_BYTES`) and max depth (default: `MAX_JSON_DEPTH`)
- [ac] Returns 413 for oversized bodies, 400 for excessive nesting
- [ac] Pattern documented for domain route handlers to adopt
- [ac] Applied to existing POST routes (e.g., Inngest route, health routes)

**Files**:
- Create: `apps/web/src/lib/security/route-guard.ts`
- Modify: `apps/web/src/app/api/inngest/route.ts` (apply guard)
- Create: `apps/web/tests/s6-cf-03-route-guard.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `withBodyLimits(handler)` rejects 300KB body with 413
2. Green: Implement HOF reading `Content-Length` and body bytes
3. Red: 11-level nested JSON → 400
4. Green: Parse body, call `checkJsonDepth()`, reject if exceeded
5. Red: Valid request passes through to handler
6. Green: Call inner handler with parsed body

---

#### S6-CF-04: Tech Debt Batch (1 SP)

**Description**: Resolve low-effort tech debt items identified in Sprint 5 multi-model review.

**Acceptance Criteria**:
- [ac] Shared `DrizzleClient` type extracted to `packages/database/src/adapters/types.ts`
- [ac] All 5 adapter files import from shared type instead of local alias
- [ac] PII sanitizer in `sanitize-logging.ts` uses exact field name matching instead of `includes()`
- [ac] `TransactionalAuditStore` type no longer exported from adapters barrel

**Files**:
- Create: `packages/database/src/adapters/types.ts`
- Modify: `packages/database/src/adapters/audit-store-drizzle.ts` (import shared type)
- Modify: `packages/database/src/adapters/dlq-store-drizzle.ts` (import shared type)
- Modify: `packages/database/src/adapters/notification-preference-drizzle.ts` (import shared type)
- Modify: `packages/database/src/adapters/delivery-log-drizzle.ts` (import shared type)
- Modify: `packages/database/src/adapters/template-store-drizzle.ts` (import shared type)
- Modify: `packages/database/src/adapters/index.ts` (remove `TransactionalAuditStore` export)
- Modify: `apps/web/src/lib/security/sanitize-logging.ts` (exact field matching)

**Dependencies**: None

---

### Phase 2: Domain Foundation (Days 4-7)

#### S6-INF-CRY: Crypto Domain Infrastructure (4 SP)

**Description**: Create the foundational infrastructure for the Crypto trading domain — Drizzle schema, store interfaces, adapters, Inngest event schemas, and service composition wiring.

**Entity source**: `docs/02-requirements/crypto-domain-frd.md` §2.1

**Acceptance Criteria**:
- [ac] Drizzle schema defines `monitoredWallets`, `tradeSignals`, `tradeExecutions`, `portfolioStates` tables
- [ac] `monitoredWallets`: address, chain, label, historicalPerformance (JSONB), lastActiveAt, isEnabled
- [ac] `tradeSignals`: token, direction (long/short), entryZone, stopLoss, takeProfit, reasoning, confidenceScore, expiration, status (pending/approved/rejected/expired/executed)
- [ac] `tradeExecutions`: signalId FK, exchange, entryPrice, exitPrice, size, pnl, status (open/closed/canceled), isPaper, riskData (JSONB)
- [ac] `portfolioStates`: totalValue, positions (JSONB), dailyPnl, drawdownLevel, snapshotAt
- [ac] Store interfaces: `WalletStore` (CRUD), `TradeSignalStore` (create, findPending, updateStatus), `TradeExecutionStore` (create, findOpen, close)
- [ac] Drizzle adapters implement all store interfaces
- [ac] Inngest event schemas: `crypto/signal.created`, `crypto/trade.requested`, `crypto/trade.executed`, `crypto/alert.fired`
- [ac] `getCryptoTradeSignalStore()` and `getCryptoExecutionStore()` lazy getters in composition root
- [ac] Unit tests for adapter CRUD operations (mock Drizzle)
- [ac] Schema exported from `@aptivo/database` barrel

**Files**:
- Create: `packages/database/src/schema/crypto-domain.ts`
- Modify: `packages/database/src/schema/index.ts` (add crypto exports)
- Create: `packages/database/src/adapters/crypto-stores.ts`
- Modify: `packages/database/src/adapters/index.ts` (add crypto exports)
- Create: `packages/database/tests/s6-inf-crypto.test.ts`
- Modify: `apps/web/src/lib/inngest.ts` (add `CryptoEvents` to schema composition)
- Modify: `apps/web/src/lib/services.ts` (add crypto store getters)

**Dependencies**: S6-CF-04 (shared DrizzleClient type)

**TDD Micro-Tasks**:
1. Red: `tradeSignals` table schema defines all columns with correct types
2. Green: Implement Drizzle schema with pgTable
3. Red: `createDrizzleTradeSignalStore(db).create(signal)` returns `{ id }`
4. Green: Implement insert on tradeSignals table
5. Red: `findPending()` returns signals with status = 'pending'
6. Green: Implement select with status filter
7. Red: `updateStatus(id, 'approved')` changes status
8. Green: Implement update with eq filter
9. Red: `createDrizzleTradeExecutionStore(db).findOpen()` returns open positions
10. Green: Implement select with status = 'open' filter

**Schema design**:
```sql
-- packages/database/src/schema/crypto-domain.ts

monitored_wallets:
  id             uuid PK DEFAULT gen_random_uuid()
  address        varchar(100) NOT NULL
  chain          varchar(20) NOT NULL        -- 'base' | 'arbitrum' | 'optimism'
  label          varchar(100)
  threshold_usd  numeric(12,2) DEFAULT 10000
  is_enabled     boolean DEFAULT true
  created_at     timestamptz DEFAULT now()
  updated_at     timestamptz DEFAULT now()

trade_signals:
  id               uuid PK DEFAULT gen_random_uuid()
  token            varchar(50) NOT NULL
  direction        varchar(10) NOT NULL       -- 'long' | 'short'
  entry_zone       numeric(18,8)
  stop_loss        numeric(18,8)
  take_profit      numeric(18,8)
  reasoning        text
  confidence_score numeric(5,2)               -- 0.00 - 100.00
  status           varchar(20) NOT NULL        -- pending | approved | rejected | expired | executed
  expires_at       timestamptz
  created_at       timestamptz DEFAULT now()
  INDEX: status for pending signal queries

trade_executions:
  id             uuid PK DEFAULT gen_random_uuid()
  signal_id      uuid FK → trade_signals.id
  exchange       varchar(50) NOT NULL
  entry_price    numeric(18,8)
  exit_price     numeric(18,8)
  size_usd       numeric(12,2)
  pnl_usd        numeric(12,2)
  status         varchar(20) NOT NULL         -- open | closed | canceled
  is_paper       boolean NOT NULL DEFAULT true
  risk_data      jsonb
  opened_at      timestamptz DEFAULT now()
  closed_at      timestamptz
  INDEX: status for open position queries

portfolio_states:
  id              uuid PK DEFAULT gen_random_uuid()
  total_value_usd numeric(14,2)
  positions       jsonb                        -- array of { token, size, entryPrice, currentPrice }
  daily_pnl_usd   numeric(12,2)
  drawdown_pct    numeric(5,2)
  snapshot_at     timestamptz DEFAULT now()
```

---

#### S6-INF-HR: HR Domain Infrastructure (4 SP)

**Description**: Create the foundational infrastructure for the HR operations domain — Drizzle schema, store interfaces, adapters, Inngest event schemas, and service composition wiring.

**Entity source**: `docs/02-requirements/hr-domain-frd.md` §2.1

**Acceptance Criteria**:
- [ac] Drizzle schema defines `candidates`, `applications`, `interviews`, `interviewFeedback`, `consentRecords` tables
- [ac] `candidates`: name, email, phone, resumeFileId (FK → files), skills (JSONB), status (active/anonymized), consentStatus
- [ac] `applications`: candidateId FK, positionId, source, currentStage (received/screening/under_review/interview_scheduled/interviewed/offer_pending/offer_extended/hired/rejected/withdrawn), appliedAt
- [ac] `interviews`: applicationId FK, interviewerId (FK → users), dateTime, location, type (in-person/virtual/phone), status (scheduling/proposed/confirmed/completed/no_show/canceled)
- [ac] `interviewFeedback`: interviewId FK, rating (1-5), strengths, concerns, recommendation (hire/no_hire/maybe)
- [ac] `consentRecords`: candidateId FK, consentType, consentDate, consentText, withdrawnAt
- [ac] Store interfaces: `CandidateStore` (CRUD + search), `ApplicationStore` (create, findByCandidate, updateStage), `InterviewStore` (create, findByApplication, updateStatus)
- [ac] Drizzle adapters implement all store interfaces
- [ac] Inngest event schemas: `hr/application.received`, `hr/interview.scheduled`, `hr/offer.approved`, `hr/consent.withdrawn`
- [ac] `getCandidateStore()` and `getApplicationStore()` lazy getters in composition root
- [ac] Unit tests for adapter CRUD operations (mock Drizzle)
- [ac] Schema exported from `@aptivo/database` barrel

**Files**:
- Create: `packages/database/src/schema/hr-domain.ts`
- Modify: `packages/database/src/schema/index.ts` (add HR exports)
- Create: `packages/database/src/adapters/hr-stores.ts`
- Modify: `packages/database/src/adapters/index.ts` (add HR exports)
- Create: `packages/database/tests/s6-inf-hr.test.ts`
- Modify: `apps/web/src/lib/inngest.ts` (add `HrEvents` to schema composition)
- Modify: `apps/web/src/lib/services.ts` (add HR store getters)

**Dependencies**: S6-CF-04 (shared DrizzleClient type)

**TDD Micro-Tasks**:
1. Red: `candidates` table schema defines all columns with correct types
2. Green: Implement Drizzle schema with pgTable
3. Red: `createDrizzleCandidateStore(db).create(candidate)` returns `{ id }`
4. Green: Implement insert on candidates table
5. Red: `findByEmail(email)` returns candidate or null
6. Green: Implement select with email filter
7. Red: `createDrizzleApplicationStore(db).updateStage(id, 'interview_scheduled')` updates stage
8. Green: Implement update with eq filter
9. Red: `createDrizzleInterviewStore(db).findByApplication(appId)` returns interviews
10. Green: Implement select with applicationId filter

**Schema design**:
```sql
-- packages/database/src/schema/hr-domain.ts

candidates:
  id              uuid PK DEFAULT gen_random_uuid()
  name            varchar(200) NOT NULL
  email           varchar(255) NOT NULL UNIQUE
  phone           varchar(50)
  resume_file_id  uuid FK → files.id
  skills          jsonb DEFAULT '[]'          -- string[]
  status          varchar(20) DEFAULT 'active' -- active | anonymized
  consent_status  varchar(20) DEFAULT 'pending' -- pending | granted | withdrawn
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()
  INDEX: email, status

applications:
  id              uuid PK DEFAULT gen_random_uuid()
  candidate_id    uuid FK → candidates.id NOT NULL
  position_id     uuid                        -- FK deferred until positions table exists
  source          varchar(50)                 -- 'email' | 'referral' | 'website'
  current_stage   varchar(30) NOT NULL DEFAULT 'received'
  applied_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()
  INDEX: candidate_id, current_stage

interviews:
  id              uuid PK DEFAULT gen_random_uuid()
  application_id  uuid FK → applications.id NOT NULL
  interviewer_id  uuid FK → users.id
  date_time       timestamptz NOT NULL
  location        varchar(500)
  type            varchar(20) NOT NULL        -- 'in-person' | 'virtual' | 'phone'
  status          varchar(20) NOT NULL DEFAULT 'scheduling'
  created_at      timestamptz DEFAULT now()
  INDEX: application_id, status

interview_feedback:
  id              uuid PK DEFAULT gen_random_uuid()
  interview_id    uuid FK → interviews.id NOT NULL UNIQUE
  rating          integer NOT NULL             -- 1-5
  strengths       text
  concerns        text
  recommendation  varchar(20) NOT NULL        -- 'hire' | 'no_hire' | 'maybe'
  submitted_at    timestamptz DEFAULT now()

consent_records:
  id              uuid PK DEFAULT gen_random_uuid()
  candidate_id    uuid FK → candidates.id NOT NULL
  consent_type    varchar(50) NOT NULL        -- 'job_processing' | 'marketing'
  consent_date    timestamptz NOT NULL DEFAULT now()
  consent_text    text NOT NULL
  withdrawn_at    timestamptz
  INDEX: candidate_id
```

---

#### S6-INF-SEED: Domain RBAC + Notification Seeds (2 SP)

**Description**: Seed domain-specific RBAC roles/permissions and notification templates for both Crypto and HR domains. Also register initial MCP tool server entries for domain integrations.

**Acceptance Criteria**:
- [ac] Crypto RBAC roles: `trader` (create/view signals, view executions), `trader-readonly` (view only), `risk-manager` (view all + pause trading)
- [ac] HR RBAC roles: `recruiter` (full candidate CRUD), `hiring-manager` (approve offers/contracts), `interviewer` (view assigned, submit feedback), `client-user` (view assigned pipeline, read-only)
- [ac] Permissions follow pattern: `domain/resource.action` (e.g., `crypto/signal.create`, `hr/candidate.view`)
- [ac] Notification templates seeded: `crypto-trade-alert` (variables: token, direction, size), `crypto-signal-approval` (variables: token, reasoning, confidenceScore), `hr-interview-scheduled` (variables: candidateName, dateTime, location), `hr-offer-approval` (variables: candidateName, position, salary)
- [ac] MCP server entries: `dexscreener` (market data), `gmail-connector` (HR email), `google-calendar` (HR scheduling)
- [ac] Seed functions are idempotent (safe to run multiple times)

**Files**:
- Create: `packages/database/src/seeds/crypto-seeds.ts`
- Create: `packages/database/src/seeds/hr-seeds.ts`
- Create: `packages/database/src/seeds/index.ts` (barrel export)
- Create: `packages/database/tests/s6-inf-seeds.test.ts`

**Dependencies**: S6-INF-CRY, S6-INF-HR (schemas must exist)

**TDD Micro-Tasks**:
1. Red: `seedCryptoRoles(db)` inserts trader + risk-manager roles
2. Green: Insert into `rolePermissions` table with crypto permissions
3. Red: `seedHrRoles(db)` inserts recruiter + hiring-manager + interviewer + client-user roles
4. Green: Insert into `rolePermissions` table with HR permissions
5. Red: `seedNotificationTemplates(db)` creates crypto + HR templates
6. Green: Insert into `notificationTemplates` table with slugs + variables
7. Red: Running seed twice does not throw (idempotent)
8. Green: Use `ON CONFLICT DO NOTHING` or check-before-insert

---

### Phase 3: Domain Kickoff (Days 8-10)

#### S6-CRY-01: Paper Trading Workflow (4 SP)

**Description**: Implement the initial Crypto trading workflow — a paper trading Inngest function that exercises the full platform pipeline: LLM signal analysis → security check → risk validation → HITL approval → simulated execution → audit trail. This validates FR-CRYPTO-TRD-002 (Paper Trading Mode).

**FRD**: `crypto-domain-frd.md` §3.4 (CRYPTO-WF-TRD-001), §4.4 (FR-CRYPTO-TRD-002)

**Acceptance Criteria**:
- [ac] Inngest function `crypto/paper-trade` triggered by `crypto/signal.created` event
- [ac] Step 1: `step.run('llm-analyze')` — LLM gateway analyzes trade signal reasoning
- [ac] Step 2: `step.run('risk-check')` — Validate position size (max 3% of portfolio), concurrent positions (max 5), minimum R:R ratio (1:2)
- [ac] Step 3: `step.run('hitl-request')` — Create HITL approval request via real `createRequest()` with token, direction, size, reasoning
- [ac] Step 4: `step.waitForEvent('hitl/decision.recorded')` — Pause for human decision (15m timeout)
- [ac] Step 5: `step.run('execute-paper')` — Simulate execution with configurable slippage (0.5%) and fees (0.1%), persist `TradeExecution` with `isPaper: true`
- [ac] Step 6: `step.run('audit-trail')` — Record audit event for trade lifecycle
- [ac] HITL rejection or timeout → signal status updated to rejected/expired
- [ac] Tests using `@inngest/test` engine for deterministic replay
- [ac] Registered in `apps/web/src/app/api/inngest/route.ts`

**Files**:
- Create: `apps/web/src/lib/workflows/crypto-paper-trade.ts`
- Create: `apps/web/tests/s6-cry-01-paper-trade.test.ts`
- Modify: `apps/web/src/app/api/inngest/route.ts` (register function)

**Dependencies**: S6-INF-CRY (crypto stores), S6-CF-02 (real HITL pattern)

**TDD Micro-Tasks**:
1. Red: Trigger `crypto/signal.created` → LLM analyze step executes
2. Green: Wire `llmGateway.complete()` with signal analysis prompt
3. Red: Position size exceeding 3% → signal rejected
4. Green: Implement risk validation logic
5. Red: Approved signal → paper execution with simulated slippage
6. Green: Create `TradeExecution` with `isPaper: true`, calculated entry price
7. Red: HITL timeout (15m) → signal status updated to 'expired'
8. Green: Handle `waitForEvent` returning null
9. Red: Full flow → audit trail recorded
10. Green: Call `auditService.emit()` with trade lifecycle data

---

#### S6-HR-01: Candidate Application Workflow (4 SP)

**Description**: Implement the initial HR workflow — a candidate application Inngest function that exercises the platform pipeline: application intake → LLM resume parsing → candidate record creation → interview scheduling → notification. This validates FR-HR-CM-001 (Centralized Candidate Repository) and HR-WF-CANDIDATE-001.

**FRD**: `hr-domain-frd.md` §3.1 (HR-WF-CANDIDATE-001), §4.1 (FR-HR-CM-001)

**Acceptance Criteria**:
- [ac] Inngest function `hr/candidate-application` triggered by `hr/application.received` event
- [ac] Step 1: `step.run('parse-resume')` — LLM gateway extracts name, email, skills from resume text
- [ac] Step 2: `step.run('check-duplicate')` — Query `CandidateStore.findByEmail()` to detect duplicates
- [ac] Step 3: `step.run('create-candidate')` — Create candidate + application records in stores
- [ac] Step 4: `step.run('consent-check')` — Verify consent status; if missing, send consent request notification
- [ac] Step 5: `step.run('notify-recruiter')` — Send notification to recruiter about new application
- [ac] Step 6: `step.run('audit-trail')` — Record audit event for application intake
- [ac] Duplicate candidate → skip creation, link new application to existing candidate
- [ac] Tests using `@inngest/test` engine for deterministic replay
- [ac] Registered in `apps/web/src/app/api/inngest/route.ts`

**Files**:
- Create: `apps/web/src/lib/workflows/hr-candidate-flow.ts`
- Create: `apps/web/tests/s6-hr-01-candidate-flow.test.ts`
- Modify: `apps/web/src/app/api/inngest/route.ts` (register function)

**Dependencies**: S6-INF-HR (HR stores), S6-INF-SEED (notification templates)

**TDD Micro-Tasks**:
1. Red: Trigger `hr/application.received` → resume parse step executes
2. Green: Wire `llmGateway.complete()` with resume extraction prompt
3. Red: Existing candidate email → returns existing candidate ID
4. Green: Query `CandidateStore.findByEmail()`, skip creation if found
5. Red: New candidate → record created in store
6. Green: Call `CandidateStore.create()` + `ApplicationStore.create()`
7. Red: Missing consent → consent request notification sent
8. Green: Check `consentStatus`, call `notificationService.send()` with template
9. Red: Full flow → audit trail recorded
10. Green: Call `auditService.emit()` with application intake data

---

### Phase 4: Documentation (Day 10)

#### S6-DOC: Sprint 6 Documentation (2 SP)

**Description**: Update all documentation for Sprint 6 completion.

**Acceptance Criteria**:
- [ac] `WARNINGS_REGISTER.md` updated — S4-W10 and T1-W23 marked resolved
- [ac] `phase-1-sprint-plan.md` Sprint 6 section updated with DoD checkboxes
- [ac] `MEMORY.md` updated with Sprint 6 deliverables
- [ac] Multi-model implementation review conducted

**Files**:
- Modify: `docs/WARNINGS_REGISTER.md`
- Modify: `docs/06-sprints/phase-1-sprint-plan.md`

**Dependencies**: All tasks complete

---

## 2. Dependency Graph

```
Phase 1 (Days 1-3) — all independent:
  S6-CF-01 (SLO cron, 3SP)      ─────────────────────────────────┐
  S6-CF-02 (HITL fix, 1SP)      ─────────────────────────────────┤
  S6-CF-03 (Body limits, 1SP)   ─────────────────────────────────┤
  S6-CF-04 (Tech debt, 1SP)     ────────┐                        │
                                         ▼                        │
Phase 2 (Days 4-7):                                               │
  S6-INF-CRY (Crypto infra, 4SP) ──┬──→ S6-INF-SEED (Seeds, 2SP)│
  S6-INF-HR (HR infra, 4SP) ───────┘         │                   │
                                              ▼                   ▼
Phase 3 (Days 8-10):
  S6-CRY-01 (Paper trade, 4SP)   ← S6-INF-CRY + S6-CF-02 + S6-CF-03
  S6-HR-01 (Candidate flow, 4SP) ← S6-INF-HR + S6-INF-SEED + S6-CF-03
                                              │
                                              ▼
Phase 4 (Day 10):
  S6-DOC (Documentation, 2SP)    ← all above
```

**Critical path**: S6-CF-04 → S6-INF-CRY/HR → S6-INF-SEED → S6-CRY-01/HR-01 → S6-DOC

---

## 3. Architectural Decisions

### Q1: Domain Schema Location

**Decision**: `packages/database/src/schema/{crypto,hr}-domain.ts`

Domain schemas live alongside platform schemas in `@aptivo/database`. This maintains the "single package owns all DB access" principle from Sprint 5. Domain packages (if created later) remain DB-agnostic with store interfaces.

### Q2: Domain Store Adapter Location

**Decision**: `packages/database/src/adapters/{crypto,hr}-stores.ts`

Same pattern as platform adapters — one file per domain containing all store implementations. Each exports factory functions (`createDrizzleTradeSignalStore(db)`, etc.).

### Q3: Domain Event Schema Composition

**Decision**: Extend `inngest.ts` EventSchemas union type.

```typescript
// apps/web/src/lib/inngest.ts
type CryptoEvents = {
  'crypto/signal.created': { data: { signalId: string; token: string; ... } };
  'crypto/trade.requested': { data: { signalId: string; tradeId: string } };
  // ...
};

type HrEvents = {
  'hr/application.received': { data: { resumeText: string; source: string; ... } };
  'hr/interview.scheduled': { data: { applicationId: string; dateTime: string } };
  // ...
};

export const inngest = new Inngest({
  id: 'aptivo-platform',
  schemas: new EventSchemas().fromRecord<
    SpikeEvents & PlatformEvents & DemoEvents & CryptoEvents & HrEvents
  >(),
});
```

### Q4: Domain Workflow Location

**Decision**: `apps/web/src/lib/workflows/{crypto,hr}-*.ts`

Domain workflows live in the web app alongside the demo workflow. They follow the same Inngest function pattern with `step.run()` per subsystem. If the project outgrows a single app, workflows can be extracted to domain packages later — but for now, colocation with the composition root is simpler.

### Q5: RBAC Permission Naming

**Decision**: `domain/resource.action` pattern.

Examples:
- `crypto/signal.create`, `crypto/signal.view`, `crypto/trade.execute`
- `hr/candidate.create`, `hr/candidate.view`, `hr/offer.approve`

This aligns with the existing `resourceType` field in audit logs and the `permission` column in `rolePermissions`.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| SLO runtime integration + S4-W10 + T1-W23 | 3 | **Commit** | Dead code at runtime — must wire |
| Demo HITL real wiring | 1 | **Commit** | Wrong pattern for domain devs |
| Body limits route guard | 1 | **Commit** | New domain routes need protection |
| Tech debt batch | 1 | **Commit** | Low effort, high cleanup value |
| Crypto domain infrastructure | 4 | **Commit** | Blocking for crypto workflows |
| HR domain infrastructure | 4 | **Commit** | Blocking for HR workflows |
| RBAC + notification seeds | 2 | **Commit** | Blocking for domain access control |
| Crypto paper trading workflow | 4 | **Commit** | Domain kickoff deliverable |
| HR candidate flow workflow | 4 | **Commit** | Domain kickoff deliverable |
| Documentation | 2 | **Commit** | Sprint completion requirement |
| S3 deleteObject idempotency | — | **Defer** | Not blocking domain work |
| INT-02 Admin Dashboard | 5 | **Defer → Sprint 7** | No domain data to display yet |
| INT-03 LLM Usage Dashboard | 3 | **Defer → Sprint 7** | Stub LLM providers — no real usage |
| S2-W12 LLM spend dashboard | — | **Defer → Sprint 7** | Same as INT-03 |

**Committed**: 26 SP | **Deferred**: 8+ SP

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | S6-CF-01 (3), S6-CF-02 (1), S6-INF-CRY (4), S6-CRY-01 (4), S6-DOC (0.5) | 12.5 |
| **Web Dev 1** | S6-CF-03 (1), S6-INF-HR (2), S6-INF-SEED (2), S6-HR-01 (2), S6-DOC (0.5) | 7.5 |
| **Web Dev 2** | S6-CF-04 (1), S6-INF-HR (2), S6-HR-01 (2), S6-DOC (1) | 6 |
| **Total** | | **26 SP** |

Senior has higher load (12.5 SP) due to crypto domain ownership and SLO wiring complexity. This aligns with the phase-1-sprint-plan's Track A (Senior = Crypto) and Track B (Web Devs = HR) allocation.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Domain FRD scope larger than expected | Medium | Medium | Sprint 6 = one workflow per domain; full business logic in Sprint 7 |
| Domain schema design decisions take time | Medium | Low | FRDs already specify entities; follow existing Drizzle patterns |
| Carry-forwards take longer than estimated | Low | Medium | Phase 1 is familiar code; 4 SP buffer absorbs overruns |
| MCP exchange/HR tool integration issues | Medium | Low | Use InMemoryTransportAdapter for dev; real integrations in Sprint 7 |
| Cross-domain infrastructure conflicts | Low | Low | Schemas are domain-scoped; adapters are independent files |
| LLM prompts need iteration for resume/signal parsing | Medium | Low | Start with simple prompts; refine in Sprint 7 |

---

## 7. Definition of Done

- [x] SLO evaluators wired as Inngest cron function (every 5m) *(S6-CF-01)*
- [x] S4-W10 + T1-W23 evaluators added *(S6-CF-01)*
- [x] Demo workflow uses real HITL `createRequest()` *(S6-CF-02)*
- [x] Body limits wired into API route handlers *(S6-CF-03)*
- [x] DrizzleClient type deduplicated, PII sanitizer exact matching, TransactionalAuditStore unexported *(S6-CF-04)*
- [x] Crypto schema: monitoredWallets, tradeSignals, tradeExecutions, portfolioStates *(S6-INF-CRY)*
- [x] Crypto store adapters + service composition wired *(S6-INF-CRY)*
- [x] HR schema: candidates, applications, interviews, interviewFeedback, consentRecords *(S6-INF-HR)*
- [x] HR store adapters + service composition wired *(S6-INF-HR)*
- [x] Domain RBAC roles + permissions seeded *(S6-INF-SEED)*
- [x] Domain notification templates seeded *(S6-INF-SEED)*
- [x] Paper trading workflow: signal → LLM → risk check (3%) → HITL → simulated execution → audit *(S6-CRY-01)*
- [x] Candidate flow workflow: application → LLM resume parse → duplicate check → record creation → notification *(S6-HR-01)*
- [x] Both domain workflows registered in Inngest route *(S6-CRY-01, S6-HR-01)*
- [x] 80%+ test coverage across new code — 83 new tests
- [x] Documentation complete *(S6-DOC)*

---

## 8. Sprint 7 Preview (Weeks 15-16)

Based on Sprint 6 deferrals and natural progression:

| Item | SP (est.) | Source |
|------|-----------|--------|
| INT-02: Admin Dashboard | 5 | Deferred from Sprint 5 |
| INT-03 + S2-W12: LLM Usage Dashboard | 3 | Deferred from Sprint 5 |
| Crypto: Full trading workflows (smart money, narrative, security) | 8 | CRYPTO-WF-SMT-001, NS-001, SEC-001 |
| HR: Interview + contract workflows | 6 | HR-WF-INTERVIEW-001, HR-WF-CONTRACT-001 |
| Domain hardening: RBAC enforcement tests, domain audit coverage | 3 | Integration testing |
| S3 deleteObject idempotency | 1 | Tech debt carry-forward |
