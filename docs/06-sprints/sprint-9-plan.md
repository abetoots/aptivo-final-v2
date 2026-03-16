# Sprint 9 Implementation Plan: Identity & Access Hardening

**Theme**: "Trust no token" — Enterprise auth, mandatory MFA, immediate revocation
**Duration**: 2 weeks (Phase 2, Weeks 1-2)
**Total Story Points**: 29 SP (11 tasks)
**Packages**: `apps/web` (auth, security, middleware) + `@aptivo/database` (session schema) + `@aptivo/types` (auth types)
**FRD Coverage**: FR-CORE-ID-001 (full SSO), FR-CORE-ID-003 (full session management)
**Tier 2 Closure**: EP-2 (auth-failure tests), AB-1 (async auth propagation), SM-1 (dual-secret rotation), AS-1 (JWT revocation window)
**WARNING Closure**: S3-W10 (event schema rollout policy)
**Derived from**: [Phase 2 Sprint Plan](./phase-2-sprint-plan.md) Sprint 1, [Phase 2 Roadmap](./phase-2-roadmap.md) Epic 1

---

## Executive Summary

Sprint 9 opens Phase 2 by hardening the identity layer. Phase 1 shipped Supabase Auth with magic links, JWT validation, and RBAC enforcement via `checkPermission()`. Sprint 9 adds enterprise SSO (OIDC), mandatory admin MFA, WebAuthn/Passkey support, concurrent session limits, and Redis-backed token blacklisting. This closes the 15-minute JWT revocation window (AS-1) and gates all subsequent Phase 2 work — HITL v2 (Sprint 11) needs RBAC v2, and LLM Safety (Sprint 12) needs admin MFA.

### Phase 1 Baseline (What Exists)

| Component | Phase 1 State | File |
|-----------|--------------|------|
| User extraction | Supabase JWT → `extractUser()` | `apps/web/src/lib/security/rbac-resolver.ts` |
| Permission check | `checkPermission(permission)` middleware | `apps/web/src/lib/security/rbac-middleware.ts` |
| RBAC schema | `user_roles` + `role_permissions` tables | `packages/database/src/schema/user-roles.ts` |
| Domain permissions | 34 permissions, 7 roles (crypto + HR) | `packages/database/src/seeds/{crypto,hr}-seeds.ts` |
| MFA | Optional TOTP enrollment via Supabase | `docs/04-specs/authentication.md` §6 |
| Session management | Supabase-managed, JWT-only | No custom session service |
| Token revocation | Relies on 15-minute JWT expiry | No blacklist |

---

## 1. Task Breakdown

### Phase 1: Enterprise Authentication (Days 1-5)

#### ID2-01: OIDC Provider Integration (5 SP)

**Description**: Wire Supabase Auth OIDC provider for enterprise IdPs (Google Workspace, Okta, Azure AD). Map IdP claims to Aptivo RBAC roles. Update `rbac-resolver.ts` to handle external identity sources with federated claim mapping.

**Acceptance Criteria**:
- [ac] Supabase Auth configured with OIDC provider for enterprise IdPs
- [ac] IdP group claims (`groups`) mapped to Aptivo roles via `claimToRoleMapping` config
- [ac] `extractUser()` handles both magic-link and OIDC-federated sessions
- [ac] `resolvePermissions()` merges IdP-mapped roles with locally-assigned roles
- [ac] JIT user provisioning: first OIDC login creates user record with mapped roles
- [ac] Login redirect flow: `/auth/sso?domain=example.com` → IdP → callback → session
- [ac] IdP connection health check endpoint: `GET /api/auth/sso/status`
- [ac] Zod schema for OIDC provider configuration
- [ac] Tests for claim mapping, JIT provisioning, merge logic, error paths

