# Phase 1 Sprint Plan

**Timeline**: 16 weeks (6 platform sprints + 2 domain kickoff sprints)
**Team**: 3 developers (1 Senior, 2 Web Devs)
**Goal**: Core platform infrastructure enabling both Crypto and HR domains
**Derived from**: [Platform Core FRD](../02-requirements/platform-core-frd.md) — all sprint tasks trace to FR-CORE requirements

---

## Phase 1 Scope Decision

Every FR-CORE requirement is classified below. No requirement is left unaddressed — each is either built, bought, scope-limited for Phase 1, or explicitly deferred.

### Build (Sprint Tasks)

| FRD Requirement | Sprint | Tasks |
|-----------------|--------|-------|
| FR-CORE-LLM-001 Route to Providers | 1 | LLM-03, LLM-04, LLM-05, LLM-08 |
| FR-CORE-LLM-002 Usage & Cost Tracking | 1 | LLM-01, LLM-02, LLM-06, LLM-07 |
| FR-CORE-LLM-003 Fallback on Failure | 1 | LLM-08 (one-hop fallback) |
| FR-CORE-HITL-001 Create Requests | 2 | HITL-05 |
| FR-CORE-HITL-002 Suspension/Resumption | 2 | HITL-07 |
| FR-CORE-HITL-005 Multi-Channel Endpoints | 2 | HITL-08, HITL-09 |
| FR-CORE-HITL-006 Audit HITL Actions | 2, 4 | HITL-06 (logging), AUD-03 (audit middleware) |
| FR-CORE-ID-002 RBAC | 2 | ID-01, ID-02 |
| FR-CORE-MCP-001 Register/Manage Tools | 3 | MCP-01, MCP-06 |
| FR-CORE-MCP-002 Execute with Error Handling | 3 | MCP-06, MCP-08 |
| FR-CORE-MCP-003 Rate Limits/Circuit Breaking | 3 | MCP-03, MCP-04, MCP-05 |
| FR-CORE-BLOB-001 S3 Storage Interface | 3 | FS-01, FS-02 |
| FR-CORE-BLOB-002 Access Control/Linking | 3 | FS-02, FS-03 |
| FR-CORE-AUD-001 Immutable Audit Logging | 4 | AUD-01, AUD-02, AUD-03, AUD-04 |
| FR-CORE-NOTIF-001 Multiple Channels | 4 | NOTIF-01 |

### Buy (Vendor-Provided)

| FRD Requirement | Vendor | Validated By |
|-----------------|--------|--------------|
| FR-CORE-WFE-002 Durable State Persistence | Inngest | SP-02, SP-07 |
| FR-CORE-WFE-003 Durable Timers | Inngest | SP-02 |
| FR-CORE-WFE-004 Multiple Triggers | Inngest | SP-01 |
| FR-CORE-WFE-006 Parallel/Conditional | Inngest | SP-01 |
| FR-CORE-ID-001 Passwordless Auth | Supabase Auth | SP-03 |
| FR-CORE-NOTIF-002 Template-Based Messaging | Novu | SP-04 |

### Phase 1 Scope-Limited

These are built but with reduced acceptance criteria. Documented here to prevent scope creep.

| FRD Requirement | Phase 1 Scope | Full Scope (Phase 2+) |
|-----------------|---------------|----------------------|
| FR-CORE-WFE-001 Workflow States/Transitions | Code-defined workflows via SDK | CRUD API + versioning + visual builder |
| FR-CORE-WFE-005 Retry & Compensation | Inngest built-in retries + documented saga pattern (CF-01) | Compensation library with orchestrated rollback |
| FR-CORE-HITL-003 Approve/Reject/Changes | Approve and reject with comments | "Request changes" decision type |
| FR-CORE-HITL-004 Approval Policies | Single-approver with configurable TTL + auto-timeout | Multi-approver, quorum, auto-reject on expiry |
| FR-CORE-ID-003 Session Management | Session revocation (HITL-11) + Supabase defaults | Concurrent session limits, token rotation on privilege change |

### Deferred to Phase 2+

| FRD Requirement | Rationale |
|-----------------|-----------|
| FR-CORE-WFE-007 Parent/Child Workflows | Explicitly deferred per ADD §2.3.2 |
| FR-CORE-AUD-002 Query & Export with Checksums | Phase 1 builds the write path; query/export is a reporting feature |
| FR-CORE-AUD-003 Retention Policies | Requires domain-specific compliance rules not yet defined |
| FR-CORE-NOTIF-003 Priority Routing & Quiet Hours | Requires notification volume that doesn't exist until domains are live |
| FR-CORE-INT-001 Workflow Logic Export | No consumers until visual builder (Phase 2) |
| FR-CORE-INT-002 Extensible Action Points | Basic webhook support in INT-01 demo; full extensibility Phase 2 |

---

## FRD Traceability Matrix

Complete mapping of all 32 FR-CORE requirements to implementation status.

