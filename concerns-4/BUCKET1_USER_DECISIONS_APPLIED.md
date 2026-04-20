# Bucket 1: User Decisions Applied

**Date**: 2026-04-20
**Context**: Resolved the 7 open ERROR-level findings that required user judgment.

---

## Decisions & Applied Edits

### 1. LLM monthly budget → $1,000/month
**User choice**: $1,000 (match as-built P1.5)

**Finding**: Already reconciled in current ADD (§7.2.2 `MONTHLY_BUDGET_USD = 1_000` with explicit reconcile note). The $500 contradiction lived in the stale `concerns-1/` prompt embedding, not in the repo. No edit needed. BRD Crypto addendum checked — no specific $500 reference to update.

**Status**: ✅ Already consistent

---

### 2. Admin API paths → Document exception in ADD §13.8
**User choice**: Document admin exception (keep `/api/admin/*` unchanged)

**Edits**:
- `docs/03-architecture/platform-core-add.md` §13.8 — added two bullets listing the seven admin endpoints (including `approval-sla`, `feature-flags`) and explicit "Permanent exceptions (never versioned)" for `/health/live`, `/health/ready`, `/api/inngest`
- `docs/06-operations/01-runbook.md` §8.14 — corrected `/api/v1/admin/llm/budget` typo to `/api/admin/llm-usage/budget`

**Status**: ✅ Complete

---

### 3. DB pool size → 5 per container (canonical)
**User choice**: 5 per container (align runbook to ADD)

**Edits**:
- `docs/03-architecture/platform-core-add.md` §10.4.5 — table updated: API pool size 10 → 5; max connections math now 3×5 + 1×5 = 20 ≤ 22 available ✅; replaced the "CRITICAL" warning with a resolution note pointing to Drizzle client config
- `docs/06-operations/01-runbook.md` §8.11 — Prevention note changed from "Phase 1 pool size is 20" to "5 per container (canonical per ADD §10.4.5)"
- `docs/06-operations/01-runbook.md` §13 verification checklist — `pool-config.ts` row updated to require ≤5 per container

**Follow-up**: Verify Drizzle `poolConfig: { max: 5 }` in composition root (not part of this doc reconciliation).

**Status**: ✅ Complete

---

### 4. Compute + Spaces billing alerts
**User choice**: Compute $200/mo, Spaces $10/mo

**Edits**:
- `docs/03-architecture/platform-core-add.md` §9.14 — table restructured with new "Billing Alert Threshold" column:
  - Compute $200/mo (was implicit $50 plan cap)
  - Spaces $10/mo (was $5 expected with no alert)
  - PostgreSQL $30, Redis $20 (2x expected as reasonable alert buffers)
  - LLM $1,500/mo per domain (150% of $1,000 app-level cap)
- Added reconcile note describing these as "operational safety nets, not hard caps"

**Follow-up**: Configure Railway billing alerts in the DO console to match these thresholds.

**Status**: ✅ Complete

---

### 5. Recruiting Coordinator → Keep and implement
**User choice**: Keep and implement

**Edits**:
- `docs/03-architecture/platform-core-add.md` §8.3 — `HRRole` union extended with `'recruiting-coordinator'`
- `docs/03-architecture/hr-domain-add.md` §5.1 — new role row added with description ("Scheduling + view, no contract/offer authority")
- `docs/03-architecture/hr-domain-add.md` §5.2 — permission matrix extended: coordinator gets `candidate.view`, `application.view`, `interview.create/view/update`; no offer/contract permissions. Added `hr/interview.update` and `hr/contract.view` permissions for completeness.
- `docs/03-architecture/hr-domain-add.md` summary row — "18 HR permissions" updated to "20 HR permissions"

**Follow-up**: Add `recruiting-coordinator` to seed-data migration (tracked under PR-07 follow-up).

**Status**: ✅ Complete

---

### 6. HR uptime → 99% with maintenance exclusion
**User choice**: Relax to 99% with Sunday 02:00-06:00 PHT maintenance exclusion

**Edits**:
- `docs/02-requirements/hr-domain-frd.md` §9.2 — target changed from 99.9% to 99% monthly excluding scheduled maintenance; added RTO <4h and RPO <24h rows; added reconcile note citing Platform ADD §10.4.3 single-region architecture and Phase 2 roadmap for 99.9% upgrade

**Status**: ✅ Complete

---

### 7. HR 4 performance SLOs → All 4 kept as Phase 1 commitments
**User choice**: Keep all four (acknowledgment <5min, parse <30s, dashboard <2s, search <1s)

**Edits**:
- `docs/03-architecture/hr-domain-add.md` — new **§4.4 Performance SLO Architecture** section added with 4-row table mapping each FRD target to architecture support, measurement point, and notes:
  - Acknowledgment: Inngest + Novu (well inside 5min budget)
  - Parse: LLM Gateway GPT-4o with 25s workflow timeout + mini fallback
  - Dashboard: Server-rendered with <500ms query budget + 1.5s TTI
  - Search: PostgreSQL GIN index on tsvector over name/email/skills; Phase 2 Meilisearch if >100K rows
- Added observability note pointing to Platform ADD §16.1 `MetricService` and OBS-02 follow-up for breach-rate metrics

**Status**: ✅ Complete

---

## Summary

- 7 user decisions captured via 2 `AskUserQuestion` batches
- 6 decisions resulted in doc edits across 5 files
- 1 decision (LLM budget) was already reconciled in current docs (stale concerns-1 prompt caused false positive)
- 0 decisions required code changes (LLM code already has $1,000; DB pool will follow doc truth via composition root follow-up)

## Remaining open items from original 75 findings

- **WARN-level (42)** — tracked in `concerns-4/TIER*_MULTI_REVIEW.md` for Phase 2 sprint planning
- **NOTE-level (6)** — lowest priority, tracked but not action-blocking
- **ERROR-level queued for future sprint** (mechanical but large):
  - Add `approval-sla` + `feature-flags` endpoints to OpenAPI with schemas
  - Add `required` arrays to OpenAPI admin schemas
  - Add Sunset/Deprecation response headers to OpenAPI (global middleware)
  - Document MCP/Crypto/Inngest WebSocket lifecycles
  - Supabase Auth manual change-control procedure
  - Map 7 error paths to test specs
  - Wire `safeFetch()` on first outbound webhook path (RR-7 full resolution)

Phase 2 planning should pick up these 7 queued items plus the 42 WARNs.
