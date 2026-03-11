# Sprint 7 Plan — Multi-Model Review

**Date**: 2026-03-11
**Models**: Claude Opus 4.6 (lead) + Gemini 3 Flash Preview (via Pal clink) + Codex/GPT (via Codex MCP)
**Scope**: Sprint 7 implementation planning (Phase 1 final sprint, weeks 15-16)
**Verdict**: CONSENSUS REACHED — 28 SP committed, 11 tasks

---

## 1. Executive Summary

Sprint 7 is the final Phase 1 sprint. All three models converged on a plan after one debate round. The plan focuses on: (1) closing Sprint 6 carry-forwards, (2) delivering the twice-deferred Admin and LLM dashboards, (3) adding one crypto workflow (security detection — the safety gate for systematic trading), (4) adding two HR workflows (interview scheduling + contract approval), and (5) Phase 1 closure documentation.

Key consensus: SMT-001 (smart money tracking) and NS-001 (narrative scouting) are deferred to Phase 2 — they require MCP server implementations that don't exist yet, and building them against stubs provides no real integration validation.

---

## 2. Consensus Findings

### CF-1: Crypto scope limited to SEC-001 only (3/3 unanimous)

All three models agree that SEC-001 (Security Detection Workflow) is the right crypto deliverable for Sprint 7:
- It establishes the critical safety gate pattern needed before live systematic trading (TRD-001)
- It exercises the LLM + MCP composition pattern against real platform services
- SMT-001 and NS-001 are deferred because they depend on real MCP transport (Basescan, social data sources) — currently only `InMemoryTransportAdapter` stubs exist

### CF-2: Schema additions are a blocking prerequisite (3/3 unanimous)

The Crypto FRD defines `SecurityReport` and the HR FRD defines `Contract` + `Position` entities that don't exist in the current DB schema. Both domain workflows require these tables. All models agree a schema infrastructure task must precede the workflow tasks.

### CF-3: Dashboards scoped as API-first with minimal UI (3/3 post-debate)

Initially Gemini proposed full Recharts UI. After debate, all agree:
- No chart library should be introduced in the final sprint
- Dashboard scope = robust API backends + minimal server-rendered tabular pages
- Full dashboard UI (charts, widgets, interactive filters) is Phase 2

### CF-4: Documentation task required (3/3 unanimous)

Every previous sprint included a documentation task. S7-DOC covers Phase 1 closure: WARNINGS_REGISTER final update, sprint plan DoD checkboxes, MEMORY.md, and a Phase 1 handover summary.

### CF-5: Phase ordering — foundation before dashboards (3/3 unanimous)

SLO real metrics (CF-01) must be wired before dashboards (INT-02/INT-03) can display real data. The shared MetricService pattern ensures cron and dashboards use the same data source.

---

## 3. Debated Items

### D-1: SLO real metrics SP estimate

| Model | Initial | Revised | Rationale |
|-------|---------|---------|-----------|
| Gemini | 2 SP | 4 SP | 6 aggregation queries + MetricService design + test coverage |
| Codex | 4 SP | 3 SP | Simple queries but MetricService contract + time-window correctness adds effort |
| Claude (lead) | — | **3 SP** | 6 providers are straightforward Drizzle COUNT/AVG queries; real effort is dep wiring + testing |

**Verdict**: 3 SP — compromise. The queries are simple but the wiring, shared service interface, and test coverage for 6 providers justify more than 2 SP.

### D-2: HR workflow SP estimates

| Model | Interview | Contract | Schema separate? |
|-------|-----------|----------|-----------------|
| Gemini | 3 SP | 3 SP | Yes (combined in S7-INF-01) |
| Codex | 3 SP (revised from 4) | 3 SP (revised from 4) | Yes (INF-HR-SCHEMA-02: 3 SP) |
| Claude (lead) | **3 SP** | **3 SP** | **Yes (S7-INF-01: 3 SP combined)** |

**Verdict**: 3 SP each for workflows, with schema work in a separate combined infrastructure task. Interview scheduling uses existing `interviews` table. Contract approval depends on new `contracts` table from S7-INF-01.

### D-3: INT-02 Admin Dashboard SP

| Model | Estimate | Notes |
|-------|----------|-------|
| Gemini | 5 SP | Full UI with Server Components |
| Codex | 5 SP | RBAC-gated, server-side APIs |
| Claude (lead) | **5 SP** | API-first + minimal UI, but RBAC middleware is new infrastructure |

**Verdict**: 5 SP — all agree. Even with API-first scope, RBAC enforcement middleware and multiple aggregation API endpoints justify the estimate.

---

## 4. Final Task List (28 SP, 11 tasks)

### Phase 1: Foundation & Carry-Forwards (8 SP, Days 1-3)

