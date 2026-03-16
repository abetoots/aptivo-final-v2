# Sprint 10 Implementation Plan: Infrastructure Hardening

**Theme**: "The floor must hold" — HA database, Redis isolation, automated drift detection
**Duration**: 2 weeks (Phase 2, Weeks 3-4)
**Total Story Points**: 28 SP (10 tasks)
**Packages**: `apps/web` (services, routes, middleware) + `@aptivo/database` (adapters) + CI/deploy
**FRD Coverage**: Non-functional (SLO compliance, operational maturity)
**Tier 2 Closure**: EP-1 (circuit-breaker lifecycle tests)
**Sprint 9 Residuals**: 6/6 absorbed (WebAuthn adapter, atomic Redis, auth route migration, MFA wiring, session route wiring, doc update)
**Derived from**: [Phase 2 Sprint Plan](./phase-2-sprint-plan.md) Sprint 2, [S9 Final Review](./S9_FINAL_MULTI_REVIEW.md)
**Multi-Model Review**: [S10_PLAN_MULTI_REVIEW.md](./S10_PLAN_MULTI_REVIEW.md) — Claude Opus 4.6 + Gemini 3 Flash Preview + Codex/GPT

---

## Executive Summary

Sprint 10 hardens the platform infrastructure for production readiness. Phase 1 and Sprint 9 built all services with in-memory/stub backing stores and env-var secrets. Sprint 10 replaces these with HA database failover, separate Redis instances (jobs vs sessions/cache), a secrets management abstraction, and automated drift detection. It also completes Sprint 9's deferred wiring — migrating admin routes to the enhanced middleware pipeline and connecting stub routes to real services.

### Sprint 9 Baseline (What Exists)

| Component | Sprint 9 State | Sprint 10 Target |
|-----------|---------------|-----------------|
| Database | Single Supabase instance | HA with < 30s failover |
| Redis | Single Upstash instance (blacklist + sessions + cache) | Split: jobs vs sessions/cache |
| Session eviction | Non-atomic read-modify-write | Atomic via Redis WATCH/MULTI |
| WebAuthn credentials | In-memory store | Drizzle adapter + persistent DB |
| Admin routes | `checkPermission` (no blacklist/MFA) | `checkPermissionWithBlacklist` (full pipeline) |
| MFA routes | Hardcoded stub client | `getMfaClient()` via composition root |
| Session routes | Stub responses | Wired to `getSessionLimitService()` |
| Secrets | Environment variables | Secrets abstraction with rotation support |
| Drift detection | Manual (Runbook §10.5) | Automated weekly CI pipeline |

---

## 1. Task Breakdown

### Phase 1: Data Layer Hardening (Days 1-4)

#### INF-01: HA Database + WebAuthn Drizzle Adapter (5 SP)

**Description**: Upgrade to HA database cluster with automatic failover. Create Drizzle adapter for WebAuthn credentials, replacing the in-memory store.

**Acceptance Criteria**:
- [ac] HA database provisioned (Supabase Pro or DO Managed PostgreSQL with standby)
- [ac] Automatic failover with < 30s interruption
- [ac] Connection string updated to HA endpoint in composition root
- [ac] `createDrizzleWebAuthnStore(db)` adapter implements `WebAuthnCredentialStore` interface
- [ac] CRUD operations: findByUserId, findByCredentialId, create, updateCounter, delete, rename
- [ac] `getWebAuthnService()` in services.ts wired to Drizzle adapter (replaces in-memory)
- [ac] Barrel export in `packages/database/src/adapters/index.ts`
- [ac] Tests for Drizzle adapter + composition root wiring