| FRD ID | Title | Coverage | Sprint | Notes |
|--------|-------|----------|--------|-------|
| FR-CORE-WFE-001 | Workflow States/Transitions | Scope-limited | - | Code-defined via Inngest SDK |
| FR-CORE-WFE-002 | Durable State Persistence | Buy | - | Inngest (SP-02, SP-07) |
| FR-CORE-WFE-003 | Durable Timers | Buy | - | Inngest (SP-02) |
| FR-CORE-WFE-004 | Multiple Triggers | Buy | - | Inngest (SP-01) |
| FR-CORE-WFE-005 | Retry & Compensation | Scope-limited | 1 | CF-01 saga pattern + Inngest retries |
| FR-CORE-WFE-006 | Parallel/Conditional | Buy | - | Inngest (SP-01) |
| FR-CORE-WFE-007 | Parent/Child Workflows | Deferred | - | Phase 2+ (ADD §2.3.2) |
| FR-CORE-HITL-001 | Create Requests | Full | 2 | HITL-05 |
| FR-CORE-HITL-002 | Suspension/Resumption | Full | 2 | HITL-07 |
| FR-CORE-HITL-003 | Approve/Reject/Changes | Scope-limited | 2 | HITL-06 (approve/reject only) |
| FR-CORE-HITL-004 | Approval Policies | Scope-limited | 2 | Single-approver + TTL |
| FR-CORE-HITL-005 | Multi-Channel Endpoints | Full | 2 | HITL-08, HITL-09 |
| FR-CORE-HITL-006 | Audit HITL Actions | Full | 2, 4 | HITL-06 + AUD-03 |
| FR-CORE-MCP-001 | Register/Manage Tools | Full | 3 | MCP-01, MCP-06 |
| FR-CORE-MCP-002 | Execute with Error Handling | Full | 3 | MCP-06, MCP-08 |
| FR-CORE-MCP-003 | Rate Limits/Circuit Breaking | Full | 3 | MCP-03, MCP-04, MCP-05 |
| FR-CORE-LLM-001 | Route to Providers | Full | 1 | LLM-03, LLM-04, LLM-05, LLM-08 |
| FR-CORE-LLM-002 | Usage & Cost Tracking | Full | 1 | LLM-01, LLM-06, LLM-07 |
| FR-CORE-LLM-003 | Fallback on Failure | Full | 1 | LLM-08 (one-hop) |
| FR-CORE-NOTIF-001 | Multiple Channels | Full | 4 | NOTIF-01 |
| FR-CORE-NOTIF-002 | Template-Based Messaging | Buy | - | Novu (SP-04) |
| FR-CORE-NOTIF-003 | Priority Routing | Deferred | - | Phase 2+ |
| FR-CORE-AUD-001 | Immutable Audit Logging | Full | 4 | AUD-01 through AUD-04 |
| FR-CORE-AUD-002 | Query & Export | Deferred | - | Phase 2+ |
| FR-CORE-AUD-003 | Retention Policies | Deferred | - | Phase 2+ |
| FR-CORE-BLOB-001 | S3 Storage Interface | Full | 3 | FS-01, FS-02 |
| FR-CORE-BLOB-002 | Access Control/Linking | Full | 3 | FS-02, FS-03 |
| FR-CORE-ID-001 | Passwordless Auth | Buy | - | Supabase Auth (SP-03) |
| FR-CORE-ID-002 | RBAC | Full | 2 | ID-01, ID-02 |
| FR-CORE-ID-003 | Session Management | Scope-limited | 2 | HITL-11 (revocation) |
| FR-CORE-INT-001 | Workflow Logic Export | Deferred | - | Phase 2+ |
| FR-CORE-INT-002 | Extensible Action Points | Deferred | - | Phase 2+ (basic webhooks in INT-01) |

**Summary**: 15 Full + 6 Buy + 5 Scope-limited + 6 Deferred = 32 requirements accounted for

---

## Sprint 0: Foundation & Validation (Complete)

**Theme**: "Can we build on this?" — Validate assumptions before committing
**Weeks**: 1-2

**SOT**: [Sprint 0 Technical Spikes Plan](./sprint-0-technical-spikes.md) — contains all spike specifications, schedules, and Go/No-Go criteria.

### Summary

- **15 technical spikes** (4 original + 11 from multi-model risk analysis)
- **4 foundational tasks** (monorepo, database, app shell, shared types)
- **4 CRITICAL spikes** must pass for Phase 1 to proceed
- **4 security-critical spikes** (SP-06, SP-11, SP-13, SP-14) require implemented mitigations, not just documentation

### Sprint 0 Definition of Done

See [spike-results/](./spike-results/) for individual spike outcomes.

- [x] All spikes have documented results
- [x] Go/No-Go decision made for each risk area — see [SPRINT_0_GO_NO_GO_MULTI_REVIEW.md](SPRINT_0_GO_NO_GO_MULTI_REVIEW.md)
- [x] Architecture pivots documented as ADRs (none required — all spikes passed)
- [x] Monorepo builds with `pnpm build`
- [ ] Database migrations run successfully
- [x] CI pipeline green (lint, typecheck, test)

