# Sprint 9 Batch 1 — Multi-Model Review

**Date**: 2026-03-15
**Reviewers**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), Codex/GPT (via Codex MCP)
**Scope**: ID2-06 (Token Blacklist), ID2-01 (OIDC Provider), ID2-02 (SAML Adapter Contract)
**Verdict**: 3 P1 fixes required, 3 P2 improvements, 2 accepted risks

---

## Executive Summary

All three models agree the implementation follows project patterns (Result types, factory functions, tagged union errors) and has strong test coverage (86 tests). However, three functional gaps were independently identified by all reviewers: (1) the JTI for blacklist checks comes from a client-controlled header rather than the verified JWT, (2) federated roles are defined but never wired into the middleware permission resolution, and (3) JIT provisioning's email-match path doesn't link the external identity or assign IdP-mapped roles. Two of these are design gaps that need fixes before Batch 2 proceeds; one is an accepted interim approach with a documented remediation path.

---

## Consensus Findings (All 3 Models Agree)

### C-1: JTI Derived from Client Header, Not Verified JWT [P1]

**Files**: `rbac-middleware.ts:156`, `token-blacklist.ts:91-93`
**Finding**: `checkPermissionWithBlacklist` reads `jti` from `x-token-jti` request header. An attacker could omit or spoof this header to bypass blacklist checks. The `checkBlacklist` function skips the check entirely when `jti` is `undefined`.

**All models agree**: JTI must be derived from the verified token, not a client-controlled header.

**Verdict — ACCEPTED RISK (interim)**:
- Supabase's `getUser()` validates the JWT server-side but does not expose individual claims like `jti` in its response
- No routes currently use `checkPermissionWithBlacklist` — it was added for future integration
- The original `checkPermission()` (used by all existing admin routes) is unchanged

**Remediation**: When ID2-05 (Session Limits) and ID2-11 (Integration) are implemented, `extractUser` will be updated to also extract `jti` from the raw JWT claims and include it in `ExtractedUser`. The middleware will then pass `user.jti` instead of the header value.

### C-2: Federated Roles Not Wired into Middleware [P1]

**Files**: `rbac-resolver.ts:112-128`, `rbac-middleware.ts:166`
**Finding**: `resolvePermissionsWithFederation()` exists but is never called. Both `checkPermission` and `checkPermissionWithBlacklist` use `resolvePermissions(user.userId, db)` which only resolves locally-assigned roles. `extractUser` doesn't populate `federatedRoles`. SSO users would only get permissions from DB-assigned roles, not IdP-mapped roles.

**All models agree**: Dead code path — `resolvePermissionsWithFederation` is unreachable in production.

**Verdict — FIX REQUIRED**:
1. Update `checkPermissionWithBlacklist` to use `resolvePermissionsWithFederation` when `user.federatedRoles` is present
2. Update `extractUser` to populate `federatedRoles` from Supabase user `app_metadata` (where IdP claims are stored)
3. Add test coverage for the federated resolution path

### C-3: JIT Email-Match Path Doesn't Link Identity [P1]

**Files**: `jit-provisioning.ts:50-53`
**Finding**: When `findByEmail` finds an existing user (e.g., previously logged in via magic link), the code returns the user without: (a) linking `externalId`/`providerId`, (b) assigning IdP-mapped roles. Subsequent logins will continue to miss the `findByExternalId` fast path, and the user won't have permissions from their IdP group memberships.

**All models agree**: Account linking is incomplete.

**Verdict — FIX REQUIRED**:
1. Add `linkExternalId(userId, externalId, providerId)` to `JitUserStore` interface
2. Call `linkExternalId` and `assignRoles` when matching by email
3. Add tests for the account-linking path

---

## Debated Items

### D-1: JIT Transactional Integrity

| Model | Position |
|-------|----------|
| **Gemini** | P2 — needs transactional wrapper for createUser + assignRoles |
| **Codex** | Noted as test gap but didn't raise as implementation concern |
| **Claude** | Accepted — JitUserStore interface is the right abstraction point for transactions |

**Verdict**: The `JitUserStore` interface decouples from the concrete adapter. The Drizzle implementation should use a transaction internally. This is a P2 concern — document as acceptance criteria for the Drizzle adapter, not a code fix now.

