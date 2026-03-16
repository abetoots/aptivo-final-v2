# Sprint 9 Batch 2 — Multi-Model Review

**Date**: 2026-03-15
**Reviewers**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), Codex/GPT (via Codex MCP)
**Scope**: ID2-03 (MFA Enforcement), ID2-05 (Session Limits), ID2-08 (Async Auth Doc)
**Verdict**: 2 P1 fixes, 4 P2 improvements, 2 accepted risks

---

## Executive Summary

Both external models independently flagged the same primary concerns: MFA enforcement middleware exists but is not composed into the RBAC pipeline, MFA API routes lack authentication checks, and the session `checkAndEvict` operation is non-atomic. Claude (lead) agrees with the first two as P1 fixes and classifies the race condition as an accepted risk already documented in the sprint plan risk register. The Async Auth Propagation doc (§8.10) was praised by both models as excellent.

---

## Consensus Findings (All 3 Models Agree)

### C-1: MFA Enforcement Not Integrated into Auth Pipeline [P1]

**Files**: `mfa-enforcement.ts:42`, `rbac-middleware.ts`
**Finding**: `createMfaEnforcement()` exists with `requireMfa(permission, aal)` but no route or middleware calls it. Batch 1 added `checkPermissionWithBlacklist` for blacklist composition — there is no equivalent MFA composition point. Admin routes can be accessed with `aal1` despite MFA enforcement logic being defined.

**All models agree**: MFA check must be composable in the middleware pipeline.

**Verdict — FIX REQUIRED**: Add MFA check to `checkPermissionWithBlacklist` after blacklist check and before permission resolution, using the `aal` field from `ExtractedUser`. This avoids adding yet another middleware variant — compose blacklist + MFA into one function.

### C-2: MFA Routes Lack Authentication [P1]

**Files**: `api/auth/mfa/enroll/route.ts`, `verify/route.ts`, `challenge/route.ts`
**Finding**: MFA enroll/verify/challenge endpoints have no `extractUser()` or `checkPermission()` call. An unauthenticated request can reach the MFA stub client. In production, these would need Supabase session validation.

**All models agree**: Auth-bootstrapping routes still need to verify the user is logged in.

**Verdict — FIX REQUIRED**: Add `extractUser()` check to all three MFA routes. Return 401 if no user. The MFA routes are "authenticated but not MFA-gated" — you must be logged in to enroll/verify MFA, but you don't need MFA to access MFA enrollment.

---

## Debated Items

### D-1: Session checkAndEvict Race Condition

| Model | Position |
|-------|----------|
| **Gemini** | Critical — needs Redis Lua script for atomicity |
| **Codex** | High — non-atomic read-modify-write can corrupt index |
| **Claude** | Accepted Risk — documented in sprint plan risk register |

**Context**: The sprint plan §6 Risk Assessment explicitly lists: "Session eviction race condition (concurrent logins) — Medium/Medium — Redis WATCH/MULTI for atomic check-and-evict." The `RedisClient` interface (shared with token blacklist) deliberately uses minimal ops (set/get/exists/del) and doesn't support WATCH/MULTI or Lua scripts. Sprint 10 (Infrastructure Hardening) is designed to address Redis primitives.

**Verdict — ACCEPTED RISK**: The race window is narrow (concurrent logins for the same user within milliseconds). Session limits are a soft constraint — briefly exceeding the limit is acceptable as a degraded mode. Atomic operations will be added in Sprint 10 when the Redis interface is extended.

### D-2: Session/MFA Routes Are Stubs

| Model | Position |
|-------|----------|
| **Gemini** | High — routes don't interact with real services |
| **Codex** | High — creates UX that appears functional but isn't |
| **Claude** | P2 — follows project pattern of progressive wiring |

**Context**: This follows the established Aptivo pattern. Phase 1 shipped stub Novu client, in-memory S3, stub MCP transport — all wired to real implementations via env-gating in the composition root. The MFA stub client and session route shells follow the same approach.

**Verdict — P2**: Wire MFA routes to a `getMfaClient()` composition root getter. Wire session routes to `getSessionLimitService()`. Both are composition root wiring tasks, not architectural gaps. Will be completed in ID2-11 (Integration Tests).

### D-3: MFA Stub Always Succeeds

| Model | Position |
|-------|----------|
| **Gemini** | High security hole if deployed |
| **Codex** | Critical — verify always returns aal2 |
| **Claude** | P2 — intentional for dev; same pattern as all other stubs |

**Verdict — P2**: Add `getMfaClient()` to composition root with env-gated Supabase MFA client (when `NEXT_PUBLIC_SUPABASE_URL` is set). Stub is the correct dev/test behavior. Production deployment requires Supabase configuration, which gates the real client.

### D-4: Duplicate Session ID in Index

| Model | Position |
|-------|----------|
| **Codex** | Medium — blindly appends, can inflate index |
| **Claude** | Valid — add dedup |
| **Gemini** | Not raised |

**Verdict — P2 FIX**: Add `Set`-based deduplication before appending to the session index in `checkAndEvict`.

---

## Documentation Findings

### D-5: ADD Session Limits Mismatch

**Codex only**: ADD §8.7 says "Max sessions per user: Unlimited" (Phase 1 value), but code now enforces limits.

**Verdict — P2 FIX**: Update ADD §8.7 to reflect Phase 2 session limits (admin: 1, user: 3). This is a doc-gate requirement from the sprint plan.

---

## Test Coverage Gaps

| Gap | Severity | Resolution |
|-----|----------|------------|
| No tests for MFA route authentication (anonymous access) | Medium | Fix in C-2 adds extractUser; test in ID2-07 |
| MFA route error branches unreachable (stub always succeeds) | Medium | Addressed when getMfaClient wired (D-3) |
| No tests for session API routes | Low | ID2-11 integration tests |
| No concurrent checkAndEvict tests | Low | Accepted risk (D-1), tested in Sprint 10 |
| No duplicate sessionId test | Low | Fix in D-4 adds test |

---

## Actionable Recommendations

### P1 — Fix Before Batch 3

| # | Finding | Action | Files |
|---|---------|--------|-------|
| 1 | C-1 | Compose MFA check into `checkPermissionWithBlacklist` using `user.aal` | `rbac-middleware.ts`, `mfa-enforcement.ts` |
| 2 | C-2 | Add `extractUser()` auth check to MFA enroll/verify/challenge routes | 3 MFA route files |

### P2 — Fix During Sprint 9

| # | Finding | Action | Files |
|---|---------|--------|-------|
| 3 | D-2/D-3 | Add `getMfaClient()` to composition root with env-gated Supabase client | `services.ts` |
| 4 | D-4 | Deduplicate session IDs before appending to index | `session-limit-service.ts` |
| 5 | D-5 | Update ADD §8.7 session limits to reflect Phase 2 values | `platform-core-add.md` |

### Accepted Risks

| # | Finding | Rationale |
|---|---------|-----------|
| 6 | D-1 (race condition) | Sprint plan risk register; atomic ops in Sprint 10 |
| 7 | D-2 (stub routes) | Project pattern — env-gated progressive wiring |

---

## Positive Practices Noted

- **Async Auth Doc (§8.10)** — Both models praised clear patterns, anti-patterns, and edge case documentation
- **MFA enforcement design** — Configurable sensitive operations list, clean `requireMfa` interface
- **Session limit defaults** — Sensible defaults (admin:1, user:3) with override capability
- **Fail-open consistency** — Session and blacklist services both fail-open on Redis errors