---

## Sprint 1: Platform Core — LLM Gateway (Complete)

**Theme**: "Track every token" — BRD-mandated cost tracking first
**Weeks**: 3-4
**FRD Coverage**: FR-CORE-LLM-001, LLM-002, LLM-003

### Why LLM Gateway First?
1. Required by BRD (BO-CORE-003: "LLM costs tracked per workflow")
2. Needed by all AI features in both domains
3. Relatively self-contained (fewer dependencies)

### Tasks

| Task | Owner | SP | Dependencies | FRD |
|------|-------|----|--------------|-----|
| **LLM-01: Usage Logs Schema** | Senior | 2 | FW-02 | LLM-002 |
| **LLM-02: Budget Config Schema** | Senior | 2 | FW-02 | LLM-002 |
| **LLM-03: Provider Abstraction** | Senior | 5 | FW-04 | LLM-001 |
| **LLM-04: OpenAI Provider** | Web Dev 1 | 3 | LLM-03 | LLM-001 |
| **LLM-05: Anthropic Provider** | Web Dev 2 | 3 | LLM-03 | LLM-001 |
| **LLM-06: Cost Calculation** | Web Dev 1 | 2 | LLM-03 | LLM-002 |
| **LLM-07: Budget Enforcement** | Senior | 3 | LLM-01, LLM-02 | LLM-002 |
| **LLM-08: Gateway Service** | Senior | 5 | All above | LLM-001, LLM-003 |
| **LLM-09: Unit Tests** | All | 3 | LLM-08 | - |
| **LLM-10: Per-User Rate Limiting** | Senior | 3 | LLM-08 | LLM-002 |

**Hardening scope (WARNING extensions)**:
- LLM-06 extended: Non-LLM cost attribution instrumentation *(S2-W11)*
- LLM-08 includes: LLM output validation via Zod *(S1-W13)*
- LLM-10: Per-user/session token bucket rate limiting *(S2-W1)*

### Carry-Forward Conditions (from Go/No-Go Review)

| Task | Owner | SP | Dependencies | Priority |
|------|-------|----|--------------|----------|
| **CF-01: Saga Pattern Enforcement** *(C3)* | Senior | 2 | SP-01 | MEDIUM |
| **CF-02: Supply-Chain CI Gate** *(C2)* | Senior | 2 | SP-13 | MEDIUM |

- **CF-01**: Documented saga wrapper pattern preventing try/catch around `step.run()` *(Go/No-Go C3)*
- **CF-02**: `runPreDeployVerification()` wired into CI as mandatory gate *(Go/No-Go C2)*

### Sprint 1 Definition of Done
- [x] LLM Gateway tracks cost per request — `CostBreakdown` in `@aptivo/llm-gateway/cost`
- [x] Budget limits block requests when exceeded — `BudgetService` with $50 daily / $500 monthly enforcement
- [x] Per-user rate limiting prevents single-user budget exhaustion *(S2-W1)* — `TokenBucket` in `@aptivo/llm-gateway/rate-limit`
- [x] Cost attribution covers LLM + infrastructure resources *(S2-W11)* — 5% infra overhead in `CostBreakdown`
- [x] Saga pattern wrapper/lint rule prevents try/catch around step.run() *(C3)* — Coding Guidelines §8b
- [x] Supply-chain pre-deploy gate wired into CI with demonstrated failing-gate behavior *(C2)* — `tools/verify-supply-chain.ts`
- [x] 80%+ test coverage on gateway service — 115 tests, 90.15% branch coverage
- [x] Documented in `packages/llm-gateway/README.md`

---

## Sprint 2: HITL Gateway + RBAC Foundation

**Theme**: "Humans approve, machines obey roles"
**Weeks**: 5-6
**FRD Coverage**: FR-CORE-HITL-001 through HITL-006 (scope-limited), FR-CORE-ID-002, FR-CORE-ID-003 (partial)
**SOT**: [Sprint 2 Implementation Plan](./sprint-2-plan.md) — detailed TDD micro-tasks, database schemas, dependency graph

### HITL Tasks

| Task | Owner | SP | Dependencies | FRD |
|------|-------|----|--------------|-----|
| **HITL-01: Request Schema** | Senior | 2 | Database | HITL-001 |
| **HITL-02: Decision Schema** | Senior | 2 | Database | HITL-003 |
| **HITL-03: Token Generation** | Senior | 3 | - | HITL-001 |
| **HITL-04: Token Verification** | Web Dev 1 | 2 | HITL-03 | HITL-001 |
| **HITL-05: Create Request API** | Senior | 3 | HITL-01, HITL-03 | HITL-001 |
| **HITL-06: Approve/Reject APIs** | Web Dev 1 | 3 | HITL-02, HITL-04 | HITL-003 |
| **HITL-07: Inngest Integration** | Senior | 5 | HITL-05, HITL-06 | HITL-002 |
| **HITL-08: Novu Notifications** | Web Dev 2 | 3 | SP-04 | HITL-005 |
| **HITL-09: Approval UI Page** | Web Dev 2 | 3 | HITL-06 | HITL-005 |
| **HITL-10: Integration Tests** | All | 3 | All above | - |
| **HITL-11: Session Revocation API** | Web Dev 1 | 2 | HITL-03 | ID-003 |