### D-2: ClaimMapping Type Unused by Concrete Mappers

| Model | Position |
|-------|----------|
| **Gemini** | Medium — reduces consistency |
| **Codex** | Interface mismatch — `ClaimMappingConfig` vs `Record<string,string>` |
| **Claude** | Low — functionally equivalent, shared type is for future adapters |

**Verdict**: The OIDC/SAML mappers use `Record<string, string>` (simpler, sufficient for Phase 2). The `ClaimMappingConfig` type in `@aptivo/types` is for future adapters that may need richer mapping (e.g., regex-based matching). Not a bug — the types serve different abstraction levels. **No fix needed.**

### D-3: mapClaims Never Returns Error

| Model | Position |
|-------|----------|
| **Codex** | Medium — `OidcClaimMappingError` defined but never emitted; no validation on sub/email |
| **Claude** | Agree — add minimal validation |
| **Gemini** | Not raised |

**Verdict — P2 FIX**: Add validation in `mapClaims` for empty `sub` and `email` fields, returning `OidcClaimMappingError`. External IdP claims should be validated before creating identity records.

### D-4: SAML Mapper Array Attribute Handling

| Model | Position |
|-------|----------|
| **Codex** | `displayName`/`cn` cast as `string` but may be `string[]` from SAML attributes |
| **Claude** | Valid — add array-safe extraction |
| **Gemini** | Not raised |

**Verdict — P2 FIX**: Extract first element when attribute is an array. SAML attributes are `string | string[]` per the schema — mapper should handle both.

---

## Test Coverage Gaps

| Gap | Severity | Covered By |
|-----|----------|------------|
| No tests for `checkPermissionWithBlacklist` | Medium | ID2-07 (auth-failure matrix) + ID2-11 (integration) |
| `resolvePermissionsWithFederation` tested with mocks only | Medium | Fix in C-2 adds real integration tests |
| No test for `assignRoles` failure in JIT provisioning | Low | Fix in C-3 adds failure path test |
| No tests for composition root env-gated behavior | Low | Existing pattern — consistent with all other getters |
| SAML mapper with array `displayName`/`cn` untested | Low | Fix in D-4 adds test |

---

## Actionable Recommendations

### P1 — Fix Before Batch 2

| # | Finding | Action | Files |
|---|---------|--------|-------|
| 1 | C-2 | Wire `resolvePermissionsWithFederation` into middleware when `user.federatedRoles` present | `rbac-middleware.ts`, `rbac-resolver.ts` |
| 2 | C-3 | Add `linkExternalId` to `JitUserStore`, call it + `assignRoles` in email-match path | `jit-provisioning.ts` |
| 3 | C-2 | Populate `federatedRoles` in `extractUser` from Supabase `app_metadata` | `rbac-resolver.ts` |

### P2 — Fix During Sprint 9

| # | Finding | Action | Files |
|---|---------|--------|-------|
| 4 | D-3 | Validate `sub`/`email` in `mapClaims`, return `OidcClaimMappingError` | `oidc-provider.ts` |
| 5 | D-4 | Handle array `displayName`/`cn` in SAML mapper | `saml-adapter.ts` |
| 6 | D-1 | Document transactional requirement for Drizzle JIT store adapter | `sprint-9-plan.md` |

### Accepted Risks

| # | Finding | Rationale |
|---|---------|-----------|
| 7 | C-1 (JTI header) | No routes use `checkPermissionWithBlacklist` yet; remediated when `extractUser` exposes `jti` in ID2-05/ID2-11 |
| 8 | D-2 (ClaimMapping unused) | Shared type is forward-looking; concrete mappers use simpler approach appropriately |

---

## Positive Practices Noted

- **Fail-open blacklist** — Redis errors don't block authentication (all models praised this)
- **Lazy initialization** — Composition root pattern consistent with Phase 1
- **Tagged union errors** — Strict adherence across all new services
- **Test coverage** — 86 tests for 3 tasks is strong baseline
- **Interface decoupling** — `JitUserStore`, `RedisClient` interfaces enable testing and future swaps
