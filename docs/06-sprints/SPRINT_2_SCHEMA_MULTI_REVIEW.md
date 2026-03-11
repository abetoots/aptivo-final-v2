# Sprint 2 Schema Foundation — Multi-Model Review

**Date**: 2026-03-09
**Models**: Claude Opus 4.6 (lead), Gemini 3 Flash (via PAL clink), Codex (via Codex MCP)
**Scope**: HITL-01, HITL-02, ID-01 schema implementations + exports wiring

---

## Executive Summary

The Sprint 2 foundation schemas were reviewed by three independent models. Two correctness issues were found by consensus (both Gemini and Codex), one design gap was uniquely identified by Codex, and one spec drift issue was flagged by Gemini. All actionable findings have been fixed and verified (9/9 typechecks, 584/584 tests passing).

---

## Consensus Findings (All Three Models)

### 1. `hitl_requests.workflowId` type mismatch — FIXED

- **Issue**: `varchar(255)` instead of `uuid`
- **Evidence**: `database.md §4.3` specifies `uuid('workflow_id')`, `llm_usage_logs` uses `uuid` for the same field
- **Risk**: Type mismatch in HITL-07 Inngest integration joins; inconsistency across DB schema
- **Fix**: Changed to `uuid('workflow_id').notNull()`

### 2. `hitl_requests.approverId` missing FK — FIXED

- **Issue**: No foreign key constraint to `users.id`
- **Evidence**: `hitl_decisions.approverId` correctly references `users.id`, but `hitl_requests.approverId` was bare
- **Risk**: Orphaned approver IDs; downstream HITL-05/06 could store invalid assignees
- **Fix**: Added `.references(() => users.id)`

---

## Debated Items

### 3. Active role uniqueness constraint (Codex unique insight) — FIXED

- **Codex**: Flagged risk of duplicate `(userId, role, domain)` rows when `revokedAt IS NULL`
- **Gemini**: Did not flag
- **Claude verdict**: Valid concern. Added partial unique index: `UNIQUE (userId, role, domain) WHERE revokedAt IS NULL`. PostgreSQL treats NULL domain values as distinct in unique constraints — documented as app-layer guard for platform-wide roles.

### 4. `role_permissions` domain field (Codex)

- **Codex**: Suggested `role_permissions` needs a `domain` column for domain-specific permissions
- **Claude verdict**: **Disagree** — intentional design. Domain scoping is at the `user_roles` level (user has role X in domain Y). Permissions are global per role (a `trader` has the same permissions regardless of domain). If domain-specific permission overrides are needed, that's a Phase 2 extension. No change.

### 5. RBAC seed data (Codex)

- **Codex**: Flagged missing seed data for core roles (`admin`, `user`, `viewer`)
- **Claude verdict**: Valid observation but **not a schema concern**. Seed data belongs in a migration script, not the schema definition file. Documented as a follow-up within ID-01 TDD micro-task 5-6.

### 6. PII in audit columns (Codex)

- **Codex**: Flagged `ipAddress`/`userAgent` as raw PII storage
- **Claude verdict**: **Accepted risk for Phase 1**. These columns are explicitly required by the sprint plan as audit metadata. PII handling is addressed in Sprint 5 (S2-W2, S2-W3 WARNING closures). No change now.

---

## Spec Drift (Gemini unique insight) — FIXED

- **Issue**: `database.md §4.3` listed `token: varchar(2048)` (raw token storage), contradicting SP-11 security findings
- **Fix**: Updated `database.md` to reflect:
  - `tokenHash: char(64)` instead of raw `token` column
  - Added `workflowStepId`, `approverId` columns
  - Updated indexes (composite `approverStatus`, `statusExpires` replacing single-column)
  - `hitl_decisions`: added `uniqueIndex` on `requestId`, `ipAddress`/`userAgent` columns, `approverIdx`
  - Decision enum updated: removed `request_changes` (Phase 1 scope-limited per FRD HITL-003)

---

## Actionable Recommendations

| # | Action | Status | Owner |
|---|--------|--------|-------|
| 1 | `workflowId` → `uuid` | Done | Claude |
| 2 | `approverId` FK to `users.id` | Done | Claude |
| 3 | Partial unique index on active roles | Done | Claude |
| 4 | `database.md` spec sync | Done | Claude |
| 5 | RBAC seed data in migration | Follow-up | ID-01 TDD micro-task 5-6 |
| 6 | PII handling for audit columns | Sprint 5 | S2-W2, S2-W3 |

---

## Verification

- Typecheck: 9/9 packages clean
- Tests: 584/584 passing (93 types + 83 mcp-layer + 254 spike-runner + 39 hitl-gateway + 115 llm-gateway)
- Zero regressions from schema changes