**Files**:
- Create: `packages/database/src/adapters/webauthn-store.ts`
- Modify: `packages/database/src/adapters/index.ts` (export)
- Modify: `apps/web/src/lib/services.ts` (wire real adapter)
- Modify: `apps/web/src/lib/db.ts` (HA connection string handling)
- Create: `apps/web/tests/s10-inf-01-ha-database.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `createDrizzleWebAuthnStore(db).findByUserId('u1')` returns empty array
2. Green: Implement SELECT with userId filter
3. Red: `.create({ credentialId, publicKey, ... })` returns stored credential with generated id
4. Green: Implement INSERT returning
5. Red: `.updateCounter('cred-1', 5)` updates counter value
6. Green: Implement UPDATE where credentialId
7. Red: `.delete('id-1')` removes credential
8. Green: Implement DELETE
9. Red: Composition root uses Drizzle adapter when DB available
10. Green: Update `getWebAuthnService()` to use `createDrizzleWebAuthnStore(db())`

---

#### INF-02: Per-Domain Connection Pools (2 SP)

**Description**: Configure isolated database connection pools for crypto and HR domains to prevent cross-domain pool exhaustion.

**Acceptance Criteria**:
- [ac] Pool configuration per domain: `{ crypto: { max: 10 }, hr: { max: 10 }, platform: { max: 20 } }`
- [ac] Domain-scoped `getDb(domain)` variant in composition root
- [ac] Pool exhaustion in one domain doesn't block others
- [ac] Connection pool metrics exposed via `getMetricService()`
- [ac] Tests for pool isolation behavior

**Files**:
- Modify: `apps/web/src/lib/db.ts` (domain pool config)
- Modify: `apps/web/src/lib/services.ts` (domain-scoped getters)
- Create: `apps/web/tests/s10-inf-02-connection-pools.test.ts`

**Dependencies**: INF-01

---

### Phase 2: Redis & Auth Hardening (Days 3-7)

#### INF-03: Redis Instance Separation + Atomic Session Ops (4 SP)

**Description**: Split the single Upstash Redis instance into two: one for Inngest job queues, one for sessions/cache/blacklist. Extend the `RedisClient` interface with WATCH/MULTI support and make session eviction atomic.

**Acceptance Criteria**:
- [ac] Two Redis instances configured: `UPSTASH_REDIS_JOBS_URL` + `UPSTASH_REDIS_SESSION_URL`
- [ac] Token blacklist and session limits use the session Redis
- [ac] Inngest workers use the jobs Redis (via Inngest config)
- [ac] `RedisClient` interface extended with `watch`, `multi`, `exec` methods
- [ac] `checkAndEvict` uses WATCH/MULTI for atomic read-modify-write
- [ac] Backward compatible: single `UPSTASH_REDIS_URL` still works (both services share it)
- [ac] Tests for atomic eviction under simulated concurrency

**Files**:
- Modify: `apps/web/src/lib/auth/token-blacklist.ts` (extend RedisClient)
- Modify: `apps/web/src/lib/auth/session-limit-service.ts` (atomic checkAndEvict)
- Modify: `apps/web/src/lib/services.ts` (split Redis getters)
- Create: `apps/web/tests/s10-inf-03-redis-separation.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `checkAndEvict` with WATCH detects concurrent modification
2. Green: Implement WATCH on index key, retry on conflict
3. Red: Two concurrent `checkAndEvict` calls don't exceed session limit
4. Green: MULTI/EXEC ensures atomic index update
5. Red: Single `UPSTASH_REDIS_URL` still works (backward compat)
6. Green: Fall back to single URL when split URLs not set

---

#### INF-04: Secrets Manager + MFA Client Factory (4 SP)

**Description**: Create a secrets abstraction layer supporting dual-key rotation (per ADD §8.11). Wire MFA routes to a composition root `getMfaClient()` that env-gates between Supabase MFA and stub.

**Acceptance Criteria**:
- [ac] `SecretsProvider` interface: `getSecret(key)`, `getRotatingSecret(key)` → `{ current, previous? }`
- [ac] `createEnvSecretsProvider()` reads from process.env with `_PREVIOUS` suffix convention
- [ac] HITL signing validates against both current and previous secret during rotation
- [ac] `getMfaClient()` in composition root: Supabase MFA when `NEXT_PUBLIC_SUPABASE_URL` set, stub fallback
- [ac] MFA routes use `getMfaClient()` instead of hardcoded `createMfaStubClient()`
- [ac] Tests for dual-key validation, rotation window, MFA client wiring

**Files**:
- Create: `apps/web/src/lib/auth/secrets-provider.ts`
- Modify: `apps/web/src/lib/services.ts` (add `getSecretsProvider()`, `getMfaClient()`)
- Modify: `apps/web/src/app/api/auth/mfa/enroll/route.ts` (use getMfaClient)
- Modify: `apps/web/src/app/api/auth/mfa/verify/route.ts` (use getMfaClient)
- Modify: `apps/web/src/app/api/auth/mfa/challenge/route.ts` (use getMfaClient)
- Create: `apps/web/tests/s10-inf-04-secrets-manager.test.ts`