### RBAC Foundation Tasks

| Task | Owner | SP | Dependencies | FRD |
|------|-------|----|--------------|-----|
| **ID-01: RBAC Schema** | Web Dev 2 | 2 | Database | ID-002 |
| **ID-02: RBAC Middleware** | Web Dev 1 | 3 | ID-01 | ID-002 |

- **ID-01**: `user_roles` and `role_permissions` tables + Drizzle migration. Core roles: Admin, User, Viewer. Domain roles: extensible via `domain` column.
- **ID-02**: Role-checking middleware for API routes. Default-deny enforcement. Role changes logged to audit trail (wired to Audit Service in Sprint 4).

**Hardening scope (WARNING extension)**:
- HITL-11: Application-level session revocation endpoint *(S1-W5)*

### Carry-Forward Condition (from Go/No-Go Review)

| Task | Owner | SP | Dependencies | Priority |
|------|-------|----|--------------|----------|
| **CF-03: Redis-Backed Replay Stores** *(C1)* | Senior | 5 | SP-11, SP-14, Redis | HIGH |

- **CF-03**: Replace in-memory `Set<string>` JTI/nonce stores with Redis SETNX + TTL *(Go/No-Go C1)*

### Sprint 2 Definition of Done
- [ ] Workflow can pause for human approval *(HITL-002)*
- [ ] Approval via web UI resumes workflow *(HITL-002, HITL-005)*
- [ ] Email notification sent with approve/reject links *(HITL-005)*
- [ ] RBAC schema deployed with core roles (Admin, User, Viewer) *(ID-002)*
- [ ] RBAC middleware enforces default-deny on API routes *(ID-002)*
- [ ] Session revocation endpoint functional *(ID-003, S1-W5)*
- [ ] JTI and nonce replay stores backed by Redis SETNX + TTL *(C1)*
- [ ] Multi-worker concurrency tests pass for replay protection *(C1)*
- [ ] 80%+ test coverage

---

## Sprint 3: MCP Layer + File Storage

**Theme**: "Tools for agents, storage for humans"
**Weeks**: 7-8
**FRD Coverage**: FR-CORE-MCP-001 through MCP-003, FR-CORE-BLOB-001, FR-CORE-BLOB-002
**SOT**: [Sprint 3 Implementation Plan](./sprint-3-plan.md) — detailed TDD micro-tasks, interface designs, dependency graph
**Architecture**: [Sprint 3 Architecture Review](./SPRINT_3_ARCH_MULTI_REVIEW.md) — resolved Q1-Q4 (Inngest rate limiting, Redis adapters, ClamAV sidecar, AgentKit MCPClient)

### MCP Tasks

| Task | Owner | SP | Dependencies | FRD |
|------|-------|----|--------------|-----|
| **MCP-01: Tool Registry Schema** | Senior | 2 | Database | MCP-001 |
| **MCP-02: AgentKit Setup** | Senior | 3 | SP-01 | MCP-001 |
| **MCP-03: Rate Limit Queue** | Senior | 3 | - | MCP-003 |
| **MCP-04: Circuit Breaker** | Web Dev 1 | 3 | - | MCP-003 |
| **MCP-05: Response Caching** | Web Dev 2 | 3 | Redis | MCP-003 |
| **MCP-06: Wrapper Service** | Senior | 5 | MCP-02 to MCP-05 | MCP-002 |
| **MCP-07: Mock MCP Server** | Web Dev 1 | 2 | Testing | - |
| **MCP-08: Integration Tests** | All | 3 | MCP-06, MCP-07 | - |
| **MCP-09: Event Schema Validation** | Web Dev 2 | 3 | MCP-06 | - |
| **MCP-10: Data Deletion Workflow** | Senior | 3 | MCP-06 | - |

### File Storage Tasks

| Task | Owner | SP | Dependencies | FRD |
|------|-------|----|--------------|-----|
| **FS-01: Storage Adapter** | Web Dev 2 | 3 | - | BLOB-001 |
| **FS-02: Access Control + Entity Linking** | Web Dev 1 | 3 | FS-01, ID-01 | BLOB-001, BLOB-002 |
| **FS-03: ClamAV Integration** | Web Dev 1 | 2 | FS-01 | BLOB-002 |

- **FS-01**: S3-compatible adapter interface (presigned URL upload/download, metadata schema, file versioning). DO Spaces implementation. Maximum file size configurable (default 50MB per FRD).
- **FS-02**: Permission-based access inheriting from linked business entity. File-to-entity linking table. Download logging with user + timestamp.
- **FS-03**: Upload → scan → quarantine/accept pipeline. ClamAV container health check (absorbs old MCP-11). Quarantine flow with notification on detection.