| Task | SP | Description |
|------|----|-------------|
| S7-CF-01 | 3 | Wire real SLO metric providers (6 Drizzle aggregation queries + shared MetricService) |
| S7-CF-02 | 1 | Apply `withBodyLimits` to new domain API routes |
| S7-CF-03 | 1 | Crypto approver notification in paper trade workflow |
| S7-TD-01 | 1 | S3 `deleteObject` idempotency |
| S7-INF-01 | 2 | Domain schema additions: `securityReports` (crypto), `contracts` + `positions` (HR) + store adapters |

### Phase 2: Platform Dashboards (8 SP, Days 4-7)

| Task | SP | Description |
|------|----|-------------|
| S7-INT-02 | 5 | Admin Dashboard: RBAC middleware + metrics/audit APIs + minimal admin pages |
| S7-INT-03 | 3 | LLM Usage Dashboard: per-domain/provider cost aggregation API + minimal usage page (closes S2-W12) |

### Phase 3: Domain Workflows (9 SP, Days 5-9)

| Task | SP | Description |
|------|----|-------------|
| S7-CRY-01 | 3 | Security Detection Workflow (SEC-001): liquidity + honeypot + mintable checks via MCP, risk scoring |
| S7-HR-01 | 3 | Interview Scheduling Workflow (INTERVIEW-001): availability check + slot proposal + calendar event |
| S7-HR-02 | 3 | Contract Approval Workflow (CONTRACT-001): template drafting + DOLE compliance + HITL approval |

### Phase 4: Documentation (2 SP, Day 10)

| Task | SP | Description |
|------|----|-------------|
| S7-DOC | 2 | Phase 1 closure: WARNINGS_REGISTER, sprint plan DoD, MEMORY.md, Phase 1 handover summary |

**Total committed**: 28 SP | **Buffer**: 2 SP (30 SP capacity)

### Deferred to Phase 2

| Item | SP est. | Rationale |
|------|---------|-----------|
| CRYPTO-WF-SMT-001 (Smart Money Tracking) | 5 | Requires real MCP transport (Basescan, Arbiscan) |
| CRYPTO-WF-NS-001 (Narrative Scouting) | 4 | Requires social data MCP sources |
| CRYPTO-WF-TRD-001 full lifecycle (execution + monitoring) | 8 | Depends on SEC-001 + real exchange MCP |
| FR-CRYPTO-RISK-002 (Daily Loss Limit circuit breaker) | 3 | Requires position monitoring loop first |
| FR-HR-CM-002 (Custom workflow editor UI) | 5 | Full UI feature, Phase 2 |
| FR-HR-CM-005 full SAR/anonymization exports | 3 | Compliance reporting, Phase 2 |
| FR-HR-COMP-002/004/005 (DPA subject rights, BIR retention, tax export) | 5 | Regulatory compliance features |
| Full dashboard UI (charts, interactive filters) | 5 | Recharts/charting library, Phase 2 |
| Multi-approver quorum | 3 | HITL enhancement, Phase 2 |
| Bucket D warnings (S2-W5, S3-W10, S5-W17) | — | Remain deferred per register |

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | S7-CF-01 (3), S7-CF-03 (1), S7-INF-01-crypto (1), S7-CRY-01 (3), S7-DOC (0.5) | 8.5 |
| **Web Dev 1** | S7-INT-02 (5), S7-CF-02 (1), S7-HR-02 (3), S7-DOC (0.5) | 9.5 |
| **Web Dev 2** | S7-INT-03 (3), S7-TD-01 (1), S7-INF-01-hr (1), S7-HR-01 (3), S7-DOC (1) | 9 |
| **Total** | | **27 SP** (1 SP shared DOC overlap) |

---

## 6. Risk Assessment (Consensus)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dashboard aggregation query performance | Medium | Low | Use indexed time-range queries with pagination (max 200) |
| MCP integration flakiness for security checks | Medium | Medium | Circuit breaker fail-closed for safety; mock-driven tests for Sprint 7 |
| Schema additions causing migration complexity | Low | Medium | Idempotent migrations with `onConflictDoNothing` pattern |
| Phase 1 timeline pressure (28 SP) | Medium | Medium | Dashboards can be simplified further if domain work overflows |
| LLM prompt accuracy for compliance checks | Medium | Low | Zod structured output with HITL fallback for edge cases |

---

## 7. Model Attribution

| Finding | Source | Adopted? |
|---------|--------|----------|
| Defer SMT-001/NS-001 | Codex (initial), Claude (debate) | Yes — Gemini revised to agree |
| Schema prerequisite task | Codex (initial), Claude (debate) | Yes — both models agreed after debate |
| API-first dashboards | Claude (debate) | Yes — Gemini revised from full UI |
| SLO metrics 3 SP | Codex (revised), Claude (verdict) | Yes — compromise between 2 and 4 |
| Crypto approver notification | Codex (initial) | Yes — Gemini revised to include |
| S7-DOC task | Claude (debate) | Yes — both models agreed |
| MarketNarrative table deferred | Claude (verdict) | Yes — NS-001 deferred so table not needed |