**Dependencies**: None

---

#### INF-07: Auth Route Hardening (2 SP)

**Description**: Migrate admin routes from `checkPermission` to `checkPermissionWithBlacklist`. Wire session API routes to `getSessionLimitService()`. Closes Sprint 9 residuals D-1 and D-4.

**Acceptance Criteria**:
- [ac] All admin routes (`/api/admin/*`) use `checkPermissionWithBlacklist` with blacklist callback
- [ac] `GET /api/auth/sessions` calls `getSessionLimitService().listSessions(userId)`
- [ac] `DELETE /api/auth/sessions/:id` calls `removeSession()` + blacklists token
- [ac] Graceful fallback: if session service is null (no Redis), return empty list / 503
- [ac] Tests for route migration and session service integration

**Files**:
- Modify: `apps/web/src/app/api/admin/overview/route.ts`
- Modify: `apps/web/src/app/api/admin/audit/route.ts`
- Modify: `apps/web/src/app/api/admin/hitl/route.ts`
- Modify: `apps/web/src/app/api/admin/llm-usage/route.ts`
- Modify: `apps/web/src/app/api/admin/llm-usage/budget/route.ts`
- Modify: `apps/web/src/app/api/auth/sessions/route.ts`
- Modify: `apps/web/src/app/api/auth/sessions/[id]/route.ts`
- Create: `apps/web/tests/s10-inf-07-auth-route-hardening.test.ts`

**Dependencies**: INF-03 (Redis ready for blacklist), INF-04 (MFA client wired)

---

### Phase 3: Operational Maturity (Days 6-8)

#### INF-05: Worker Auto-Scaling Config (2 SP)

**Description**: Configure horizontal auto-scaling for Inngest background workers based on queue depth metrics.

**Acceptance Criteria**:
- [ac] Auto-scaling config in `.do/app.yaml` (or deploy config) with min/max worker count
- [ac] Scale trigger: queue depth > threshold for > 2 minutes
- [ac] Stabilization window: 5-minute cooldown to prevent flapping
- [ac] Runbook §8 updated with scaling procedures
- [ac] Tests for scaling config validation

**Files**:
- Modify: `.do/app.yaml` or deploy configuration
- Modify: `docs/06-operations/01-runbook.md`
- Create: `apps/web/tests/s10-inf-05-autoscaling.test.ts`

**Dependencies**: None

---

#### INF-06: Drift Detection CI Pipeline (2 SP)

**Description**: Automated weekly CI pipeline that detects infrastructure drift between `.do/app.yaml` (IaC) and live DigitalOcean configuration.

**Acceptance Criteria**:
- [ac] GitHub Actions workflow runs weekly (cron) + on-demand
- [ac] Exports live DO App Platform spec via `doctl apps spec get`
- [ac] Compares against committed `.do/app.yaml`
- [ac] Creates GitHub issue on drift detection with diff
- [ac] Closes Runbook §10.5 (currently manual process)
- [ac] Tests for diff comparison logic

**Files**:
- Create: `.github/workflows/drift-detection.yml`
- Create: `scripts/drift-check.sh`
- Modify: `docs/06-operations/01-runbook.md` (§10.5 → automated)
- Create: `apps/web/tests/s10-inf-06-drift-detection.test.ts`

**Dependencies**: None

---

### Phase 3b: Resilience Validation (Days 7-9)

#### INF-08: Circuit-Breaker Lifecycle Tests (2 SP)

**Description**: Comprehensive tests verifying MCP circuit breaker state transitions. Closes Tier 2 EP-1.

**Acceptance Criteria**:
- [ac] Test: closed → open transition after failure threshold exceeded
- [ac] Test: open → half-open transition after timeout
- [ac] Test: half-open → closed on success
- [ac] Test: half-open → open on failure
- [ac] Test: concurrent requests during half-open (single probe)
- [ac] Tests mapped to FR-CORE-MCP in RTM
- [ac] EP-1 documented as resolved

**Files**:
- Create: `apps/web/tests/s10-inf-08-circuit-breaker.test.ts`

**Dependencies**: None (tests existing Sprint 3 MCP code)

---

#### INF-09: HA Failover Validation (3 SP)

**Description**: Chaos testing to verify database failover behavior and system recovery within SLO targets.