**Hardening scope (WARNING extensions)**:
- MCP-06 includes: MCP response size enforcement *(S1-W14)*
- MCP-09: Inngest event schema validation at publish-time *(S3-W11)*
- MCP-10: Data deletion as multi-step Inngest workflow with per-storage checkpoints *(S4-W9)*

### Sprint 3 Completion Status

**Verdict**: CONDITIONAL PASS — 219 tests passing (187 mcp-layer + 32 file-storage), all typechecks clean.
**Review**: [Sprint 3 Multi-Model Review](./SPRINT_3_IMPL_MULTI_REVIEW.md)

**Carry-forward items** (deferred to Sprint 4 Integration & Hardening):
- `AgentKitTransportAdapter` (MCP-02) — requires `@inngest/agent-kit` dependency
- `S3StorageAdapter` (FS-01) — requires `@aws-sdk/client-s3` dependency
- Data deletion Inngest function wrapper (MCP-10) — ~30 LOC wrapping `executeDataDeletion`
- Scanner circuit breaker wiring (FS-03) — compose `CircuitBreaker` around `ClamAvScanner.scan()`
- `classifyMcpError` in wrapper circuit breaker config (MCP-06) — minor tech debt

### Sprint 3 Definition of Done
- [x] Can call MCP tool from Inngest workflow *(MCP-001, MCP-002)* — `createMcpWrapper(deps)` + `InMemoryTransportAdapter`; AgentKit adapter deferred
- [x] Rate limiting queues requests correctly *(MCP-003)* — `McpRateLimiter` token bucket, fail-closed
- [x] Circuit breaker trips on failures *(MCP-003)* — `CircuitBreakerRegistry` with `shouldRecordFailure` filter
- [x] Responses cached appropriately *(MCP-003)* — `InMemoryCacheStore` + `RedisCacheStore` (fail-open)
- [ ] File upload via presigned URL stores to DO Spaces *(BLOB-001)* — `InMemoryStorageAdapter` done; S3 adapter deferred
- [x] File download enforces access control from linked entity *(BLOB-002)* — `authorizeDownload()` with entity-linked permissions
- [x] ClamAV scans uploads before storage confirmation *(BLOB-002)* — `ClamAvScanner` with clamd protocol + timeout
- [x] Inngest events validated against Zod schemas at publish-time *(S3-W11)* — `createValidatedSender()` with `MCP_EVENT_SCHEMAS`
- [x] Data deletion workflow checkpoints per storage system *(S4-W9)* — `executeDataDeletion()` core; Inngest wrapper deferred
- [x] 80%+ test coverage — 219 tests across 15 test files

---

## Sprint 4: Audit Service + Notification Bus

**Theme**: "Every action recorded, every user notified"
**Weeks**: 9-10
**FRD Coverage**: FR-CORE-AUD-001, FR-CORE-NOTIF-001, FR-CORE-HITL-006 (completion)

### Audit Service Tasks

| Task | Owner | SP | Dependencies | FRD |
|------|-------|----|--------------|-----|
| **AUD-01: Audit Schema** | Senior | 2 | Database | AUD-001 |
| **AUD-02: Audit Write Path** | Senior | 3 | AUD-01 | AUD-001 |
| **AUD-03: Audit Middleware** | Web Dev 1 | 3 | AUD-02, ID-01 | AUD-001, HITL-006 |
| **AUD-04: Async Write + DLQ** | Senior | 2 | AUD-02 | AUD-001 |
| **AUD-05: Unit Tests** | All | 2 | AUD-01 to AUD-04 | - |

- **AUD-01**: `audit_events` table — append-only, partitioned by month. Columns: timestamp, actor_id, action, resource_type, resource_id, metadata (JSONB), event_hash. PII auto-masking configuration.
- **AUD-02**: `AuditService.emit()` — structured audit event writer. Tamper-evidence via SHA-256 hash chaining (each event hash includes previous event hash). Immutable write path (no UPDATE/DELETE).
- **AUD-03**: Middleware that auto-emits audit events for state-changing API routes. Wires into HITL decision path (completing FR-CORE-HITL-006). Wires into RBAC role changes.
- **AUD-04**: Async audit writes with 5s timeout. DLQ for failures. Non-blocking on critical paths (HITL, file access). *(Absorbs T1-W21)*

### Notification Bus Tasks

| Task | Owner | SP | Dependencies | FRD |
|------|-------|----|--------------|-----|
| **NOTIF-01: NotificationService Adapter** | Web Dev 2 | 3 | SP-04 | NOTIF-001 |
| **NOTIF-02: Domain Template Registry** | Web Dev 2 | 2 | NOTIF-01 | NOTIF-001 |
| **NOTIF-03: Notification Tests** | Web Dev 2 | 2 | NOTIF-01, NOTIF-02 | - |

- **NOTIF-01**: SDK-decoupled Novu integration (same adapter pattern as `LLMProvider`). Subscriber management. Email + at least one chat channel. Delivery failure retry + logging. User opt-out by channel.
- **NOTIF-02**: Domain-scoped template registry. Variable substitution (`{{candidate_name}}`). Template versioning and toggle. HITL-08 migrates to use this service.

