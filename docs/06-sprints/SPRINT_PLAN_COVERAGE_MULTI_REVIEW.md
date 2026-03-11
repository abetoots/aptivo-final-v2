# Sprint Plan Coverage Analysis: FRD-Driven vs WARNING-Driven

**Date**: 2026-03-06
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash, Codex (OpenAI)
**Task**: Determine whether `phase-1-sprint-plan.md` is derived from canonical FRD requirements or only from WARNING closure findings

---

## Executive Summary

**The sprint plan is primarily WARNING-driven, not FRD-driven.** All three models independently reached this conclusion.

The FRD defines **30 functional requirements** across **8 subsystems**. The sprint plan directly covers only 3 of 8 subsystems (LLM, HITL, MCP) with dedicated sprint tasks. The remaining 5 subsystems rely on implicit "Buy" decisions (Inngest, Novu, Supabase) or are **entirely missing** from the plan.

Sprint 4 ("Integration & Polish") is almost exclusively WARNING-closure work — 24 of its DoD items reference specific WARNING IDs. No Sprint 4 task addresses a previously untracked FRD requirement.

### Coverage Summary

| Classification | Count | % |
|---------------|-------|---|
| Fully Implemented (sprint task) | 10 | 33% |
| Buy (vendor covers it) | 8 | 27% |
| Partial (sprint touches it, but AC gaps remain) | 6 | 20% |
| **MISSING** (no task, no buy) | **6** | **20%** |

---

## Consensus Findings (All 3 Models Agree)

### 1. File Storage is entirely missing

**FR-CORE-BLOB-001** (S3 interface) and **FR-CORE-BLOB-002** (access control + ClamAV) have **zero sprint tasks**. The ADD selects DO Spaces and defines a file storage architecture (ADD §9.6–§9.8), but no sprint builds it. `MCP-11` only adds a ClamAV health check — not the storage service itself.

### 2. RBAC is entirely missing

**FR-CORE-ID-002** (Role-Based Access Control) is defined in ADD §8.3 with role tables, middleware, and permission models. No sprint task implements the role-checking middleware, `user_roles` table, or domain-role enforcement.

### 3. Audit export and retention are missing

**FR-CORE-AUD-002** (query/export with checksums) has no sprint task. **FR-CORE-AUD-003** (retention policies with domain overrides) is partially touched by MCP-10 (data deletion workflow) but doesn't implement audit-specific retention enforcement. The ADD defines extensive audit architecture (§9.2–§9.5) but the sprint plan only addresses making audit writes async (T1-W21, a WARNING).

### 4. Sprint 4 is WARNING-closure, not feature work

Sprint 4's 18 DoD items all reference WARNING IDs: S5-W13–W16, S2-W12, T1-W21, S6-W17, S6-W18, T1-W27–W29, S2-W2, S2-W3, S1-W8, S1-W11, S1-W12, S7-W24–W30. The only non-WARNING items are INT-01 (demo workflow), INT-02 (admin dashboard), and INT-03 (LLM usage dashboard).

### 5. LLM and MCP are well covered

FR-CORE-LLM-001 through LLM-003 and FR-CORE-MCP-001 through MCP-003 have comprehensive sprint task coverage. These subsystems show the sprint plan working correctly when tasks ARE FRD-derived.

---

## Traceability Matrix

### Workflow Engine (7 requirements)

| Requirement | Title | Coverage | Sprint Task |
|-------------|-------|----------|-------------|
| FR-CORE-WFE-001 | Workflow States/Transitions | Partial: Buy Inngest | No task for definition CRUD/versioning |
| FR-CORE-WFE-002 | Durable State Persistence | Buy: Inngest | SP-02, SP-07 validated |
| FR-CORE-WFE-003 | Durable Timers | Buy: Inngest | SP-02 validated |
| FR-CORE-WFE-004 | Multiple Triggers | Buy: Inngest | No explicit multi-trigger validation |
| FR-CORE-WFE-005 | Retry & Compensation | Partial | CF-01 (saga docs only) |
| FR-CORE-WFE-006 | Parallel/Conditional | Buy: Inngest | No explicit test |
| FR-CORE-WFE-007 | Parent/Child | **MISSING** | Deferred — ADD §2.3.2 |

**Assessment**: Legitimately covered by "Buy: Inngest" for 5/7. WFE-001 needs clarification (is workflow definition management Phase 1?). WFE-007 is explicitly deferred.

### HITL Gateway (6 requirements)

