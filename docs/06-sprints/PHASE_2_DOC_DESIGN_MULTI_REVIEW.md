# Phase 2 Doc Design — Multi-Model Review

**Date**: 2026-03-12
**Reviewers**: Claude Opus 4.6 (lead), Gemini 3 Flash Preview, Codex/GPT
**Scope**: Phase 2 pre-work — documentation design before sprint planning
**Verdict**: 14 doc tasks across 3 batches; 6 blocking pre-planning, 5 pre-sprint-1, 3 during P2

---

## Executive Summary

Phase 1 (232 SP) and Phase 1.5 (24 SP) are complete with 1,460 passing tests. Before Phase 2 sprint planning can begin, documentation gaps must be filled — primarily in the Architecture Design Document (ADD) and Technical Specification Documents (TSDs).

All three models agree: the ADD has grown to 192KB without reflecting Sprint 7 dashboards, Phase 1.5 security wiring, or observability infrastructure. Domain architectures (crypto, HR) built across Sprints 6-7 lack architecture docs entirely. 13+ deferred items are scattered across 24+ documents with no consolidated view.

**Total scope**: 14 doc tasks (6S + 5M + 2L), 3 batches, estimated 12-15 working days.

---

## Consensus Findings

### 1. Domain ADDs Must Be Separate Documents

All three models independently concluded that domain architecture should NOT be added to the platform-core ADD:
- **Gemini**: "Domain ADDs must be separate documents due to the massive size (192KB) of the platform ADD"
- **Codex**: "Keep platform ADD as shared-core SSOT; use parent-child links and strict boundary table"
- **Claude**: Agrees — domain architecture churn in Phase 2 will be high; separate docs enable independent evolution

**Decision**: Create `crypto-domain-add.md` and `hr-domain-add.md` as peer documents.

### 2. Phase 2 Roadmap as Standalone SSOT

All three models agree deferred items need consolidation:
- **Gemini**: "Act as the 'Source of Truth' for planning, rather than scattering deferred items across 24+ specs"
- **Codex**: "Planning control document, NOT another mega-spec. Include epics, sequencing, doc-gate checklist, deferred warning closure plan"
- **Claude**: Agrees — epic-level groupings with dependency graph, cross-links to source docs, priority tiers

**Decision**: Create `phase-2-roadmap.md` with epic groupings, not implementation detail.

### 3. Audit TSD Is the Most Critical Missing Spec

All three models identified this as the top TSD gap:
- Only core service without a dedicated TSD
- Audit is architectural (hash chaining, DLQ, async writes) — not just a CRUD adapter
- Phase 2 PII read audit (S2-W5) requires this baseline to be designed against

**Decision**: Create `platform-core/audit.md` in Batch 1 (pre-planning blocker).

### 4. ADD Needs Unified Observability/SLO Section

All three models found observability documentation scattered without a canonical section:
- MetricService, SLO cron, 6 evaluators, metric queries — all implemented but not architecturally documented
- **Codex**: "Consolidate SLO definitions, metric provenance, SLO cron/MetricService, alerting model, deferred burn-rate"
- **Gemini**: "Unified coverage of MetricService, SLO evaluators, and Admin store adapters"

**Decision**: Add §16 to ADD (or expand §11.2) as canonical observability architecture section.

### 5. ADD Needs Admin Dashboard Architecture

Substantial feature (5 API endpoints, 2 store adapters, RBAC integration) with zero architectural documentation:
- Built in Sprint 7 (S7-INT-02, S7-INT-03)
- Closes WARNING S2-W12 (LLM Usage Dashboard)
- RBAC, data aggregation, alert model all undocumented

**Decision**: Add §15 to ADD covering admin API architecture, store pattern, RBAC enforcement.

### 6. Phase 1.5 As-Built Delta Needed

**Codex insight** (confirmed by Claude): The ADD currently shows pre-wiring state for several subsystems:
- §5 MCP: No mention of `sanitizeEnvForMcp()` enforcement or `envAllowlist` propagation
- §6 Notifications: Still describes stub pattern, not real Novu SDK wiring
- §7 LLM Gateway: Doesn't reflect real BudgetService + UsageLogger with Drizzle stores

**Decision**: Small (S effort) explicit update pass across affected ADD sections.

---

## Debated Items

### D1: OpenAPI as Planning Blocker