### Sprint 4 Definition of Done
- [ ] All state-changing actions produce immutable audit events *(AUD-001)*
- [ ] Audit events are tamper-evident via hash chaining *(AUD-001)*
- [ ] HITL decisions and RBAC role changes are audited *(HITL-006)*
- [ ] Audit writes are async with DLQ fallback *(T1-W21)*
- [ ] PII auto-masked in audit metadata *(AUD-001)*
- [ ] Platform notification service sends via email + chat *(NOTIF-001)*
- [ ] Domain-scoped notification templates with variable substitution *(NOTIF-001)*
- [ ] 80%+ test coverage

---

## Sprint 5: Integration & Hardening

**Theme**: "Wire it all together, lock it down"
**Weeks**: 11-12
**FRD Coverage**: End-to-end validation of all platform subsystems
**WARNING scope**: 24 hardening items from concern evaluations, folded in alongside integration work

### Feature Tasks

| Task | Owner | SP | Dependencies |
|------|-------|----|--------------|
| **INT-01: End-to-End Workflow** | Senior | 5 | All subsystems |
| **INT-02: Admin Dashboard (Basic)** | Web Dev 1 | 5 | AUD, RBAC |
| **INT-03: LLM Usage Dashboard** | Web Dev 2 | 3 | LLM Gateway |
| **INT-07: Documentation** | All | 2 | - |

- **INT-01**: Demo workflow: trigger → LLM analysis → HITL approval → MCP action → file storage → audit trail. Validates all 6 platform subsystems working together.
- **INT-02**: Admin UI: view pending approvals, LLM costs, audit log, role management. Protected by RBAC (Admin role required).

### Hardening: Observability (INT-04, 5 SP)

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S5-W13 | Workflow success rate SLO alert | Alert fires when success rate < 99% over 5-min window |
| S5-W14 | HITL delivery latency SLO alert | Alert fires when P95 > 10s |
| S5-W15 | MCP success rate SLO alert | Alert fires when success rate < 99.5% |
| S5-W16 | Audit integrity SLO alert | Alert fires on audit completeness gap |
| S2-W12 | LLM spend dashboard | Grafana: per-domain, per-provider spend with daily/monthly trends |
| S4-W10 | Retention failed run detection | Alert fires on data retention workflow failure |
| T1-W23 | Notification delivery monitoring | Alert fires when delivery rate drops below threshold |

### Hardening: Error Handling (INT-05, 3 SP)

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S6-W17 | Readiness/startup probes | DO App Spec updated with probe configuration |
| S6-W18 | Graceful shutdown | SIGTERM drains in-flight requests; clean BullMQ/Inngest shutdown |

### Hardening: Security (INT-06, 5 SP)

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| T1-W27 | Outbound webhook SSRF validation | SSRF blocklist enforced (private IPs, localhost, metadata) |
| T1-W28 | Inbound webhook body limits + HMAC | 256KB body limit; HMAC signature required |
| T1-W29 | Health check info disclosure | Health endpoints return only status |
| S2-W2 | PII-safe logging | `sanitizeForLogging` redacts email, name, phone, address |
| S2-W3 | Access log PII | Access logs redact/hash PII |
| S1-W8 | Zero-downtime rotation | Dual-key validation for secret rotation |
| S1-W11 | Webhook body size enforcement | 256KB enforced at gateway |
| S1-W12 | Global API body size/depth | 1MB body, 10-level nesting depth at gateway middleware |

### Hardening: Trace Context (INT-08, 5 SP)

| WARNING | Finding | Acceptance Criteria |
|---------|---------|---------------------|
| S7-W24 | Inngest `waitForEvent()` trace propagation | `traceparent` propagated through HITL decision events |
| S7-W25 | BullMQ job trace context | `traceparent` in `QueuedMCPRequest` payload |
| S7-W26 | Novu notification trace context | `traceId` in `novu.trigger()` payload |
| S7-W27 | MCP tool call trace context | `traceparent` header on HTTP/stdio transport |
| S7-W29 | Supabase JWT validation span | Explicit span wrapping JWT validation |
| S7-W30 | Outbound webhook trace context | `traceparent` header in webhook payload |