| Requirement | Title | Coverage | Sprint Task |
|-------------|-------|----------|-------------|
| FR-CORE-HITL-001 | Create Requests | Implemented | HITL-05 |
| FR-CORE-HITL-002 | Suspension/Resumption | Implemented | HITL-07 |
| FR-CORE-HITL-003 | Approve/Reject/Changes | Partial | HITL-06 (no "request changes") |
| FR-CORE-HITL-004 | Approval Policies | **MISSING** | ADD §4.4 defines it, no task |
| FR-CORE-HITL-005 | Multi-Channel Endpoints | Implemented | HITL-08, HITL-09 |
| FR-CORE-HITL-006 | Audit HITL Actions | Partial | Decision logging implicit in HITL-06 |

**Assessment**: HITL-004 (approval policies — single/multi-approver, auto-reject on expiry) is defined in the TSD as "Phase 2+" but the FRD doesn't phase-gate it. HITL-003 "request changes" option is missing.

### MCP Layer (3 requirements)

| Requirement | Title | Coverage | Sprint Task |
|-------------|-------|----------|-------------|
| FR-CORE-MCP-001 | Register/Manage Tools | Implemented | MCP-01, MCP-06 |
| FR-CORE-MCP-002 | Execute with Error Handling | Implemented | MCP-06, MCP-08 |
| FR-CORE-MCP-003 | Rate Limits/Circuit Breaking | Implemented | MCP-03, MCP-04, MCP-05 |

**Assessment**: Well covered. ✅

### LLM Gateway (3 requirements)

| Requirement | Title | Coverage | Sprint Task |
|-------------|-------|----------|-------------|
| FR-CORE-LLM-001 | Route to Providers | Implemented | LLM-03, LLM-04, LLM-05, LLM-08 |
| FR-CORE-LLM-002 | Usage & Cost Tracking | Implemented | LLM-01, LLM-06, LLM-07 |
| FR-CORE-LLM-003 | Fallback on Failure | Implemented | LLM-08 (one-hop fallback) |

**Assessment**: Well covered. ✅

### Notification Bus (3 requirements)

| Requirement | Title | Coverage | Sprint Task |
|-------------|-------|----------|-------------|
| FR-CORE-NOTIF-001 | Multiple Channels | Partial: Buy Novu | HITL-08 (HITL-only, not generic) |
| FR-CORE-NOTIF-002 | Template-Based | Buy: Novu | Novu dashboard |
| FR-CORE-NOTIF-003 | Priority Routing | **MISSING** | No task for auditable priority overrides, quiet hours, or digest batching |

**Assessment**: "Buy: Novu" covers template rendering. But no sprint task creates a platform-level notification service adapter. HITL-08 is a consumer (sends one type of notification), not the notification bus itself. Priority routing and quiet hours need custom code.

### Audit Service (3 requirements)

| Requirement | Title | Coverage | Sprint Task |
|-------------|-------|----------|-------------|
| FR-CORE-AUD-001 | Immutable Logging | Partial | T1-W21 makes it async — doesn't build the service |
| FR-CORE-AUD-002 | Query & Export | **MISSING** | No task |
| FR-CORE-AUD-003 | Retention Policies | **MISSING** | MCP-10 is data deletion, not audit retention |

**Assessment**: The ADD defines extensive audit architecture (§9.2–§9.5: schemas, tamper-evidence, retention, export with integrity). None of this has a sprint task. The only audit work in the plan is T1-W21 (a WARNING about sync writes blocking critical paths).

### File Storage (2 requirements)

| Requirement | Title | Coverage | Sprint Task |
|-------------|-------|----------|-------------|
| FR-CORE-BLOB-001 | S3 Interface | **MISSING** | No task |
| FR-CORE-BLOB-002 | Access Control/Linking | **MISSING** | MCP-11 = ClamAV health only |

**Assessment**: Entirely missing. ADD §9.6–§9.8 defines the full architecture. Zero sprint tasks.

### Identity Service (3 requirements)

| Requirement | Title | Coverage | Sprint Task |
|-------------|-------|----------|-------------|
| FR-CORE-ID-001 | Passwordless Auth | Buy: Supabase | SP-03 validated |
| FR-CORE-ID-002 | RBAC | **MISSING** | ADD §8.3 defines model, no task |
| FR-CORE-ID-003 | Session Management | Partial | HITL-11 (revocation only) |

**Assessment**: Supabase provides auth. But RBAC — the role tables, middleware, domain-role enforcement — is entirely custom code that has no sprint task.

---

## Debated Items

### 1. Notification Bus: "Buy: Novu" vs Custom Integration

**Gemini**: "Buy: Novu" covers all 3 NOTIF requirements.
**Codex**: NOTIF-001 and NOTIF-003 are "Partial" — the sprint only covers HITL notifications, not a platform notification service.
**Claude (Lead)**: Agrees with Codex.

**Resolution**: A "Buy" decision for the runtime doesn't eliminate integration work. Novu handles delivery, but the platform needs: a `NotificationService` adapter (SDK-decoupled, like `LLMProvider`), subscriber management, domain-scoped templates, priority routing logic, quiet hours, and digest batching. HITL-08 sends one notification type — it's not a notification bus.