| Model | Position | Effort |
|-------|----------|--------|
| **Gemini** | MUST pre-planning — "defines integration contracts for deferred P2 features like Multi-approver HITL" | L |
| **Codex** | Reconcile but NOT blocking — "add missing admin routes and mark Phase 2/deferred endpoints explicitly" | M |
| **Claude** | NOT blocking — TSDs already define contracts textually; OpenAPI formalizes what exists | M |

**Verdict**: OpenAPI moves to **Batch 3 (during P2)**. Reasoning:
1. TSDs already specify request/response shapes, status codes, and validation rules
2. No Phase 2 epic requires machine-readable API specs as input to planning
3. OpenAPI generation can happen incrementally as Phase 2 endpoints are built
4. The effort (L) would delay planning for marginal benefit

### D2: Domain ADD Depth Pre-Planning

| Model | Position |
|-------|----------|
| **Gemini** | Full architecture docs pre-planning (L each) |
| **Codex** | After ADD alignment work, before sprint 1 |
| **Claude** | Lightweight pre-sprint-1, deep additions during P2 per epic |

**Verdict**: Domain ADDs in **Batch 2 (pre-sprint-1)**. Document what was *built* (workflows, tables, stores, RBAC, decision rationale). Phase 2 design additions (new workflows, schema extensions) happen during P2 sprint planning for each epic. This keeps the docs as "as-built + Phase 2 pointers" rather than speculative design.

### D3: Security Middleware Consolidation Scope

| Model | Position |
|-------|----------|
| **Gemini** | Consolidate in ADD §14 (S) |
| **Codex** | Create "Security Middleware Architecture (Unified)" section covering request flow (M) |
| **Claude** | Add subsection to §14 documenting implemented middleware stack (S) |

**Verdict**: **S effort, subsection in §14**. The threat modeling in §14 is excellent — it just needs a "§14.10: Implemented Security Middleware" subsection documenting the actual runtime enforcement stack (RBAC → SSRF → body limits → logging sanitization). No need for a separate section.

---

## Actionable Recommendations

### Batch 1: Pre-Planning Blockers (6 tasks, ~5 working days)

| Task | Type | Effort | Deliverable |
|------|------|--------|-------------|
| DOC-01 | Create | S | `docs/06-sprints/phase-2-roadmap.md` |
| DOC-02 | Modify | S | ADD §5, §6, §7, §14.9 — Phase 1.5 as-built delta |
| DOC-03 | Modify | M | ADD §15 — Admin Dashboard Architecture |
| DOC-04 | Modify | M | ADD §16 — Unified Observability & SLO |
| DOC-05 | Modify | S | ADD §14.10 — Security Middleware |
| DOC-06 | Create | M | `docs/04-specs/platform-core/audit.md` |

### Batch 2: Pre-Sprint-1 (5 tasks, ~5-7 working days)

| Task | Type | Effort | Deliverable |
|------|------|--------|-------------|
| DOC-07 | Create | L | `docs/03-architecture/crypto-domain-add.md` |
| DOC-08 | Create | L | `docs/03-architecture/hr-domain-add.md` |
| DOC-09 | Modify | S | `docs/04-specs/platform-core/llm-gateway.md` v1.2.0 |
| DOC-10 | Create | M | `docs/04-specs/platform-core/admin-ops-api.md` |
| DOC-11 | Modify | S | Workflow state transition tables in domain TSDs |

### Batch 3: During Phase 2 Sprints (3 tasks, ~3 working days)

| Task | Type | Effort | Deliverable |
|------|------|--------|-------------|
| DOC-12 | Modify | S | `docs/04-specs/api-spec-readiness.md` refresh |
| DOC-13 | Create | M | `docs/04-specs/openapi/aptivo-core-v1.yaml` |
| DOC-14 | Modify | S | `docs/04-specs/index.md` v5.0.0 |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Doc scope creep delays planning | HIGH | Strict Batch 1/2 prioritization; Batch 3 is optional pre-planning |
| Domain ADDs become speculative (designing P2 before planning) | MEDIUM | Document as-built only; P2 design additions during sprint planning |
| ADD grows further past 192KB | LOW | New sections are architectural summaries (~2-5KB each); domain content in separate docs |
| Engineers plan P2 against outdated LLM TSD | MEDIUM | DOC-09 in Batch 2 ensures current-state accuracy before sprint 1 |