### Sprint 5 Definition of Done
- [x] Demo workflow: trigger → LLM → HITL → MCP → file → audit *(INT-01)* — `apps/web/src/lib/workflows/demo-workflow.ts`
- [ ] Basic admin UI to view costs, approvals, audit log *(INT-02)* — deferred to Sprint 6
- [x] Structured logging with correlation IDs — W3C traceparent propagation (INT-08)
- [x] No critical security issues — SSRF, body limits, PII redaction, HMAC (INT-06)
- [x] SLO alerts configured for workflow, HITL, MCP, audit *(S5-W13 through S5-W16)* — `slo-alerts.ts`
- [ ] LLM spend dashboard operational *(S2-W12)* — deferred to Sprint 6
- [x] Readiness/startup probes configured *(S6-W17)* — `/health/live` + `/health/ready`
- [x] Graceful shutdown with drain period *(S6-W18)* — `shutdown.ts` with 30s grace
- [x] SSRF validation on outbound webhooks *(T1-W27)* — `ssrf-validator.ts`
- [x] Inbound webhook HMAC + body limits enforced *(T1-W28)* — `body-limits.ts`
- [x] Health check info disclosure mitigated *(T1-W29)* — stripped to `{ status: 'ok' }`
- [x] PII-safe logging across application and access logs *(S2-W2, S2-W3)* — `sanitize-logging.ts`
- [x] API body size/depth limits enforced at gateway *(S1-W11, S1-W12)* — 256KB webhook, 1MB API, depth 10
- [x] Zero-downtime secret rotation verified *(S1-W8)* — dual-key validation documented + implemented
- [x] Trace context propagated across all async boundaries *(S7-W24 through S7-W30)* — HITL, Novu, MCP; S7-W25 N/A (BullMQ)

---

## Sprint 6: Platform Closure & Domain Foundations (Complete)

**Theme**: "Close the loop, light the domains"
**Weeks**: 13-14
**FRD Coverage**: Sprint 5 carry-forwards + FR-CRYPTO-TRD-002 (paper trading) + FR-HR-CM-001 (candidate repository)
**WARNING Closure**: S4-W10 (retention monitoring), T1-W23 (notification monitoring)
**SOT**: [Sprint 6 Implementation Plan](./sprint-6-plan.md)
**Review**: [Sprint 6 Multi-Model Review](./SPRINT_6_IMPL_MULTI_REVIEW.md) — PASS (1,259 tests)

### Sprint 6 Tasks

| Task | SP | Phase | Description |
|------|----|-------|-------------|
| **S6-CF-01** | 3 | Platform Closure | SLO cron wiring + S4-W10/T1-W23 evaluators |
| **S6-CF-02** | 1 | Platform Closure | Wire real HITL `createRequest()` in demo workflow |
| **S6-CF-03** | 1 | Platform Closure | Body limits HOF (`withBodyLimits`) |
| **S6-CF-04** | 1 | Platform Closure | DrizzleClient type dedup + PII sanitizer + unexport |
| **S6-INF-CRY** | 4 | Domain Foundation | Crypto schema (4 tables), store adapters, events |
| **S6-INF-HR** | 4 | Domain Foundation | HR schema (5 tables), store adapters, events |
| **S6-INF-SEED** | 2 | Domain Foundation | Domain RBAC roles + notification templates + MCP servers |
| **S6-CRY-01** | 4 | Domain Kickoff | Paper trading workflow (6-step Inngest function) |
| **S6-HR-01** | 4 | Domain Kickoff | Candidate application workflow (6-step Inngest function) |
| **S6-DOC** | 2 | Documentation | WARNING register, sprint plan, memory updates |

### Sprint 6 Definition of Done
- [x] SLO evaluators wired as Inngest cron function (every 5m) *(S6-CF-01)* — `slo-cron.ts`
- [x] S4-W10 + T1-W23 evaluators added *(S6-CF-01)* — `retentionFailureAlert` + `notificationDeliveryAlert`
- [x] Demo workflow uses real HITL `createRequest()` *(S6-CF-02)* — `@aptivo/hitl-gateway`
- [x] Body limits HOF created *(S6-CF-03)* — `withBodyLimits()` in `route-guard.ts`
- [x] DrizzleClient type deduplicated, PII sanitizer exact matching, TransactionalAuditStore unexported *(S6-CF-04)*
- [x] Crypto schema: monitoredWallets, tradeSignals, tradeExecutions, portfolioStates *(S6-INF-CRY)*
- [x] Crypto store adapters + service composition wired *(S6-INF-CRY)*
- [x] HR schema: candidates, applications, interviews, interviewFeedback, consentRecords *(S6-INF-HR)*
- [x] HR store adapters + service composition wired *(S6-INF-HR)*
- [x] Domain RBAC roles + permissions seeded *(S6-INF-SEED)* — 34 permissions across 7 roles
- [x] Domain notification templates seeded *(S6-INF-SEED)* — 6 templates (2 crypto + 4 HR)
- [x] Paper trading workflow: signal → LLM → risk check (3%) → HITL → simulated execution → audit *(S6-CRY-01)*
- [x] Candidate flow workflow: application → LLM resume parse → duplicate check → record creation → notification *(S6-HR-01)*
- [x] Both domain workflows registered in Inngest route *(S6-CRY-01, S6-HR-01)*
- [x] Multi-model implementation review conducted *(S6-DOC)* — PASS
- [x] 80%+ test coverage across new code — 83 new tests
- [x] Documentation complete *(S6-DOC)*

---

## Sprint 7: Phase 1 Final Delivery (Week 15-16) — COMPLETE

**Theme**: "Close the dashboards, master the domains"
**28 SP committed, 11 tasks, 4 phases**
**Plan**: `docs/06-sprints/sprint-7-plan.md`

