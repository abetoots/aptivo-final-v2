# Sprint 13 Batch 1 — Multi-Model Review

**Date**: 2026-03-17
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: NOTIF2-01 (SMTP Fallback), NOTIF2-03 (Priority Routing), FEAT-01 (Workflow CRUD)
**Verdict**: 0 P1 fixes, 2 P2 fixes, 5 accepted items

---

## Findings

### F-1: Workflow Update No Version Bump [P2]

**Codex**: Update doesn't increment version; client can overwrite it.
**Claude**: Valid. Update should auto-increment `version` server-side.

**Verdict — P2 FIX**: Add `version: existing.version + 1` in update method.

### F-2: Update Accepts Unvalidated Input [P2]

**Codex**: `update()` casts raw input without Zod validation.
**Claude**: Valid. Create validates but update doesn't.

**Verdict — P2 FIX**: Add `UpdateWorkflowInput` Zod schema (partial of `CreateWorkflowInput`) and validate in update.

### F-3: SMTP Secure Default Bypassed [ACCEPTED]

**Codex**: Composition root passes `secure: false` explicitly, preventing port-based default.
**Claude**: Minor env config issue. Document that `SMTP_SECURE=true` is required for port 465.

### F-4: Failover Subscriber Under smtp_primary [ACCEPTED]

**Codex**: Novu subscriber sync skipped when SMTP is primary.
**Claude**: `smtp_primary` is a rare fallback config. Document the limitation.

### F-5: SMTP Assumes Email Recipient [ACCEPTED]

**Codex**: SMTP adapter treats recipientId as email address.
**Claude**: Correct for HITL email notifications (the only current use case). SMTP is inherently email-only.

### F-6: Timezone Ignored in Quiet Hours [ACCEPTED]

**Codex**: `getUTCHours()` used despite `timezone` config field.
**Claude**: Acknowledged in code comments. Full timezone support (`Intl.DateTimeFormat`) is Sprint 14 scope.

### F-7: Auth Inconsistency Across Workflow Routes [ACCEPTED]

**Codex**: POST extracts user, GET/PUT/DELETE don't.
**Claude**: By design. POST needs `createdBy` for audit. Other methods only need RBAC auth. Different data requirements, not an auth gap.

---

## Actionable

| # | Finding | Action |
|---|---------|--------|
| 1 | F-1 | Auto-increment version on workflow update |
| 2 | F-2 | Add UpdateWorkflowInput Zod schema + validate in update |