### 2. Audit Service: Covered by Sprint 4 or Not?

**Gemini**: AUD-001 covered by T1-W21 (Sprint 4).
**Codex**: AUD-001 is "Partial" — T1-W21 addresses write behavior, not the service itself.
**Claude (Lead)**: Agrees with Codex.

**Resolution**: T1-W21 makes audit writes async with a DLQ — it's an optimization of a service that doesn't exist yet. The audit service itself (schema, write path, tamper-evidence, query API, export with checksums, retention enforcement) has no sprint task. This is a fundamental gap.

### 3. Workflow Engine: How "Buy" is "Buy: Inngest"?

**Gemini**: 6/7 are "Buy: Inngest".
**Codex**: Several are "Partial" — FRD acceptance criteria need explicit validation even for buy decisions.
**Claude (Lead)**: Mostly agrees with Gemini, with one exception.

**Resolution**: Inngest legitimately handles WFE-002 through WFE-006 out of the box (validated by SP-01, SP-02, SP-07). WFE-001 is "Partial" because the FRD requires workflow definition CRUD and versioning — Inngest functions are code-defined, so "workflow management" in Phase 1 = deploying code, not a management API. This is acceptable if explicitly documented as a Phase 1 scope decision. WFE-007 is explicitly deferred.

---

## Root Cause Analysis

**How did this happen?**

The sprint plan was created AFTER the concern evaluations. The concern evaluations identified WARNINGs → WARNINGs were mapped to sprints → sprints were structured around WARNING closure. This is a bottom-up approach:

```
Concern schemas → Evaluate docs → WARNINGs → Map to sprints → Sprint plan
```

The correct approach is top-down with bottom-up integration:

```
FRD requirements → Sprint tasks (feature work)
  + WARNINGs → Mapped into sprints where they fit on the critical path
```

The 3 subsystems that ARE well-covered (LLM, HITL, MCP) happen to be the ones with WARNING-linked scope extensions, confirming the WARNING-driven bias. The 3 subsystems with ZERO coverage (Audit, File Storage, RBAC) had their issues resolved as documentation fixes during concern evaluation — they never generated implementation WARNINGs, so they never got sprint tasks.

---

## Actionable Recommendations

### Option A: Restructure Phase 1 sprints to be FRD-driven

Add missing subsystem work to sprints:

| New Work | Suggested Sprint | Story Points (est.) |
|----------|-----------------|---------------------|
| Audit Service (schema, write path, query API) | Sprint 3 or 4 | 8–13 |
| File Storage (S3 adapter, access control, ClamAV integration) | Sprint 3 or 4 | 8–10 |
| RBAC (role tables, middleware, domain roles) | Sprint 2 or 3 | 5–8 |
| Notification Service (adapter, subscriber management) | Sprint 2 or 3 | 5–8 |
| Audit export with checksums | Sprint 4 | 3–5 |
| HITL approval policies (Phase 1 single-approver) | Sprint 2 | 2–3 |

**Impact**: +31–47 SP across Phase 1. Would likely extend timeline or require scope reduction.

### Option B: Phase-gate the FRD and document what's Phase 1 vs Phase 2+

If some FRD requirements are intentionally deferred, document this explicitly:

1. Update the FRD to add Phase 1/Phase 2+ annotations to ALL 30 requirements
2. Update the sprint plan to reference FRD requirement IDs (not just WARNING IDs)
3. Create a formal "Phase 1 Scope Decision" document listing what's in/out and why
4. Move WARNING-only items from sprint DoD to a separate "hardening backlog"

### Option C: Hybrid — Add critical gaps, defer the rest

Minimum viable additions to prevent Phase 1 from being unshippable:

| Must Add | Rationale |
|----------|-----------|
| **RBAC** (ID-002) | Without role enforcement, any authenticated user can access any API |
| **Audit schema + write path** (AUD-001) | FRD says "all critical actions produce audit event" — compliance requirement |
| **File Storage adapter** (BLOB-001) | Both domains need file upload (HR: resumes; Crypto: charts) |

Defer to Phase 2+:
- Audit export with checksums (AUD-002)
- Audit retention policies (AUD-003)
- Notification priority routing (NOTIF-003)
- HITL approval policies (HITL-004)
- Parent/child workflows (WFE-007)

---

## Signatories

- **Claude Opus 4.6** (Lead): Sprint plan is WARNING-driven. Recommends Option C (hybrid).
- **Gemini 3 Flash**: Agrees on gap analysis. Notes "Buy" decisions legitimately reduce sprint scope for 2 of 8 subsystems.
- **Codex**: Strongest position — classifies more items as "Partial" than other models, emphasizing that even "Buy" decisions need integration tasks and AC validation.