**Acceptance Criteria**:
- [ac] Failover simulation: primary → standby promotion completes in < 30s
- [ac] Application reconnects automatically (no manual restart)
- [ac] In-flight requests fail gracefully with retry-after headers
- [ac] Connection pool recovery verified across all domains
- [ac] RTO target achievable at < 4h with automated failover
- [ac] Evidence documented in Runbook §13 (DR test results)

**Files**:
- Create: `scripts/failover-test.sh`
- Modify: `docs/06-operations/01-runbook.md` (§13 DR results)
- Create: `apps/web/tests/s10-inf-09-failover.test.ts`

**Dependencies**: INF-01, INF-02

---

### Phase 4: Integration & Closure (Day 10)

#### INF-10: Integration Tests + Doc Updates (2 SP)

**Description**: Cross-cutting integration tests + documentation updates for Sprint 10 closures.

**Acceptance Criteria**:
- [ac] E2E: WebAuthn registration persists across service restart (Drizzle adapter)
- [ac] E2E: Session eviction is atomic under concurrent logins
- [ac] E2E: Admin routes enforce blacklist + MFA + permission pipeline
- [ac] E2E: Single Redis URL backward compatibility
- [ac] ADD §8.7 updated: session limits from "Unlimited" to "Admin: 1, User: 3"
- [ac] All Sprint 10 code uses composition root (no direct constructor calls)

**Files**:
- Create: `apps/web/tests/s10-inf-10-integration.test.ts`
- Modify: `docs/03-architecture/platform-core-add.md` (§8.7)

**Dependencies**: All above

---

## 2. Dependency Graph

```
Phase 1 (Days 1-4) — Data Layer:
  INF-01 (HA DB + WebAuthn, 5SP) ──────────────────┐
  INF-02 (Connection Pools, 2SP) ← INF-01           │
                                                      │
Phase 2 (Days 3-7) — Redis & Auth:                    │
  INF-03 (Redis Split + Atomic, 4SP) ─── no deps ───┤
  INF-04 (Secrets + MFA, 4SP) ─── no deps ──────────┤
  INF-07 (Auth Routes, 2SP) ← INF-03, INF-04        │
                                                      │
Phase 3 (Days 6-9) — Operational:                     │
  INF-05 (Auto-Scaling, 2SP) ─── no deps             │
  INF-06 (Drift Detection, 2SP) ─── no deps          │
  INF-08 (Circuit Breaker, 2SP) ─── no deps          │
  INF-09 (Failover, 3SP) ← INF-01, INF-02           │
                                                      ▼
Phase 4 (Day 10):
  INF-10 (Integration + Docs, 2SP) ← all above
```

**Critical path**: INF-01 → INF-02 → INF-09 → INF-10

---

## 3. Architectural Decisions

### Q1: Redis Split Strategy

**Decision**: Two Upstash Redis instances. `UPSTASH_REDIS_SESSION_URL` for token blacklist + session limits + cache. `UPSTASH_REDIS_JOBS_URL` for Inngest job queues. Backward compatible: single `UPSTASH_REDIS_URL` serves both when split URLs aren't configured.

### Q2: Atomic Session Eviction

**Decision**: Extend `RedisClient` interface with `watch(key)`, `multi()`, `exec()`. The `checkAndEvict` operation uses WATCH on the session index key, reads current state, then MULTI/EXEC to atomically update. On WATCH conflict (concurrent modification), retry up to 3 times.

### Q3: Secrets Abstraction

**Decision**: `SecretsProvider` interface with `getRotatingSecret(key)` returning `{ current, previous? }`. The `_PREVIOUS` env var suffix convention (e.g., `HITL_SIGNING_SECRET_PREVIOUS`) provides the old key during rotation window. No external secrets manager in Sprint 10 — the abstraction layer enables migration to Vault/DO in Sprint 11+ without changing consumers.

### Q4: WebAuthn Store Location

