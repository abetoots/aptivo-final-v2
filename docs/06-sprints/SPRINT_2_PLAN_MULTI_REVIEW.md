# Sprint 2 Plan Multi-Model Review

**Date**: 2026-03-06
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash (via PAL clink), Codex (OpenAI)
**Task**: Sprint 2 planning for HITL Gateway implementation

---

## Executive Summary

All three models produced Sprint 2 implementation plans independently. Strong consensus on structure, critical path, and risk areas. Key debates resolved around CF-03 backward compatibility strategy and token TTL vs approval window mismatch. Final plan synthesized from best elements of all three analyses.

---

## Consensus Findings

All three models agreed on:

1. **3-phase execution structure**: Foundation (schemas + tokens + CF-03) → APIs + notifications → Integration + UI
2. **Critical path**: HITL-01/02 → HITL-03/04 → CF-03 → HITL-05/06 → HITL-07 → HITL-10
3. **CF-03 must be front-loaded** in week 1 to unblock API development
4. **ReplayStore adapter interface** with `claimOnce(key, ttlSeconds)` method
5. **Database design**: `hitl_requests` with status lifecycle + `hitl_decisions` with `unique(request_id)` for first-writer-wins
6. **High spike code reuse** (~85-90%) for tokens/events, less for APIs and UI
7. **36 SP is achievable but tight** — requires aggressive parallelization and minimal UI

---

## Debated Items

### 1. CF-03 Backward Compatibility Strategy

**Gemini**: Full rewrite — inject `ReplayStore` via constructor/factory pattern, breaking existing API
**Codex**: Optional trailing parameter — `verifyHitlToken(token, secrets, options, replayStore?)` — all existing callers work unchanged
**Claude (Lead)**: Agreed with Codex

**Resolution**: Optional trailing parameter approach adopted. Rationale:
- 39 existing SP-11/SP-14 tests pass without modification
- No breaking changes to the public API surface
- Default to `InMemoryReplayStore` when parameter omitted
- Production code passes `RedisReplayStore` explicitly

### 2. Token TTL vs Approval Window

**Gemini**: Did not identify this risk
**Codex**: Flagged as significant — JWT hard cap is 1 hour but `waitForEvent` uses 24h timeout
**Claude (Lead)**: Agreed with Codex, proposed solution

**Resolution**: Decouple approval link from JWT. The URL contains the request ID (not the JWT token). For email links, the 1-hour JWT is the effective auth window. For web UI, the user authenticates via Supabase session and can act within the 24h workflow timeout. The JWT is an authorization token for the specific action, not a session token.

### 3. HITL-11 Dependencies

**Gemini**: Listed HITL-03 as dependency
**Codex**: Noted dependency is "weak and can be decoupled"
**Claude (Lead)**: Agreed with Codex — HITL-11 is about Supabase auth sessions, not HITL JWT tokens

**Resolution**: HITL-11 has no HITL-task dependencies. It's independent and can start on day 1 — assigned to Web Dev 2.

### 4. Story Point Accuracy for HITL-03/04

**Gemini**: Grouped as 5 SP combined
**Codex**: Kept original 3 + 2 = 5 SP
**Claude (Lead)**: Noted that spike code is ~90% production-ready; real work is CF-03 adapter injection

**Resolution**: Kept original estimates (3 + 2 = 5 SP) despite high reuse, because the adapter injection and test restructuring for CF-03 compatibility is genuine work.

### 5. HITL-08/09 Task Ordering

**Gemini**: HITL-08 in Phase 2, HITL-09 in Phase 3
**Codex**: Same ordering
**Claude (Lead)**: Agreed — notifications before UI makes sense (email links are the primary approval channel)

**Resolution**: Unanimous agreement. HITL-08 (Novu) first, HITL-09 (UI) second.

---

## Unique Insights by Model

### Gemini
- Identified Novu latency as a risk area
- Suggested file paths in `apps/web/src/modules/` directory structure (noted but not adopted — Aptivo uses App Router conventions)

### Codex
- Detailed database schema with audit metadata (ipAddress, userAgent) in decisions table — adopted
- TTL policy for replay stores: JTI key TTL = remaining token lifetime, nonce key TTL = remaining freshness window — adopted
- Idempotent re-submit handling (same approver + same decision = 200, not 409) — adopted
- 410 Gone for expired requests — adopted
- Confidence assessment: 65-75% — adopted as sprint risk communication

### Claude (Lead)
- Event naming standardization: migrate from `spike/sp02.*` to `hitl/decision.*` production namespace
- HITL-11 full decoupling from HITL token system
- Token TTL / approval window solution architecture
- Sprint sequencing table with developer assignments

---

## Actionable Recommendations

1. **Start CF-03 and HITL-11 on day 1** — both are independent of the main critical path and can run in parallel
2. **Complete CF-03 by end of day 4** — it blocks HITL-06 which blocks HITL-07
3. **Keep HITL-09 (UI) minimal** — Server Components + Server Actions, no complex client-side state
4. **Configure Novu templates before HITL-08 starts** — runtime dependency, not code dependency
5. **Daily integration branch merges** — high cross-package coupling means drift risk
6. **Freeze scope** — no multi-approver, quorum, or request-changes behavior in Phase 1

---

## Signatories

- **Claude Opus 4.6** (Lead Expert): Plan approved with synthesis
- **Gemini 3 Flash**: Foundation and phasing analysis
- **Codex**: Detailed task breakdown, schema design, and risk identification