### Phase 1: Foundation & Carry-Forwards (4 tasks)
- [x] **S7-CF-01** (3 SP): Real SLO metric providers — shared `MetricService` with Drizzle aggregation queries, wired to SLO cron
- [x] **S7-CF-02** (1 SP): Body limits verified on all domain routes (all Sprint 7 routes are GET-only; `withBodyLimits` ready for POST)
- [x] **S7-CF-03** (1 SP): Crypto approver notification — paper trade sends notification after HITL request (fire-and-forget)
- [x] **S7-TD-01** (1 SP): S3 `deleteObject` idempotent — NotFound returns `Result.ok(undefined)`

### Phase 2: Admin Dashboards (2 tasks)
- [x] **S7-INT-02** (5 SP): Admin Dashboard — RBAC-gated APIs (`/api/admin/overview`, `/audit`, `/hitl`), SLO health status, minimal admin page
- [x] **S7-INT-03** (3 SP): LLM Usage Dashboard — cost-by-domain/provider aggregation, budget endpoint, $5/day alert threshold. **Closes S2-W12.**

### Phase 3: Domain Workflows (3 tasks)
- [x] **S7-CRY-01** (3 SP): Security Detection Workflow — liquidity + honeypot + mintable checks → risk score (0-100) with caching
- [x] **S7-HR-01** (3 SP): Interview Scheduling Workflow — availability check → propose slots → wait for selection → calendar event → notify parties
- [x] **S7-HR-02** (3 SP): Contract Approval Workflow — draft → compliance check → HITL approval → finalize → notify candidate

### Infrastructure
- [x] **S7-INF-01** (2 SP): Schema additions — `securityReports`, `contracts`, `positions` tables + store adapters

### Sprint 7 Test Totals
- **Web app**: 247 tests (16 test files)
- **Database**: 117 tests (6 test files)
- **Monorepo total**: 1,359+ tests (all green)

---

## Package Structure

```
packages/
├── database/           # @aptivo/database - Drizzle schemas, migrations
├── types/              # @aptivo/types - Result, errors, shared types
├── llm-gateway/        # @aptivo/llm-gateway - Provider abstraction, cost tracking
├── hitl-gateway/       # @aptivo/hitl-gateway - Approval tokens, workflow integration
├── mcp-layer/          # @aptivo/mcp-layer - Tool registry, AgentKit wrapper
├── audit/              # @aptivo/audit - Immutable event logging, tamper-evidence
├── file-storage/       # @aptivo/file-storage - S3 adapter, access control, ClamAV
├── notifications/      # @aptivo/notifications - NotificationService adapter, templates
├── config/             # @aptivo/config - Environment, feature flags
└── ui/                 # @aptivo/ui - Shared React components

apps/
├── web/                # Next.js 14 main application
└── inngest/            # Inngest function definitions
```

---

## Story Point Summary

| Sprint | Theme | SP | Weeks | Status |
|--------|-------|----|-------|--------|
| 0 | Foundation & Validation | - | 1-2 | COMPLETE |
| 1 | LLM Gateway | 35 | 3-4 | COMPLETE |
| 2 | HITL Gateway + RBAC | 46 | 5-6 | COMPLETE |
| 3 | MCP Layer + File Storage | 39 | 7-8 | COMPLETE |
| 4 | Audit + Notification | 19 | 9-10 | COMPLETE |
| 5 | Integration & Hardening | 33 | 11-12 | COMPLETE |
| 6 | Domain Kickoff | 32 | 13-14 | COMPLETE |
| 7 | Phase 1 Final Delivery | 28 | 15-16 | COMPLETE |
| **Total Phase 1** | | **232** | **16 weeks** | **COMPLETE** |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Inngest AgentKit doesn't meet needs | Low | High | SP-01 validates early |
| Supabase Auth limitations | Low | Medium | SP-03 validates, fallback to Clerk |
| LLM costs exceed budget | Medium | Medium | Budget enforcement in Sprint 1 |
| Team velocity lower than expected | Medium | Medium | Sprint 4 buffer absorbs overruns |
| RBAC scope creep (domain roles) | Medium | Low | Phase 1 = core roles only; domain roles in Sprint 6-7 |
| File Storage integration delays | Low | Medium | S3 adapter is well-understood; DO Spaces is AWS-compatible |
| Audit write performance | Medium | Medium | Async with DLQ from day 1; optimize in Phase 2 |

---

## Success Metrics

| Metric | Target | Measured At |
|--------|--------|-------------|
| Sprint 0 spike pass rate | 4/4 | End of Sprint 0 |
| FRD requirement coverage | 26/32 (81%) built or bought | End of Sprint 5 |
| Test coverage (platform-core) | 80%+ per package | End of Sprint 5 |
| Demo workflow latency | <5s (excluding HITL wait) | End of Sprint 5 |
| Critical bugs | 0 | End of Sprint 5 |
| Subsystems with zero coverage | 0 | End of Sprint 4 |