**Decision**: `createDrizzleWebAuthnStore(db)` in `packages/database/src/adapters/webauthn-store.ts`. Follows the same pattern as all other Drizzle adapters (admin-store, hitl-request-store, etc.).

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| HA Database Upgrade | 5 | **Commit** | Production readiness blocker |
| Per-Domain Connection Pools | 2 | **Commit** | Cross-domain isolation |
| Redis Separation + Atomic Ops | 4 | **Commit** | Session integrity + performance |
| Secrets Manager + MFA Factory | 4 | **Commit** | Rotation support + S9 wiring |
| Worker Auto-Scaling | 2 | **Commit** | Operational maturity |
| Drift Detection | 2 | **Commit** | IaC compliance |
| Auth Route Hardening | 2 | **Commit** | S9 residual closure |
| Circuit-Breaker Tests (EP-1) | 2 | **Commit** | Tier 2 closure |
| HA Failover Validation | 3 | **Commit** | RTO target validation |
| Integration Tests + Docs | 2 | **Commit** | Sprint completion |
| Full Vault/DO Secrets Manager | 5 | **Defer → Sprint 11** | Abstraction layer sufficient |
| Redis Cluster (Sentinel) | 3 | **Defer → Sprint 11** | Upstash HA sufficient |
| DB read replicas for analytics | 3 | **Defer → Sprint 12** | Not yet needed |

**Committed**: 28 SP | **Deferred**: ~11 SP

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | INF-01 (5), INF-03 (4), INF-09 (3) | 12 |
| **Web Dev 1** | INF-04 (4), INF-06 (2), INF-07 (2) | 8 |
| **Web Dev 2** | INF-02 (2), INF-05 (2), INF-08 (2) | 6 |
| **All** | INF-10 (2) | 2 |
| **Total** | | **28 SP** |

Senior carries heavier load (12 SP) due to HA database migration and Redis splitting requiring deep infrastructure expertise. Web Dev 1 handles secrets + auth wiring (related concerns). Web Dev 2 handles connection pools + scaling + circuit breaker tests.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Database migration downtime | Medium | High | Blue-green upgrade; dry-run on staging; logical replication |
| Redis split key migration | Medium | Medium | Backward compat: single URL still works; gradual migration |
| WATCH/MULTI not supported by Upstash | Low | High | Upstash supports WATCH/MULTI; fallback to Lua scripts |
| Secrets rotation lockout | Low | High | Dual-key validation window (ADD §8.11); 24h overlap |
| Auto-scaling flapping | Medium | Low | 5-minute stabilization cooldown |
| Circuit-breaker test flakiness | Low | Low | Deterministic timers in tests |

---

## 7. Definition of Done

- [ ] HA database with automatic failover (< 30s interruption) *(INF-01)*
- [ ] WebAuthn credentials persisted via Drizzle adapter *(INF-01)*
- [ ] Per-domain connection pool isolation *(INF-02)*
- [ ] Separate Redis instances for jobs vs sessions/cache *(INF-03)*
- [ ] Session eviction is atomic (WATCH/MULTI) *(INF-03)*
- [ ] Secrets abstraction with dual-key rotation support *(INF-04)*
- [ ] `getMfaClient()` wired in composition root *(INF-04)*
- [ ] Worker auto-scaling configured with cooldown *(INF-05)*
- [ ] Drift detection runs weekly in CI *(INF-06)*
- [ ] Admin routes use `checkPermissionWithBlacklist` *(INF-07)*
- [ ] Session routes wired to `getSessionLimitService()` *(INF-07)*
- [ ] Circuit-breaker lifecycle tests pass (EP-1) *(INF-08)*
- [ ] HA failover validated with < 30s interruption *(INF-09)*
- [ ] RTO target achievable at < 4h with automated failover *(INF-09)*
- [ ] ADD §8.7 updated with Phase 2 session limits *(INF-10)*
- [ ] 80%+ test coverage on new infrastructure code
- [ ] CI pipeline green with all tests passing

---

## 8. Doc-Gate Requirement

| Document | Section | Task |
|----------|---------|------|
| `docs/03-architecture/platform-core-add.md` | §8.7 Session limits | INF-10 |
| `docs/06-operations/01-runbook.md` | §8 Scaling, §10.5 Drift, §13 DR | INF-05, INF-06, INF-09 |

---

## 9. Sprint 11 Preview

Sprint 11 (Multi-Approver HITL) depends on Sprint 10's infrastructure:

| Item | SP (est.) | Why it needs Sprint 10 |
|------|-----------|----------------------|
| Quorum-based approval | 5 | Needs HA database for multi-approver state |
| Parent/child workflows | 5 | Needs Redis separation for workflow state isolation |
| Approval delegation | 3 | Needs `checkPermissionWithBlacklist` on HITL routes |
