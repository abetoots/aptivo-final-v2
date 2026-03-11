# Sprint 4 Plan — Multi-Model Review

**Date**: 2026-03-10
**Models**: Claude Opus 4.6 (Lead) + Gemini 3 Flash Preview (via Pal) + Codex/GPT (via Codex MCP)
**Scope**: Sprint 4 planning — "Audit Service + Notification Bus" (Weeks 9–10, 19 SP)

---

## Executive Summary

All three models independently analyzed the Sprint 4 requirements (FR-CORE-AUD-001, FR-CORE-NOTIF-001, FR-CORE-HITL-006), existing codebase patterns, and Sprint 3 carry-forward items. After one round of debate on carry-forward scope, full consensus was reached on all six architectural questions and the task breakdown.

**Verdict**: PLAN APPROVED — ready for implementation.

---

## Consensus Findings

All three models agree on:

### Architecture
1. **Hash chaining**: `audit_chain_heads` table with `SELECT ... FOR UPDATE` row-level locking per `chain_scope`. Start with `chain_scope = 'global'` for Sprint 4; domain-scoped chains deferred until contention observed.
2. **Async writes**: Inngest durable functions (not BullMQ, not fire-and-forget). Consistent with platform's async execution pattern.
3. **DLQ**: Postgres-backed `audit_write_dlq` table. Failed writes persisted with error metadata + retry count. Inngest reprocessor function with bounded retries.
4. **PII masking**: Config-driven field-level masking in `AuditService.emit()`. Mask-before-write policy. `masking_version` tracking deferred to Sprint 5 (YAGNI for Sprint 4).
5. **Template substitution**: Safe `{{var}}` placeholder engine with strict variable whitelist + per-template Zod schema validation. No eval/expression support. Channel-aware escaping.

### Patterns
6. **Factory pattern**: `createAuditService(deps)` and `createNotificationService(deps)` — consistent with `createLlmGateway()` and `createMcpWrapper()`.
7. **Package naming**: `@aptivo/audit` and `@aptivo/notifications` — per phase-1-sprint-plan.md (not `audit-service`/`notification-bus`).
8. **No AuditService.query()**: FR-CORE-AUD-002 (Query & Export) is explicitly deferred to Phase 2+.
9. **Notification schemas**: `notification_preferences` (opt-out) and `notification_deliveries` (retry logging) tables are essential for FRD compliance.

### Task Structure
10. **3-phase execution**: Foundation (AUD-01/02) → Services (NOTIF-01/02, AUD-03) → Reliability (AUD-04/05, NOTIF-03)
11. **Dependency ordering**: AUD-01→AUD-02→AUD-03/04, NOTIF-01→NOTIF-02→NOTIF-03
12. **HITL migration**: Compatibility shim approach — keep HITL-08 public API stable, route internally to NotificationService.

---

## Debated Items

### D1: Carry-Forward Scope (RESOLVED — Gemini revised)

| Model | Initial Position | Final Position |
|-------|-----------------|----------------|
| Gemini | Absorb ALL 4 items (11 SP) → 30 SP total | Revised to absorb 3 small items (~2.5 SP) → 21.5 SP |
| Codex | Absorb 3 small items only (~2.5 SP) | Unchanged |
| Claude | Absorb 3 small items only (~2.5 SP) | Unchanged |

**Resolution**: Absorb only logic-wrapping carry-forward items:
- Data deletion Inngest wrapper (~1 SP) — directly closes S4-W9
- Scanner circuit breaker wiring (~1 SP)
- `classifyMcpError` wiring (~0.5 SP)

Defer to Sprint 5 (Integration & Hardening):
- `AgentKitTransportAdapter` — external SDK dependency + integration scope
- `S3StorageAdapter` — external SDK dependency + infrastructure connectivity

**Rationale**: Sprint 4 is deliberately 19 SP to absorb overruns and allow stabilization (per phase-1-sprint-plan.md). 30 SP = 100% capacity with zero buffer. The deferred items naturally belong in Sprint 5's integration scope.

### D2: Chain Scope — Global vs Per-Domain (RESOLVED)

| Model | Position |
|-------|----------|
| Gemini | Per-domain chains from the start |
| Codex | Global chain, extensible to domain-scoped later |
| Claude | Global chain for Sprint 4 (casting vote) |

**Resolution**: Start with `chain_scope = 'global'`. Schema includes `chain_scope` column for future partitioning. Per-domain chains add concurrency and correctness complexity without proven need.

### D3: notification_deliveries/preferences Tables (RESOLVED)

| Model | Position |
|-------|----------|
| Gemini | Not explicitly proposed |
| Codex | Essential for FRD compliance (opt-out + retry logging) |
| Claude | Agrees with Codex |

**Resolution**: Include both tables in lean form. FRD explicitly requires "users can opt out by channel" and "delivery failures retried and logged." No analytics features — those are Sprint 5.

### D4: masking_version Tracking (RESOLVED)

| Model | Position |
|-------|----------|
| Codex | Initially proposed, then revised: optional for Sprint 4 |
| Claude | Agrees — YAGNI |
| Gemini | Not explicitly addressed |

**Resolution**: Sprint 4 implements config-driven masking only. `masking_version` and `masked_fields` metadata deferred. The phase-1-sprint-plan acceptance criteria says "PII auto-masking configuration" — config-driven masking satisfies this.

---

## Actionable Recommendations

1. **Write sprint-4-plan.md** with the consensus task breakdown, TDD micro-tasks, and interface designs
2. **Implement in 3 phases**: Foundation → Services → Reliability
3. **Senior Dev**: AUD-01 (2), AUD-02 (3), AUD-04 (2), MCP-10 Inngest wrapper (1) = 8 SP
4. **Web Dev 1**: AUD-03 (3), AUD-05 (2), FS-03 CB wiring (1), MCP-06 error wiring (0.5) = 6.5 SP
5. **Web Dev 2**: NOTIF-01 (3), NOTIF-02 (2), NOTIF-03 (2) = 7 SP
6. **Total**: 21.5 SP (71.6% of 30 dev-day capacity) — healthy buffer preserved
7. **Risk mitigation**: Senior Dev conducts brief API review of `@inngest/agent-kit` and `@aws-sdk/client-s3` during Sprint 4 buffer time to de-risk Sprint 5

---

## Model Attribution

| Question | Gemini | Codex | Claude (Lead) | Resolution |
|----------|--------|-------|---------------|------------|
| Q1: Hash chaining | FOR UPDATE + per-domain | FOR UPDATE + global | FOR UPDATE + global | Global + extensible |
| Q2: Async writes | Inngest | Inngest | Inngest | Unanimous |
| Q3: DLQ | audit_failures table | audit_write_dlq table | audit_write_dlq table | DB-backed DLQ |
| Q4: Novu migration | Move code to new pkg | Compatibility shim | Compatibility shim | Shim + migrate |
| Q5: Templates | Handlebars via Novu | Safe {{var}} + Zod | Safe {{var}} + Zod | Zod-validated vars |
| Q6: PII masking | Field-level registry | Config-driven JSON-path | Config-driven fields | Config-driven |
| Carry-forward | All 4 → revised to 3 small | 3 small only | 3 small only | 3 small (~2.5 SP) |