**Files**:
- Create: `apps/web/src/lib/auth/oidc-provider.ts` (provider config, claim mapping)
- Create: `apps/web/src/lib/auth/jit-provisioning.ts` (first-login user creation)
- Modify: `apps/web/src/lib/security/rbac-resolver.ts` (merge federated + local roles)
- Create: `apps/web/src/app/api/auth/sso/route.ts` (SSO login redirect)
- Create: `apps/web/src/app/api/auth/sso/status/route.ts` (IdP health check)
- Modify: `apps/web/src/lib/services.ts` (add `getOidcProvider()`)
- Create: `apps/web/tests/s9-id2-01-oidc-provider.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `mapIdpClaims({ groups: ['okta-admins'] })` returns `['admin']` per config
2. Green: Implement `ClaimMapper` with configurable `groupToRole` mapping
3. Red: `extractUser()` returns federated user with merged roles from IdP + DB
4. Green: Update resolver to query `user_roles` AND apply claim mapping
5. Red: First OIDC login for unknown user creates record with mapped roles
6. Green: Implement `jitProvision(claims)` → insert user + user_roles
7. Red: SSO redirect for `domain=example.com` redirects to configured IdP
8. Green: Implement domain → IdP lookup + Supabase Auth redirect
9. Red: Invalid IdP configuration → structured error response
10. Green: Validate config with Zod schema, return `Result.err()`

---

#### ID2-02: SAML Adapter Contract (3 SP)

**Description**: Define SAML 2.0 adapter interface contract for future enterprise customers. Phase 2 delivers OIDC; SAML is contract-only with a stub implementation. Validates Supabase SAML support availability on current plan.

**Acceptance Criteria**:
- [ac] `SamlAdapter` interface: `initiateLogin(domain)`, `handleCallback(samlResponse)`, `getMetadata()`
- [ac] `createSamlStubAdapter()` factory that returns `Result.err({ _tag: 'SamlNotConfigured' })`
- [ac] Supabase SAML capability assessment documented (Pro plan requirement, supported IdPs)
- [ac] SAML assertion-to-claims mapping interface matches OIDC claim mapping from ID2-01
- [ac] Integration point documented in `authentication.md` §6.3
- [ac] Tests for stub adapter behavior

**Files**:
- Create: `apps/web/src/lib/auth/saml-adapter.ts` (interface + stub)
- Create: `packages/types/src/auth.ts` (shared auth types: `SamlAdapter`, `SamlAssertion`, `ClaimMapping`)
- Modify: `docs/04-specs/authentication.md` (add §6.3 SAML Integration)
- Create: `apps/web/tests/s9-id2-02-saml-adapter.test.ts`

**Dependencies**: ID2-01 (claim mapping interface)

**TDD Micro-Tasks**:
1. Red: `createSamlStubAdapter().initiateLogin('example.com')` returns `Result.err(SamlNotConfigured)`
2. Green: Implement stub adapter
3. Red: `SamlAssertion` schema validates standard SAML response fields
4. Green: Define Zod schema for assertion parsing
5. Red: SAML claim mapping uses same interface as OIDC claim mapping
6. Green: Extract shared `ClaimMapping` type to `@aptivo/types`

---

#### ID2-03: Admin MFA Enrollment & Enforcement (3 SP)

**Description**: Mandatory MFA for admin roles. TOTP (authenticator app) as primary factor. Server-side enforcement: admin API routes reject requests without `aal2` (Authenticator Assurance Level 2). Step-up challenge for sensitive operations.

**Acceptance Criteria**:
- [ac] `requireMfa()` middleware factory: checks Supabase `aal` claim in JWT
- [ac] Admin routes (`/api/admin/*`) require `aal2`; return 403 with step-up challenge URL if `aal1`
- [ac] `GET /api/auth/mfa/enroll` returns TOTP QR code URI via Supabase MFA API
- [ac] `POST /api/auth/mfa/verify` validates TOTP code, promotes session to `aal2`
- [ac] `POST /api/auth/mfa/challenge` initiates step-up challenge for already-enrolled users
- [ac] Sensitive operations list configurable: role assignment, webhook secret rotation, audit export
- [ac] MFA enrollment status persisted in user metadata (enrolled_at, method)
- [ac] Tests for enforcement, enrollment, step-up, and bypass prevention

**Files**:
- Create: `apps/web/src/lib/auth/mfa-enforcement.ts` (requireMfa middleware)
- Create: `apps/web/src/app/api/auth/mfa/enroll/route.ts`
- Create: `apps/web/src/app/api/auth/mfa/verify/route.ts`
- Create: `apps/web/src/app/api/auth/mfa/challenge/route.ts`
- Modify: `apps/web/src/lib/security/rbac-middleware.ts` (compose MFA + permission checks)
- Create: `apps/web/tests/s9-id2-03-mfa-enforcement.test.ts`

**Dependencies**: ID2-01 (OIDC sessions carry `aal` claim)

**TDD Micro-Tasks**:
1. Red: `requireMfa()` on admin route returns 403 when JWT has `aal: 'aal1'`
2. Green: Implement AAL claim extraction and comparison
3. Red: 403 response includes `mfa_challenge_url` for step-up
4. Green: Build challenge URL from Supabase MFA endpoint
5. Red: `/api/auth/mfa/enroll` returns TOTP secret + QR URI
6. Green: Call Supabase `auth.mfa.enroll({ factorType: 'totp' })`
7. Red: `/api/auth/mfa/verify` with valid TOTP promotes to `aal2`
8. Green: Call Supabase `auth.mfa.challengeAndVerify()`

---

### Phase 2: Session Hardening (Days 4-7)

#### ID2-04: WebAuthn/Passkey Registration (5 SP)

**Description**: WebAuthn/Passkey registration and challenge verification. Depends on Supabase WebAuthn support. Falls back to TOTP if WebAuthn is unavailable.

**Acceptance Criteria**:
- [ac] Feature detection: `GET /api/auth/webauthn/status` returns `{ available: boolean, reason?: string }`
- [ac] Registration flow: `POST /api/auth/webauthn/register/options` → `POST /api/auth/webauthn/register/verify`
- [ac] Authentication flow: `POST /api/auth/webauthn/authenticate/options` → `POST /api/auth/webauthn/authenticate/verify`
- [ac] `webauthn_credentials` table: credentialId, publicKey, userId, counter, transports, createdAt
- [ac] Credential management: list, rename, delete registered passkeys
- [ac] Fallback: if Supabase WebAuthn API unavailable, return `{ available: false, reason: 'provider_unsupported' }`
- [ac] Browser capability check helper for client-side conditional UI
- [ac] Tests for registration, authentication, credential management, fallback

**Files**:
- Create: `apps/web/src/lib/auth/webauthn-service.ts` (registration/authentication logic)
- Create: `apps/web/src/app/api/auth/webauthn/register/options/route.ts`
- Create: `apps/web/src/app/api/auth/webauthn/register/verify/route.ts`
- Create: `apps/web/src/app/api/auth/webauthn/authenticate/options/route.ts`
- Create: `apps/web/src/app/api/auth/webauthn/authenticate/verify/route.ts`
- Create: `apps/web/src/app/api/auth/webauthn/status/route.ts`
- Modify: `packages/database/src/schema/user-roles.ts` (add `webauthn_credentials` table)
- Modify: `apps/web/src/lib/services.ts` (add `getWebAuthnService()`)
- Create: `apps/web/tests/s9-id2-04-webauthn.test.ts`

**Dependencies**: ID2-03 (MFA infrastructure)

**TDD Micro-Tasks**:
1. Red: `GET /api/auth/webauthn/status` returns `{ available: true }` when Supabase supports it
2. Green: Check Supabase MFA factors API for WebAuthn support
3. Red: Registration options include correct RP ID, user ID, challenge
4. Green: Generate registration options via `@simplewebauthn/server`
5. Red: Verify registration response → persist credential in `webauthn_credentials`
6. Green: Verify attestation, extract public key, insert row
7. Red: Authentication challenge → verify assertion → promote to `aal2`
8. Green: Verify authentication response, increment counter
9. Red: Supabase WebAuthn unavailable → `{ available: false, reason: 'provider_unsupported' }`
10. Green: Catch API error, return fallback response

---

#### ID2-05: Concurrent Session Limits (3 SP)

**Description**: Configurable concurrent session limit per role. Default: 3 for User, 1 for Admin. Oldest session evicted on new login when limit reached. Session count tracked in Redis.

**Acceptance Criteria**:
- [ac] `active_sessions` Redis hash: `user:{userId}` → sorted set of `{ sessionId, createdAt, deviceInfo }`
- [ac] `SessionLimitService.checkAndEvict(userId, role, newSessionId)`: enforces limit, evicts oldest
- [ac] Evicted sessions invalidated via Supabase `auth.admin.signOut(sessionId)` + blacklist (ID2-06)
- [ac] Configurable limits: `SESSION_LIMITS = { admin: 1, user: 3 }` (env-overridable)
- [ac] `GET /api/auth/sessions` returns active sessions for current user (device, created, last used)
- [ac] `DELETE /api/auth/sessions/:id` allows user to terminate own session
- [ac] New login event triggers session count check (Supabase webhook or middleware)
- [ac] Tests for limit enforcement, eviction ordering, self-termination

**Files**:
- Create: `apps/web/src/lib/auth/session-limit-service.ts`
- Create: `apps/web/src/app/api/auth/sessions/route.ts` (list sessions)
- Create: `apps/web/src/app/api/auth/sessions/[id]/route.ts` (terminate session)
- Modify: `apps/web/src/lib/services.ts` (add `getSessionLimitService()`)
- Create: `apps/web/tests/s9-id2-05-session-limits.test.ts`

**Dependencies**: ID2-01 (session tracking needs auth event hooks)

**TDD Micro-Tasks**:
1. Red: Admin with 1 active session → new login evicts the existing session
2. Green: Implement Redis sorted set with session tracking, pop oldest when limit exceeded
3. Red: User with 3 active sessions → 4th login evicts the oldest
4. Green: Same logic, different limit from config
5. Red: Evicted session ID added to blacklist (integration with ID2-06)
6. Green: Call `blacklistToken(sessionId)` on eviction
7. Red: `GET /api/auth/sessions` returns only current user's sessions
8. Green: Query Redis sorted set, filter by userId
9. Red: `DELETE /api/auth/sessions/:id` removes session and blacklists token
10. Green: Remove from Redis, add to blacklist, call Supabase signOut

---

#### ID2-06: Redis Token Blacklist (3 SP)

**Description**: Redis-backed JWT blacklist with TTL matching JWT expiry. `checkBlacklist()` middleware runs on every authenticated request. Closes the 15-minute JWT revocation window (Tier 2 AS-1). Revocation propagation < 1s.

**Acceptance Criteria**:
- [ac] `TokenBlacklistService.blacklist(jti, expiresAt)`: adds JWT ID to Redis with auto-expiring TTL
- [ac] `TokenBlacklistService.isBlacklisted(jti)`: O(1) Redis EXISTS check
- [ac] `checkBlacklist()` middleware: extract `jti` from JWT, check Redis, return 401 if blacklisted
- [ac] TTL auto-cleanup: blacklist entries expire when the original JWT would have expired
- [ac] Revocation propagation: < 1 second from blacklist call to rejection
- [ac] Integrated into request pipeline: runs AFTER JWT validation, BEFORE permission check
- [ac] Blacklist on: logout, session eviction (ID2-05), role change, admin force-revoke
- [ac] Monitoring: `GET /api/admin/auth/blacklist-stats` returns count, oldest entry
- [ac] Tests for blacklisting, TTL expiry, pipeline ordering, performance

**Files**:
- Create: `apps/web/src/lib/auth/token-blacklist.ts`
- Modify: `apps/web/src/lib/security/rbac-middleware.ts` (add blacklist check before permission resolution)
- Modify: `apps/web/src/lib/services.ts` (add `getTokenBlacklist()`)
- Create: `apps/web/tests/s9-id2-06-token-blacklist.test.ts`

**Dependencies**: None (but consumed by ID2-05)

**TDD Micro-Tasks**:
1. Red: `blacklist(jti, expiresAt)` → `isBlacklisted(jti)` returns true
2. Green: Implement Redis SET with EX (TTL = expiresAt - now)
3. Red: After TTL expires → `isBlacklisted(jti)` returns false
4. Green: Rely on Redis key expiration
5. Red: `checkBlacklist()` middleware returns 401 for blacklisted JWT
6. Green: Extract `jti` from validated JWT payload, check blacklist
7. Red: Non-blacklisted token passes through middleware (returns null)
8. Green: EXISTS returns 0 → return null
9. Red: Blacklist check runs before permission resolution in pipeline
10. Green: Update `checkPermission()` to call `checkBlacklist()` first

---

### Phase 3: Tier 2 Closures & Documentation (Days 8-9)

#### ID2-07: Auth-Failure Test Matrix (2 SP)

**Description**: Comprehensive auth-failure test matrix covering all negative authentication and authorization paths. Closes Tier 2 EP-2.

**Acceptance Criteria**:
- [ac] Test: expired JWT → 401 with `token_expired` error code
- [ac] Test: invalid JWT signature → 401 with `invalid_signature` error code
- [ac] Test: JWKS endpoint unreachable → stale-if-error fallback (cached keys used, request succeeds)
- [ac] Test: JWKS stale-if-error expired → 503 with `jwks_unavailable` error code
- [ac] Test: MFA step-up required (`aal1` on admin route) → 403 with `mfa_required` + challenge URL
- [ac] Test: blacklisted token → 401 with `token_revoked` error code
- [ac] Test: exceeded session limit → oldest session blacklisted, new session active
- [ac] Test: insufficient permission → 403 with `permission_denied` + required permission
- [ac] Test: federated user with unmapped IdP group → default role assignment
- [ac] All tests mapped to FR-CORE-ID-001/002/003 in RTM
- [ac] Test file documents which Tier 2 finding each test closes

**Files**:
- Create: `apps/web/tests/s9-id2-07-auth-failure-matrix.test.ts`

**Dependencies**: ID2-01, ID2-03, ID2-06 (tests exercise all new auth paths)

**TDD Micro-Tasks**:
1. Write test matrix as describe blocks with test stubs (all red)
2. Verify each test exercises a distinct failure mode
3. Run full matrix — all should pass against Sprint 9 implementations

---

#### ID2-08: Async Auth Propagation Doc (1 SP)

**Description**: Document how user identity and roles propagate through Inngest `step.run()` activities. Closes Tier 2 AB-1.

**Acceptance Criteria**:
- [ac] ADD §8.9 added: "Auth Context in Durable Execution"
- [ac] Documented pattern: serialize `{ userId, roles, permissions }` into Inngest event payload
- [ac] Documented pattern: deserialize auth context in step function, validate freshness
- [ac] Documented anti-pattern: relying on request-scoped auth in background steps
- [ac] Documented edge case: role change between workflow start and step execution
- [ac] Code example showing the pattern in an Inngest function

**Files**:
- Modify: `docs/03-architecture/platform-core-add.md` (add §8.9)

**Dependencies**: None

---

#### ID2-09: Dual-Secret Rotation Doc (1 SP)

**Description**: Document dual-secret rotation mechanism for HITL_SECRET and webhook HMAC keys. Closes Tier 2 SM-1.

**Acceptance Criteria**:
- [ac] ADD §8.10 added: "Secret Rotation Procedure"
- [ac] Documented dual-key validation window: app accepts both old and new secret during rotation
- [ac] Runbook §9.3 expanded with step-by-step rotation procedure
- [ac] Secrets covered: HITL_SECRET, webhook HMAC signing key, Supabase service key
- [ac] Rotation window: configurable, default 24h overlap
- [ac] Monitoring: log warning when old key used during rotation window

**Files**:
- Modify: `docs/03-architecture/platform-core-add.md` (add §8.10)
- Modify: `docs/06-operations/01-runbook.md` (expand §9.3)

**Dependencies**: None

---

#### ID2-10: Event Schema Rollout Policy (1 SP)

**Description**: Documented policy for rolling out breaking Inngest event schema changes. Closes WARNING S3-W10.

**Acceptance Criteria**:
- [ac] Policy document added to `docs/05-guidelines/` or as ADD appendix
- [ac] Procedure: add new fields as optional → deploy consumers → make required → remove old fields
- [ac] Backward compatibility: consumers must handle both old and new schemas during rollout
- [ac] Versioning convention: `event/v2` suffix for breaking changes vs additive changes
- [ac] Inngest-specific: Zod schema coercion strategy for optional → required migration
- [ac] WARNING S3-W10 marked resolved in WARNINGS_REGISTER.md

**Files**:
- Modify: `docs/03-architecture/platform-core-add.md` (add appendix or §12.x)
- Modify: `docs/WARNINGS_REGISTER.md` (resolve S3-W10)

**Dependencies**: None

---

### Phase 4: Integration & Closure (Day 10)

#### ID2-11: Integration Tests (2 SP)

**Description**: End-to-end integration tests validating the full auth pipeline: SSO login → MFA step-up → session tracking → permission check → token blacklist.

**Acceptance Criteria**:
- [ac] E2E test: OIDC login → claim mapping → role assignment → admin access
- [ac] E2E test: MFA enrollment → step-up challenge → admin route access
- [ac] E2E test: session limit exceeded → oldest evicted → new session active
- [ac] E2E test: token blacklisted → immediate rejection on next request
- [ac] E2E test: role change → affected tokens blacklisted → re-auth required
- [ac] Pipeline ordering test: JWT validation → blacklist check → MFA check → permission check
- [ac] All tests use composition root wiring (no direct constructor calls)

**Files**:
- Create: `apps/web/tests/s9-id2-11-integration.test.ts`
- Modify: `apps/web/src/lib/services.ts` (verify all new services wired)

**Dependencies**: ID2-01 through ID2-06 complete

---

## 2. Dependency Graph

```
Phase 1 (Days 1-5) — OIDC + SAML + MFA:
  ID2-01 (OIDC, 5SP) ──────────────────────────────────┐
  ID2-02 (SAML, 3SP) ← ID2-01 (claim mapping)          │
  ID2-03 (MFA, 3SP)  ← ID2-01 (AAL in OIDC sessions)   │
                                                         │
Phase 2 (Days 4-7) — Sessions + Blacklist:               │
  ID2-06 (Blacklist, 3SP)  ─── no deps ─────────────────┤
  ID2-05 (Sessions, 3SP)   ← ID2-01, ID2-06             │
  ID2-04 (WebAuthn, 5SP)   ← ID2-03 (MFA infra)        │
                                                         │
Phase 3 (Days 8-9) — Docs + Test Matrix:                 │
  ID2-07 (Test Matrix, 2SP) ← ID2-01, ID2-03, ID2-06   │
  ID2-08 (Async Auth, 1SP) ─── no deps                  │
  ID2-09 (Rotation Doc, 1SP) ─── no deps                │
  ID2-10 (Schema Policy, 1SP) ─── no deps               │
                                                         ▼
Phase 4 (Day 10):
  ID2-11 (Integration, 2SP) ← all above
```

**Critical path**: ID2-01 → ID2-03 → ID2-04 → ID2-11

---

## 3. Architectural Decisions

### Q1: OIDC vs Auth.js Provider Swap

**Decision**: Keep Supabase Auth as the IdP. OIDC federation is configured via Supabase's third-party auth providers, NOT by replacing Supabase with Auth.js OIDC. The `authentication.md` §2.1 Auth.js code is reference only — actual implementation uses Supabase client SDK.

### Q2: Redis for Session Tracking AND Blacklist

**Decision**: Use the existing Redis instance (Upstash) for both session tracking (sorted sets) and token blacklist (key-value with TTL). These are low-volume operations (< 100 ops/sec) that don't justify separate Redis instances. Sprint 10 (Infrastructure) will split Redis if needed.

### Q3: WebAuthn Library Choice

**Decision**: Use `@simplewebauthn/server` (MIT, well-maintained) for server-side WebAuthn operations. Client-side uses `@simplewebauthn/browser`. Supabase native WebAuthn support is preferred if available; library is the fallback.

### Q4: MFA Enforcement Scope

**Decision**: Sprint 9 enforces MFA on admin routes (`/api/admin/*`) and sensitive operations (role changes, audit export). General user routes do NOT require MFA. MFA enrollment is strongly encouraged (UI nudge) but not mandatory for non-admin roles.

### Q5: Claim Mapping Configuration

**Decision**: IdP-to-role mapping is stored in environment config (not database) for Phase 2. This is simpler and sufficient for < 10 IdP configurations. Database-backed mapping with admin UI is Phase 3 scope.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| OIDC Provider Integration | 5 | **Commit** | Enterprise deployment blocker |
| SAML Adapter Contract | 3 | **Commit** | Contract-only; validates Supabase capability |
| Admin MFA Enforcement | 3 | **Commit** | Security hardening; gates Sprint 11-12 |
| WebAuthn/Passkey | 5 | **Commit** | Enterprise auth standard; TOTP fallback |
| Concurrent Session Limits | 3 | **Commit** | FR-CORE-ID-003 full scope |
| Redis Token Blacklist | 3 | **Commit** | Closes AS-1 (15-min revocation window) |
| Auth-Failure Test Matrix | 2 | **Commit** | Closes EP-2 |
| Async Auth Propagation Doc | 1 | **Commit** | Closes AB-1 |
| Dual-Secret Rotation Doc | 1 | **Commit** | Closes SM-1 |
| Event Schema Rollout Policy | 1 | **Commit** | Closes S3-W10 |
| Integration Tests | 2 | **Commit** | Sprint completion requirement |
| User management admin UI | 5 | **Defer → Sprint 11** | Not needed for auth hardening |
| Role assignment API | 3 | **Defer → Sprint 11** | Current DB-direct assignment sufficient |
| Database-backed IdP config | 3 | **Defer → Phase 3** | Env config sufficient for < 10 IdPs |
| SMS MFA channel | 2 | **Defer → Phase 3** | TOTP + WebAuthn sufficient |

**Committed**: 29 SP | **Deferred**: ~13 SP

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | ID2-01 (5), ID2-02 (3), ID2-06 (3) | 11 |
| **Web Dev 1** | ID2-03 (3), ID2-05 (3), ID2-09 (1), ID2-10 (1) | 8 |
| **Web Dev 2** | ID2-04 (5), ID2-07 (2), ID2-08 (1) | 8 |
| **All** | ID2-11 (2) | 2 |
| **Total** | | **29 SP** |

Senior carries heavier load (11 SP) due to OIDC integration complexity and Redis blacklist requiring infrastructure expertise. Web Devs are balanced at 8 SP each with WebAuthn (complex but well-documented) and MFA/sessions (moderate complexity).

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Supabase OIDC enterprise IdP limitations | Medium | High | Validate Okta + Azure AD in Day 1; fallback to direct OIDC library |
| Supabase WebAuthn not available on current plan | High | Medium | TOTP fallback always available; WebAuthn is progressive enhancement |
| Redis latency on blacklist check (every request) | Low | High | O(1) EXISTS operation; p99 < 1ms for Upstash; circuit breaker on Redis failure |
| MFA enrollment friction increases drop-off | Medium | Low | Enrollment only mandatory for admins; smooth onboarding UX |
| SAML Pro plan requirement blocks contract | Low | Medium | SAML is contract-only in Phase 2; no implementation commitment |
| Session eviction race condition (concurrent logins) | Medium | Medium | Redis WATCH/MULTI for atomic check-and-evict |

---

## 7. Definition of Done

- [ ] OIDC SSO login works end-to-end with at least one enterprise IdP *(ID2-01, FR-CORE-ID-001)*
- [ ] IdP claims correctly mapped to Aptivo RBAC roles *(ID2-01)*
- [ ] SAML adapter contract defined with stub implementation *(ID2-02)*
- [ ] Admin MFA is mandatory and enforced server-side *(ID2-03, FR-CORE-ID-001)*
- [ ] WebAuthn/Passkey enrollment and authentication functional *(ID2-04, FR-CORE-ID-001)*
- [ ] Concurrent session limits enforced per role *(ID2-05, FR-CORE-ID-003)*
- [ ] Redis token blacklist eliminates 15-minute JWT exposure window *(ID2-06, AS-1)*
- [ ] Auth-failure test matrix covers 9+ failure modes *(ID2-07, EP-2)*
- [ ] Async auth propagation documented in ADD §8.9 *(ID2-08, AB-1)*
- [ ] Dual-secret rotation documented in ADD §8.10 and Runbook §9.3 *(ID2-09, SM-1)*
- [ ] Event schema rollout policy documented; S3-W10 resolved *(ID2-10)*
- [ ] E2E integration tests validate full auth pipeline *(ID2-11)*
- [ ] 80%+ test coverage on new identity/session code
- [ ] CI pipeline green with all auth-failure negative tests passing
- [ ] `services.ts` composition root wires all new services

---

## 8. Doc-Gate Requirement

Per Phase 2 Roadmap §6, Epic 1 requires updates to:

| Document | Section | Task |
|----------|---------|------|
| `docs/04-specs/authentication.md` | §6.3 SAML Integration | ID2-02 |
| `docs/03-architecture/platform-core-add.md` | §8.9 Auth in Durable Execution | ID2-08 |
| `docs/03-architecture/platform-core-add.md` | §8.10 Secret Rotation Procedure | ID2-09 |
| `docs/06-operations/01-runbook.md` | §9.3 Secret Rotation Steps | ID2-09 |
| `docs/WARNINGS_REGISTER.md` | S3-W10 closure | ID2-10 |

---

## 9. Sprint 10 Preview

Sprint 10 (Infrastructure Hardening) depends on Sprint 9's Redis usage patterns:

| Item | SP (est.) | Why it needs Sprint 9 |
|------|-----------|----------------------|
| Redis instance separation | 3 | Session + blacklist usage informs split strategy |
| HA database upgrade | 5 | Auth tables (user_roles, webauthn_credentials) in HA scope |
| Drift detection CI | 3 | New Redis config needs drift baseline |
