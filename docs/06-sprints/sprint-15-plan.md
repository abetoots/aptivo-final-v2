# Sprint 15 Implementation Plan: Production Readiness + LLM Safety v2 Start

**Theme**: "Go live" — wire real infrastructure, validate against staging topology, remove dev stubs from production paths, begin streaming safety pipeline
**Duration**: 2 weeks (Phase 3, Weeks 1-2 — FIRST Phase 3 Sprint)
**Total Story Points**: 26 SP (10 tasks)
**Packages**: `apps/web` (composition root, auth guards, feature flags, E2E validation) + `@aptivo/llm-gateway` (streaming content filter) + `@aptivo/database` (pool config enforcement)
**FRD Coverage**: Epic 1 (Production Readiness), Epic 2 start (LLM Safety v2 — streaming filter MVP)
**Sprint 14 Residuals**: 0 — Phase 2 closed cleanly per [S14 Delivery Review](./phase-2-delivery-review.md)
**Derived from**: [Phase 3 Roadmap](./phase-3-roadmap.md) Sprint 15, [Phase 2 Delivery Review](./phase-2-delivery-review.md) release gates
**Multi-Model Review**: [S15_PLAN_MULTI_REVIEW.md](./S15_PLAN_MULTI_REVIEW.md) — Claude Opus 4.6 + Codex/GPT

---

## Executive Summary

Sprint 15 is the first Phase 3 sprint and is overwhelmingly operational. The codebase already contains all the interfaces — HA database handling (`resolveConnectionString`, `reconnect`), Redis split (`buildSessionRedis` with `UPSTASH_REDIS_SESSION_URL`), MFA enforcement (`createMfaEnforcement`), SMTP adapter (`createSmtpAdapter` with `validateSmtpConfig`), feature flags (`createFeatureFlagService` with `createLocalFlagProvider`). Sprint 15 configures, validates, and tests these interfaces against real infrastructure.

The production readiness track (PR-01 through PR-09) covers the full deployment surface: Supabase Pro OIDC/MFA activation, MFA stub removal in production, HA database cluster provisioning with measured failover, pool config enforcement at the pg driver level, split Redis instances for session vs job isolation, SMTP credential activation with failover testing, feature flag rollout controls, production E2E validation against staging topology, and game-day runbook drills. The LLM safety track (LLM3-01) begins Epic 2 with a streaming content filter MVP that evaluates accumulated chunks rather than individual fragments.

This sprint is a deployment gate: no subsequent Phase 3 sprints should ship production features until PR-08 (production E2E) passes.

### Sprint 14 Baseline (What Exists)

| Component | Sprint 14 State | Sprint 15 Target |
|-----------|----------------|-----------------|
| OIDC SSO | `createClaimMapper` + `loadProvidersFromEnv` with `OIDC_PROVIDERS_CONFIG` | Real Okta/Azure AD provider configured via Supabase Pro |
| MFA enforcement | `createMfaStubClient()` returned in all environments | Stub removed in production; real Supabase MFA client wired |
| HA database | `resolveConnectionString()` supports `DATABASE_URL_HA` | Real Railway PostgreSQL cluster (Patroni HA) with measured failover |
| Connection pooling | `createDatabase(url, { max, idleTimeoutMs })` accepted but untested under load | Pool config verified at pg driver level under load |
| Redis split | `buildSessionRedis()` reads `UPSTASH_REDIS_SESSION_URL` with fallback | Separate session + jobs Redis instances configured and verified |
| SMTP failover | `createSmtpAdapter` + `createFailoverAdapter` implemented | Real SMTP credentials set; failover tested (Novu down -> SMTP delivers) |
| Feature flags | `createLocalFlagProvider(DEFAULT_FLAGS)` with static JSON | Env-backed provider for production; deny-by-default for risky flags |
| E2E validation | Per-sprint unit + integration tests with in-memory stores | Full golden path against staging with real infrastructure |
| Runbook drills | DR procedures documented but untested | Failover + rollback drills executed with timestamps |
| Streaming content filter | `createContentFilter` handles complete request/response | Chunk-level filter evaluates accumulated stream with kill-switch |

---

## 1. Task Breakdown

### Phase 1: Auth & Identity Infrastructure (Days 1-3)

#### PR-01: Supabase Pro OIDC SSO + MFA Production Configuration (4 SP)

**Description**: Activate the Supabase Pro plan's OIDC provider integration for Okta and Azure AD, configure MFA policies (TOTP mandatory for admin roles), and document the break-glass admin account procedure. The existing `loadProvidersFromEnv()` in `oidc-provider.ts` already parses `OIDC_PROVIDERS_CONFIG` into `OidcProviderConfig[]` with `groupToRoleMapping` and `domains`. This task writes the real provider config JSON, verifies claim mapping against a real IdP, and enables Supabase MFA enforcement policies. WebAuthn registration is activated if available on the Pro plan (the `WebAuthnService` in services.ts already supports it). A break-glass admin account with local credentials is documented as a fallback when SSO is unavailable.

**Acceptance Criteria**:
- [ac] `OIDC_PROVIDERS_CONFIG` env var set with real Okta provider config: `{ providerId: 'okta', displayName: 'Okta SSO', issuerUrl, clientId, groupToRoleMapping: { 'admins': 'admin', 'developers': 'developer', 'viewers': 'viewer' }, defaultRole: 'user', domains: ['company.com'] }`
- [ac] `OIDC_PROVIDERS_CONFIG` includes Azure AD provider as secondary: `{ providerId: 'azure-ad', displayName: 'Azure AD', ... }`
- [ac] SSO login verified: OIDC callback maps IdP groups to platform roles via `createClaimMapper`
- [ac] JIT provisioning verified: first SSO login creates user account via `JitProvisioner`
- [ac] Supabase MFA policy configured: TOTP mandatory for users with `admin` role
- [ac] MFA step-up verified: `SENSITIVE_OPERATIONS` require `aal2` before access granted
- [ac] WebAuthn registration enabled (if Supabase Pro supports it): `getWebAuthnService().beginRegistration()` succeeds
- [ac] Break-glass admin account documented: local credentials stored in secrets provider, bypass SSO when IdP is down
- [ac] Break-glass procedure added to operator runbook: `docs/05-guidelines/operator-runbook.md` new section
- [ac] Integration test: SSO login + MFA step-up flow against real Supabase instance
- [ac] Integration test: JIT provisioning creates new user from OIDC claims
- [ac] Integration test: break-glass local login succeeds when OIDC providers are empty

**Files**:
- Create: `apps/web/src/lib/auth/supabase-mfa-client.ts`
- Modify: `apps/web/src/lib/services.ts` (wire real Supabase MFA client in production)
- Modify: `docs/05-guidelines/operator-runbook.md` (add break-glass procedure section)
- Create: `apps/web/tests/s15-pr-01-sso-mfa-production.test.ts`

**Dependencies**: None (uses existing OIDC, MFA, WebAuthn services from Sprint 9)

**TDD Micro-Tasks**:
1. Red: `createSupabaseMfaClient(supabaseClient)` returns a `SupabaseMfaClient` implementing `enroll`, `challenge`, `verify`, `listFactors`
2. Green: implement wrapper that delegates to `supabase.auth.mfa.enroll()`, `challenge()`, `verify()`, `listFactors()` and maps to `Result<T, MfaError>`
3. Red: `enroll({ factorType: 'totp' })` returns `Result.ok({ factorId, totpUri, qrCode })` from real Supabase
4. Green: call `supabase.auth.mfa.enroll()`, extract `id`, `totp.uri`, `totp.qr_code`, wrap in Result
5. Red: `verify({ factorId, challengeId, code: '123456' })` returns `Result.ok({ aal: 'aal2' })` on valid TOTP
6. Green: call `supabase.auth.mfa.verify()`, extract `aal`, wrap in Result
7. Red: `loadProvidersFromEnv()` returns 2 providers when `OIDC_PROVIDERS_CONFIG` contains Okta + Azure AD config
8. Green: set env var with real JSON, verify `Result.ok` with 2 `OidcProviderConfig` entries
9. Red: `createClaimMapper(deps).mapClaims(oidcClaims, provider)` maps `groups: ['admins']` to `roles: ['admin']`
10. Green: verify `groupToRoleMapping` lookup produces correct role
11. Red: integration test — SSO login flow (mock Supabase OIDC callback) produces authenticated session with mapped roles
12. Green: wire OIDC callback handler, verify session contains expected roles
13. Red: integration test — break-glass login succeeds with local credentials when `OIDC_PROVIDERS_CONFIG` is empty
14. Green: verify local auth path fallback works when no OIDC providers configured

---

#### PR-02: Remove MFA Stub Path in Production (2 SP)

**Description**: The current `getMfaClient()` in `services.ts` always returns `createMfaStubClient()` regardless of environment. In production, this means MFA enforcement is cosmetic — the stub always returns `aal2` on verify, making any TOTP code valid. This task adds a startup guard: when `NODE_ENV=production` and `NEXT_PUBLIC_SUPABASE_URL` is not set, the application must fail to start with a clear error. The stub path must only be reachable in development and test environments. MFA API routes (`/api/auth/mfa/*`) must also guard against stub usage in production.

**Acceptance Criteria**:
- [ac] `getMfaClient()` in `services.ts` returns real Supabase MFA client when `NEXT_PUBLIC_SUPABASE_URL` is set
- [ac] `getMfaClient()` returns stub client only when `NODE_ENV !== 'production'`
- [ac] Startup guard: if `NODE_ENV=production` and `NEXT_PUBLIC_SUPABASE_URL` is not set, `getMfaClient()` throws `Error('MFA client requires NEXT_PUBLIC_SUPABASE_URL in production')`
- [ac] MFA API routes (`/api/auth/mfa/enroll`, `/verify`, `/challenge`) reject requests with 503 when MFA client is stub in production
- [ac] Unit test: `getMfaClient()` returns `SupabaseMfaClient` when env vars are set
- [ac] Unit test: `getMfaClient()` returns stub when `NODE_ENV=test`
- [ac] Unit test: `getMfaClient()` throws in production without Supabase URL
- [ac] Unit test: MFA routes return 503 with `{ errorCode: 'mfa_unavailable' }` when stub is detected in production

**Files**:
- Modify: `apps/web/src/lib/services.ts` (update `getMfaClient` lazy getter)
- Modify: `apps/web/src/app/api/auth/mfa/enroll/route.ts` (add production stub guard)
- Modify: `apps/web/src/app/api/auth/mfa/verify/route.ts` (add production stub guard)
- Modify: `apps/web/src/app/api/auth/mfa/challenge/route.ts` (add production stub guard)
- Create: `apps/web/tests/s15-pr-02-mfa-stub-removal.test.ts`

**Dependencies**: PR-01 (real Supabase MFA client must exist)

**TDD Micro-Tasks**:
1. Red: `getMfaClient()` throws when `NODE_ENV=production` and `NEXT_PUBLIC_SUPABASE_URL` is undefined
2. Green: add guard in `getMfaClient` lazy getter — `if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SUPABASE_URL) throw`
3. Red: `getMfaClient()` returns `SupabaseMfaClient` (not stub) when both env vars are set
4. Green: import and call `createSupabaseMfaClient` when `NEXT_PUBLIC_SUPABASE_URL` is present
5. Red: `getMfaClient()` returns `createMfaStubClient()` when `NODE_ENV=test`
6. Green: allow stub fallback only when `NODE_ENV !== 'production'`
7. Red: `POST /api/auth/mfa/enroll` returns 503 when stub client is detected in production
8. Green: add guard at top of route handler — check if MFA client is stub instance, return 503 with `mfa_unavailable`
9. Red: `POST /api/auth/mfa/verify` returns 503 when stub client is detected in production
10. Green: same guard pattern applied to verify route
11. Red: `POST /api/auth/mfa/challenge` returns 503 when stub client is detected in production
12. Green: same guard pattern applied to challenge route

---

### Phase 2: Database & Connectivity Infrastructure (Days 2-5)

#### PR-03: HA Database Cluster Provisioning + Real Failover Exercise (5 SP)

**Description**: Provision a Railway Managed PostgreSQL cluster with Patroni HA (standby node). Execute the failover test script (`scripts/failover-test.sh`) in real mode (not dry-run), measure Recovery Time Objective (RTO) against the <30 second target, and verify the application reconnects automatically via the `reconnect()` function in `db.ts`. The failover evidence — timestamps, RTO measurement, reconnection logs — is documented in the operator runbook. This task also configures `DATABASE_URL_HA` as the primary connection string and validates that `isHaMode()` returns true in the deployment.

**Acceptance Criteria**:
- [ac] Railway PostgreSQL cluster provisioned with primary + standby node (Patroni HA)
- [ac] `DATABASE_URL_HA` set to the cluster's connection string (connection pooler endpoint)
- [ac] `isHaMode()` returns `true` when `DATABASE_URL_HA` is set
- [ac] Failover test executed: primary node manually failed, standby promoted
- [ac] RTO measured: time from primary failure to first successful query on new primary (target <30 seconds)
- [ac] Application reconnects automatically: `reconnect()` called, new `getDb()` returns working client
- [ac] Failover evidence documented in operator runbook: timestamps, RTO, reconnection logs, cluster config
- [ac] Rollback procedure documented: how to revert to single-node if cluster issues arise
- [ac] Monitoring: `getPoolStats()` returns accurate domain pool info after reconnect
- [ac] Integration test: `resolveConnectionString()` prefers `DATABASE_URL_HA` over `DATABASE_URL`
- [ac] Integration test: `reconnect()` drops cached client and creates a new connection
- [ac] Integration test: `getDbForDomain('crypto')` works after reconnect with new connection string

**Files**:
- Create: `scripts/failover-test.sh` (real-mode failover execution script)
- Modify: `docs/05-guidelines/operator-runbook.md` (add HA failover evidence section)
- Create: `apps/web/tests/s15-pr-03-ha-database.test.ts`

**Dependencies**: None (infrastructure provisioning is independent)

**TDD Micro-Tasks**:
1. Red: `resolveConnectionString()` returns `{ ha: true }` when `DATABASE_URL_HA` is set
2. Green: verify existing logic in `db.ts` — `DATABASE_URL_HA` takes precedence
3. Red: `resolveConnectionString()` returns `{ ha: false }` when only `DATABASE_URL` is set
4. Green: verify fallback path
5. Red: `resolveConnectionString()` throws when neither env var is set
6. Green: verify error message `DATABASE_URL not set`
7. Red: `reconnect()` returns a fresh database instance (not the cached one)
8. Green: call `reconnect()`, verify `getDb()` returns new instance (different reference)
9. Red: `isHaMode()` returns `true` after `getDb()` is called with `DATABASE_URL_HA`
10. Green: verify `_isHaMode` flag is set during initialization
11. Red: `getDbForDomain('crypto')` works after `reconnect()` (domain instances re-resolve connection string)
12. Green: verify domain pool re-creation uses new connection string after reconnect
13. Validate: execute `scripts/failover-test.sh` against real cluster, capture RTO measurement
14. Validate: document failover evidence with timestamps in operator runbook

---

#### PR-04: Real Pool Config Enforcement at pg Driver Level (2 SP)

**Description**: Verify that `createDatabase(url, poolOptions)` correctly passes `max` and `idleTimeoutMs` to the underlying pg driver. The current implementation in `packages/database/src/client.ts` maps `poolOptions` to `{ connection: { max, idleTimeoutMillis } }` in the Drizzle config. This task adds integration tests confirming the pool configuration is honored under concurrent load, verifies per-domain pool isolation (`crypto: max 10`, `hr: max 10`, `platform: max 20`), and ensures connection exhaustion produces the expected error (not a silent hang).

**Acceptance Criteria**:
- [ac] `createDatabase(url, { max: 5 })` creates a pool limited to 5 connections (verified by inspection or driver diagnostics)
- [ac] Per-domain pool isolation verified: `getDbForDomain('crypto')` uses `max: 10`, `getDbForDomain('hr')` uses `max: 10`, default uses `max: 20`
- [ac] Connection exhaustion test: with `max: 2`, third concurrent query either queues or throws (does not hang indefinitely)
- [ac] `idleTimeoutMs` is passed through: idle connections are released after configured timeout
- [ac] Pool stats endpoint: `getPoolStats()` returns correct `max` values per domain
- [ac] Integration test: concurrent queries across domains use independent pools (one domain's pool exhaustion does not block another)
- [ac] `PoolOptions` type exported from `@aptivo/database` with `max` and `idleTimeoutMs` fields

**Files**:
- Modify: `packages/database/src/client.ts` (add pool diagnostic method if needed)
- Create: `apps/web/tests/s15-pr-04-pool-config.test.ts`

**Dependencies**: PR-03 (real database cluster must be available for integration tests)

**TDD Micro-Tasks**:
1. Red: `createDatabase(url, { max: 5 })` passes `max: 5` to the Drizzle connection config
2. Green: verify `client.ts` maps `poolOptions.max` to `connection.max`
3. Red: `createDatabase(url, { idleTimeoutMs: 10_000 })` passes `idleTimeoutMillis: 10000`
4. Green: verify `client.ts` maps `poolOptions.idleTimeoutMs` to `connection.idleTimeoutMillis`
5. Red: `getDbForDomain('crypto')` creates a pool with `max: 10` (from `DEFAULT_POOL_CONFIG`)
6. Green: verify `getDbForDomain` passes domain config to `createDatabase`
7. Red: `getDbForDomain('hr')` creates a separate pool instance (different from crypto)
8. Green: verify domain instances are stored separately in the `domainInstances` map
9. Red: `getPoolStats()` returns `{ crypto: { max: 10 }, hr: { max: 10 }, platform: { max: 20 } }` after all domains initialized
10. Green: verify stats collection iterates `domainInstances` with correct config
11. Validate: concurrent query load test across domains confirms pool isolation under real database

---

### Phase 3: Redis & Notifications (Days 3-5)

#### PR-05: Split Redis Instances (Session/Auth vs Jobs) (3 SP)

**Description**: Configure separate Redis instances for session/auth data and background job state. The existing `buildSessionRedis()` in `services.ts` already reads `UPSTASH_REDIS_SESSION_URL` with fallback to `UPSTASH_REDIS_URL`. This task adds a `buildJobsRedis()` counterpart reading `UPSTASH_REDIS_JOBS_URL`, wires Inngest workers to use the jobs Redis, verifies token blacklist uses session Redis, and validates backward compatibility when only a single `UPSTASH_REDIS_URL` is configured.

**Acceptance Criteria**:
- [ac] `UPSTASH_REDIS_SESSION_URL` + `UPSTASH_REDIS_SESSION_TOKEN` env vars configured for session/auth Redis
- [ac] `UPSTASH_REDIS_JOBS_URL` + `UPSTASH_REDIS_JOBS_TOKEN` env vars configured for jobs/Inngest Redis
- [ac] `buildJobsRedis()` function added to `services.ts` — reads jobs-specific env vars with fallback to shared `UPSTASH_REDIS_URL`
- [ac] `getJobsRedis()` lazy getter exported from `services.ts`
- [ac] Token blacklist (`getTokenBlacklist`) uses session Redis (via `getSessionRedis`)
- [ac] Session limit service (`getSessionLimitService`) uses session Redis (via `getSessionRedis`)
- [ac] LLM rate limit store uses session Redis (existing behavior preserved)
- [ac] Backward compatibility: when only `UPSTASH_REDIS_URL` is set, both session and jobs resolve to the same instance
- [ac] Unit test: `getSessionRedis()` prefers `UPSTASH_REDIS_SESSION_URL` over `UPSTASH_REDIS_URL`
- [ac] Unit test: `getJobsRedis()` prefers `UPSTASH_REDIS_JOBS_URL` over `UPSTASH_REDIS_URL`
- [ac] Unit test: backward compatibility — single URL serves both session and jobs
- [ac] Unit test: token blacklist key prefix `bl:` only appears in session Redis, not jobs Redis
- [ac] Unit test: `getJobsRedis()` returns separate instance from `getSessionRedis()` when split URLs are set

**Files**:
- Modify: `apps/web/src/lib/services.ts` (add `buildJobsRedis`, `getJobsRedis` lazy getter)
- Create: `apps/web/tests/s15-pr-05-redis-split.test.ts`

**Dependencies**: None (can run in parallel with PR-03)

**TDD Micro-Tasks**:
1. Red: `buildJobsRedis()` returns a Redis client when `UPSTASH_REDIS_JOBS_URL` is set
2. Green: implement `buildJobsRedis` — mirror `buildSessionRedis` pattern with `UPSTASH_REDIS_JOBS_URL` / `UPSTASH_REDIS_JOBS_TOKEN`
3. Red: `buildJobsRedis()` falls back to `UPSTASH_REDIS_URL` when jobs-specific URL is not set
4. Green: add fallback chain: `UPSTASH_REDIS_JOBS_URL ?? UPSTASH_REDIS_URL`
5. Red: `buildJobsRedis()` returns null when no Redis URL is configured
6. Green: return null when both jobs and shared URLs are missing
7. Red: `getJobsRedis()` returns a different instance from `getSessionRedis()` when split URLs configured
8. Green: wire `getJobsRedis = lazy(() => buildJobsRedis())`, verify distinct references
9. Red: backward compatibility — `getSessionRedis()` and `getJobsRedis()` both resolve when only `UPSTASH_REDIS_URL` is set
10. Green: verify fallback path produces valid clients from shared URL
11. Red: token blacklist `getTokenBlacklist()` uses session Redis (not jobs Redis)
12. Green: trace `getTokenBlacklist` → `getSessionRedis()` call chain, verify no jobs Redis dependency

---

#### PR-06: SMTP Credentials + Notification Failback Activation (2 SP)

**Description**: Set real SMTP credentials (SendGrid or Mailgun) in production environment variables and validate the notification failover path. The existing `getSmtpAdapter()` in `services.ts` already reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` and creates a `nodemailer` transport. The `getNotificationAdapter()` wraps Novu + SMTP in a failover adapter controlled by `NOTIFICATION_FAILOVER_POLICY`. This task configures real credentials, tests actual email delivery, verifies the failover path (Novu unavailable -> SMTP takes over), and documents the SMTP configuration in the operator runbook.

**Acceptance Criteria**:
- [ac] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` env vars set with real SendGrid/Mailgun credentials
- [ac] `validateSmtpConfig()` returns `Result.ok` with the production SMTP config
- [ac] `getSmtpAdapter()` returns a real `NotificationAdapter` (not null)
- [ac] `getNotificationAdapter()` returns a failover adapter with Novu primary + SMTP secondary
- [ac] Email delivery verified: test notification sent via SMTP adapter reaches inbox
- [ac] Failover verified: when Novu adapter throws, SMTP adapter delivers the notification
- [ac] SPF/DKIM records validated for the sending domain (deliverability check)
- [ac] SMTP configuration documented in operator runbook: credentials rotation procedure, failover behavior, monitoring
- [ac] `smtp-fallback` feature flag set to `enabled: true` for production
- [ac] Unit test: `validateSmtpConfig()` accepts production credentials (schema validation)
- [ac] Unit test: failover adapter calls secondary when primary throws
- [ac] Integration test: SMTP adapter sends email through real transport (captured in staging mailbox)

**Files**:
- Modify: `docs/05-guidelines/operator-runbook.md` (add SMTP configuration section)
- Create: `apps/web/tests/s15-pr-06-smtp-activation.test.ts`

**Dependencies**: None (can run in parallel with PR-01)

**TDD Micro-Tasks**:
1. Red: `validateSmtpConfig({ host: 'smtp.sendgrid.net', port: 587, user: 'apikey', pass: 'SG.xxx', from: 'noreply@company.com', secure: false })` returns `Result.ok`
2. Green: verify existing Zod schema in `validateSmtpConfig` accepts valid production config
3. Red: `validateSmtpConfig({ host: '', port: 0 })` returns `Result.err` (missing required fields)
4. Green: verify validation rejects empty/zero values
5. Red: failover adapter calls SMTP when Novu throws `Error('Novu unavailable')`
6. Green: create failover adapter with mock Novu (throws) + mock SMTP, verify SMTP called
7. Red: failover adapter returns Novu result when Novu succeeds (does not call SMTP)
8. Green: verify primary-first behavior — secondary only called on primary failure
9. Validate: send test email via SMTP adapter in staging, confirm delivery
10. Validate: document SMTP configuration and credentials rotation in runbook

---

### Phase 4: Feature Flags & Rollout (Days 4-6)

#### PR-07: Feature Flag Rollout Controls for Production Launch (2 SP)

**Description**: Replace the local JSON flag provider with an environment-backed provider for production. The existing `createLocalFlagProvider(DEFAULT_FLAGS)` uses a static array; in production, flags should be overridable via `FEATURE_FLAGS` environment variable (JSON string) with sensible defaults. Risky flags (`workflow-crud`, `smtp-fallback`, `llm-streaming-filter`) default to `enabled: false` in production unless explicitly enabled. A new env-backed provider merges `DEFAULT_FLAGS` with environment overrides, allowing per-deployment configuration without code changes.

**Acceptance Criteria**:
- [ac] `createEnvFlagProvider(defaults)` factory: reads `FEATURE_FLAGS` env var (JSON array of `{ key, enabled, variant? }`), merges with defaults (env overrides win)
- [ac] `getFeatureFlagService()` in `services.ts` uses `createEnvFlagProvider` when `FEATURE_FLAGS` env var is set, falls back to `createLocalFlagProvider(DEFAULT_FLAGS)`
- [ac] Production defaults: `workflow-crud` = `false`, `smtp-fallback` = `false`, `llm-streaming-filter` = `false` (deny-by-default for risky flags)
- [ac] Non-risky flags (`multi-approver-hitl`, `llm-safety-pipeline`, `burn-rate-alerting`) default to `true`
- [ac] `getAllFlags()` returns merged flag set with source annotation (`{ key, enabled, source: 'env' | 'default' }`)
- [ac] `GET /api/admin/feature-flags` — admin endpoint listing all flags with current state and source (RBAC: `platform/admin.view`)
- [ac] Validation: `FEATURE_FLAGS` env var with malformed JSON logs warning and falls back to defaults (does not crash)
- [ac] Unit test: env override changes flag from default `false` to `true`
- [ac] Unit test: env override with unknown flag key is ignored (no pollution)
- [ac] Unit test: malformed `FEATURE_FLAGS` env var logs warning and uses defaults
- [ac] Unit test: `GET /api/admin/feature-flags` returns all flags with source annotation

**Files**:
- Create: `apps/web/src/lib/feature-flags/env-provider.ts`
- Modify: `apps/web/src/lib/services.ts` (swap flag provider in production)
- Create: `apps/web/src/app/api/admin/feature-flags/route.ts`
- Create: `apps/web/tests/s15-pr-07-feature-flags.test.ts`

**Dependencies**: None (independent of infrastructure tasks)

**TDD Micro-Tasks**:
1. Red: `createEnvFlagProvider(DEFAULT_FLAGS)` returns all default flags when `FEATURE_FLAGS` env var is not set
2. Green: implement `createEnvFlagProvider` — parse env, merge with defaults, expose `FeatureFlagProvider` interface
3. Red: `createEnvFlagProvider(defaults)` overrides `smtp-fallback` to `true` when `FEATURE_FLAGS='[{"key":"smtp-fallback","enabled":true}]'`
4. Green: merge env flags into defaults map (env wins on key collision)
5. Red: `createEnvFlagProvider(defaults)` ignores unknown flag key `unknown-flag` in env
6. Green: filter env flags to only keys present in defaults
7. Red: `createEnvFlagProvider(defaults)` falls back to defaults when `FEATURE_FLAGS='invalid json'`
8. Green: wrap `JSON.parse` in try/catch, log warning, return defaults
9. Red: `getAllFlags()` returns flags with `source: 'env'` for overridden flags and `source: 'default'` for untouched flags
10. Green: annotate each flag with source based on whether it was present in env override
11. Red: `GET /api/admin/feature-flags` returns JSON array with all flags, enabled states, and sources
12. Green: wire route handler with `getFeatureFlagService().getAllFlags()`, format response

---

### Phase 5: Validation & Drills (Days 6-9)

#### PR-08: Production E2E Validation Against Staging Topology (2 SP)

**Description**: Run the Sprint 14 E2E validation suite (INT2-01) against staging infrastructure with real services: real Supabase (SSO + MFA), real HA PostgreSQL, split Redis, real SMTP. This is not a new test suite — it validates that the existing golden path (SSO login -> MFA step-up -> multi-approver request -> quorum approval -> LLM call with safety -> workflow execution) works against real infrastructure. Failures are documented as release blockers. The results are captured as release gate evidence.

**Acceptance Criteria**:
- [ac] Staging environment configured with: real Supabase, HA PostgreSQL cluster, split Redis, SMTP credentials
- [ac] Golden path verified: SSO login -> MFA step-up -> create multi-approver request -> quorum approval -> LLM call -> workflow execution
- [ac] SSO path: real OIDC callback from Supabase produces authenticated session with mapped roles
- [ac] MFA path: real Supabase MFA challenge/verify (not stub) enforces `aal2`
- [ac] Database path: queries execute against HA cluster (not local dev DB)
- [ac] Redis path: token blacklist writes to session Redis, session limits enforced, LLM rate limits use session Redis
- [ac] SMTP path: notification sent via SMTP when triggered by workflow (delivery verified in staging mailbox)
- [ac] Feature flags: `llm-safety-pipeline`, `multi-approver-hitl` enabled; `workflow-crud`, `smtp-fallback`, `llm-streaming-filter` configured per policy
- [ac] LLM streaming filter (LLM3-01) included in gate: streaming response with clean content passes through
- [ac] Results documented: `docs/06-sprints/sprint-15-e2e-results.md` with pass/fail per subsystem, timestamps, and blockers
- [ac] Release gate: document explicitly states GO or NO-GO with rationale
- [ac] Any failures produce actionable bug reports with reproduction steps

**Files**:
- Create: `apps/web/tests/s15-pr-08-production-e2e.test.ts`
- Create: `docs/06-sprints/sprint-15-e2e-results.md`

**Dependencies**: PR-01, PR-02, PR-03, PR-04, PR-05, PR-06, PR-07, LLM3-01

**TDD Micro-Tasks**:
1. Validate: staging environment variables are set (DATABASE_URL_HA, UPSTASH_REDIS_SESSION_URL, UPSTASH_REDIS_JOBS_URL, SMTP_HOST, NEXT_PUBLIC_SUPABASE_URL, OIDC_PROVIDERS_CONFIG)
2. Validate: `isHaMode()` returns `true` on staging
3. Validate: `getSessionRedis()` returns non-null Redis client
4. Validate: `getJobsRedis()` returns non-null Redis client (separate instance)
5. Validate: `getMfaClient()` returns real Supabase MFA client (not stub)
6. Validate: `getSmtpAdapter()` returns non-null adapter
7. Validate: SSO login produces user with expected roles
8. Validate: MFA challenge/verify works with real TOTP
9. Validate: database query executes against HA cluster
10. Validate: token blacklist write/read round-trips through session Redis
11. Validate: notification delivery via SMTP reaches staging inbox
12. Validate: LLM streaming filter passes clean content (kill-switch off)
13. Document: capture results in sprint-15-e2e-results.md with GO/NO-GO decision

---

#### PR-09: Game-Day Runbook Drills (DR, Failover, Rollback) (1 SP)

**Description**: Execute the documented disaster recovery procedures against staging with real timestamps and outcomes. This covers three drill types: database failover (promote standby, verify application reconnects), application rollback (revert to previous deployment, verify service restoration), and incident communications (send test incident notification via SMTP failover). Each drill is timed and documented with actual results. The runbook is updated with drill evidence and any corrections discovered during execution.

**Acceptance Criteria**:
- [ac] Database failover drill executed: manual standby promotion, application reconnects within 30 seconds
- [ac] Failover drill timestamps recorded: `startedAt`, `failoverDetectedAt`, `reconnectedAt`, `rtoSeconds`
- [ac] Application rollback drill executed: deploy previous version, verify service health within 2 minutes
- [ac] Rollback drill timestamps recorded: `startedAt`, `rollbackCompletedAt`, `healthCheckPassedAt`
- [ac] Incident communication drill: send test incident notification via notification failover adapter
- [ac] All drills documented in operator runbook with actual timestamps and outcomes
- [ac] Runbook corrections: any incorrect or missing steps discovered during drills are updated in the runbook
- [ac] Drill summary added to sprint-15-e2e-results.md as appendix

**Files**:
- Modify: `docs/05-guidelines/operator-runbook.md` (add drill evidence sections)
- Modify: `docs/06-sprints/sprint-15-e2e-results.md` (add drill summary appendix)

**Dependencies**: PR-08 (production E2E must pass before drills execute)

**TDD Micro-Tasks**:
1. Validate: execute database failover drill — trigger standby promotion on DO managed cluster
2. Validate: measure RTO — time from primary failure detection to first successful query
3. Validate: verify `reconnect()` in `db.ts` produces a working database client
4. Validate: execute application rollback drill — deploy N-1 version to staging
5. Validate: measure rollback time — time from rollback trigger to health check pass
6. Validate: execute incident communication drill — send notification via failover adapter
7. Document: record all timestamps and outcomes in operator runbook
8. Review: identify any runbook corrections needed based on drill findings

---

### Phase 6: LLM Safety v2 Start (Days 4-8, parallel)

#### LLM3-01: Streaming Content Filter MVP (Chunk-Level Safety) (3 SP)

**Description**: Extend the content filter pipeline (`createContentFilter` in `@aptivo/llm-gateway`) to handle streaming response chunks. The existing `filterResponse(content, domain)` evaluates a complete response string. The streaming variant accumulates chunks in a buffer and evaluates the accumulated content at configurable intervals (every N chunks or every K characters). When the filter detects harmful content in the stream, it emits a `kill` signal that terminates the stream. The streaming filter is gated behind the `llm-streaming-filter` feature flag (default: disabled) so it can be activated gradually in production.

**Acceptance Criteria**:
- [ac] `createStreamingContentFilter(config)` factory with `{ contentFilter, evaluateEveryChars?: number, evaluateEveryChunks?: number }` deps
- [ac] Default evaluation interval: every 200 characters or every 5 chunks (whichever comes first)
- [ac] `StreamingContentFilter` interface: `processChunk(chunk: string, domain: Domain)` returns `{ action: 'pass' | 'kill', accumulatedContent: string, reason?: string }`
- [ac] `processChunk` accumulates chunks in an internal buffer; evaluates when threshold is reached
- [ac] When content filter returns `{ allowed: false }`, `processChunk` returns `{ action: 'kill', reason }` and all subsequent calls also return `kill`
- [ac] `reset()` method clears the buffer and kill state (for reuse across requests)
- [ac] `getAccumulatedContent()` returns the current buffer contents
- [ac] Kill-switch: when `llm-streaming-filter` feature flag is disabled, `processChunk` always returns `{ action: 'pass' }`
- [ac] Content filter runs the existing `filterResponse(accumulated, domain)` against the accumulated buffer (reuses all existing patterns and domain tiers)
- [ac] Unit test: clean stream — 10 chunks of safe content, all return `pass`
- [ac] Unit test: harmful content in stream — harmful pattern appears at chunk 7, evaluation at threshold returns `kill`
- [ac] Unit test: after `kill`, subsequent chunks also return `kill` (stream is terminated)
- [ac] Unit test: `reset()` clears kill state, next chunk returns `pass`
- [ac] Unit test: kill-switch disabled — harmful content in stream returns `pass` (filter bypassed)
- [ac] Unit test: evaluation interval — filter is not called on every chunk, only at threshold

**Files**:
- Create: `packages/llm-gateway/src/safety/streaming-content-filter.ts`
- Modify: `packages/llm-gateway/src/safety/index.ts` (barrel export)
- Modify: `packages/llm-gateway/src/index.ts` (re-export streaming filter)
- Create: `packages/llm-gateway/tests/safety/streaming-content-filter.test.ts`

**Dependencies**: None (uses existing `createContentFilter`, independent of infrastructure tasks)

**TDD Micro-Tasks**:
1. Red: `createStreamingContentFilter({ contentFilter })` returns an object with `processChunk`, `reset`, `getAccumulatedContent` methods
2. Green: implement factory with internal buffer state, return interface methods
3. Red: `processChunk('safe chunk', 'core')` returns `{ action: 'pass', accumulatedContent: 'safe chunk' }`
4. Green: append chunk to buffer, return pass (no evaluation yet — below threshold)
5. Red: after 5 chunks of 50 chars each (250 chars > 200 threshold), `processChunk` evaluates accumulated content
6. Green: check `buffer.length >= evaluateEveryChars || chunkCount >= evaluateEveryChunks`, call `contentFilter.filterResponse(buffer, domain)` when threshold met
7. Red: when accumulated content contains harmful pattern (`harmful_instructions` category), `processChunk` returns `{ action: 'kill', reason: '...' }`
8. Green: if `filterResponse` returns `Result.err`, set kill flag, return `{ action: 'kill', reason: error.reason }`
9. Red: after kill, subsequent `processChunk('safe content', 'core')` still returns `{ action: 'kill' }`
10. Green: check kill flag at top of `processChunk`, return kill immediately if set
11. Red: `reset()` clears kill flag and buffer, next `processChunk` returns `pass`
12. Green: implement `reset` — clear buffer string, reset chunk counter, clear kill flag
13. Red: when feature flag `llm-streaming-filter` is disabled, `processChunk` with harmful content returns `pass`
14. Green: accept optional `isEnabled` callback in config, skip evaluation when disabled
15. Red: evaluation only triggers at threshold, not on every chunk (mock content filter, verify call count)
16. Green: verify `contentFilter.filterResponse` is called only when threshold is met, not on every `processChunk`

---

## 2. Dependency Graph

```
Phase 1 (Days 1-3) — Auth & Identity:
  PR-01 (SSO/MFA Config, 4SP) ─── no deps ──────────────────┐
  PR-02 (Remove Stub, 2SP) ← PR-01                           │
                                                               │
Phase 2 (Days 2-5) — Database & Connectivity:                 │
  PR-03 (HA Database, 5SP) ─── no deps ─────────────────────┤
  PR-04 (Pool Config, 2SP) ← PR-03                           │
                                                               │
Phase 3 (Days 3-5) — Redis & Notifications:                   │
  PR-05 (Redis Split, 3SP) ─── no deps ─────────────────────┤
  PR-06 (SMTP, 2SP) ─── no deps ────────────────────────────┤
                                                               │
Phase 4 (Days 4-6) — Feature Flags:                           │
  PR-07 (Feature Flags, 2SP) ─── no deps ───────────────────┤
                                                               │
Phase 5 (Days 6-9) — Validation & Drills:                     │
  PR-08 (E2E, 2SP) ← PR-01..PR-07, LLM3-01                  │
  PR-09 (Drills, 1SP) ← PR-08                                ▼

Phase 6 (Days 4-8) — LLM Safety (parallel):
  LLM3-01 (Streaming Filter, 3SP) ─── no deps (included in PR-08 gate)
```

**Critical path**: PR-01 -> PR-02 -> PR-08 -> PR-09

**Parallel tracks**:
- Track A (Senior): PR-01 (4SP) -> PR-03 (5SP) -> PR-08 (2SP) -> PR-09 (1SP)
- Track B (Web Dev 1): PR-02 (2SP) -> PR-06 (2SP) -> PR-07 (2SP) -> PR-09 (1SP)
- Track C (Web Dev 2): PR-04 (2SP) -> PR-05 (3SP) -> LLM3-01 (3SP) -> PR-09 (1SP)

Note: PR-02 depends on PR-01 but can start once the `createSupabaseMfaClient` from PR-01 is committed (not full PR-01 completion). PR-04 depends on PR-03 for the real database cluster. PR-08 is the convergence point requiring all tracks complete.

---

## 3. Architectural Decisions

### Q1: Production MFA — Hard Fail, Not Graceful Degradation

**Decision**: In production, `getMfaClient()` throws if `NEXT_PUBLIC_SUPABASE_URL` is not set. This is a deliberate hard fail, not graceful degradation. The stub MFA client always returns `aal2` on verify, which makes MFA enforcement cosmetic — any TOTP code is accepted. In a production environment, cosmetic MFA is worse than no MFA because it creates a false sense of security. The hard fail ensures the deployment process catches missing configuration before users are exposed to a broken security model. Dev and test environments continue to use the stub for convenience.

### Q2: Redis Split — Backward Compatible, Not Breaking

**Decision**: The Redis split uses a fallback chain: `UPSTASH_REDIS_SESSION_URL` -> `UPSTASH_REDIS_URL` for session, `UPSTASH_REDIS_JOBS_URL` -> `UPSTASH_REDIS_URL` for jobs. A deployment with only `UPSTASH_REDIS_URL` continues to work (both session and jobs use the same instance). This is intentional: the split can be adopted incrementally without a coordinated deployment of all env vars at once. The shared URL path is also the correct configuration for development and staging environments where Redis isolation is not needed.

### Q3: Feature Flag Provider — Env Override with Defaults, Not Remote Service

**Decision**: The production feature flag provider reads a `FEATURE_FLAGS` JSON string from environment variables rather than connecting to a remote service (LaunchDarkly, Unleash). This keeps the deployment simple — flag changes are env var updates, which can be done via the deployment platform without additional infrastructure. The env provider merges overrides on top of `DEFAULT_FLAGS`, so only changed flags need to be specified in the env var. A remote provider is a Phase 4 consideration when flag complexity warrants it (percentage rollouts, user targeting, A/B testing).

### Q4: Production E2E — Validation of Existing Tests, Not New Suite

**Decision**: PR-08 runs the existing Sprint 14 E2E patterns against real infrastructure rather than creating a new test suite. The difference is the execution environment (real Supabase, HA database, Redis, SMTP) not the test logic. This avoids duplicating test code while validating that the in-memory assumptions from Phase 2 testing hold true with real services. New tests are only written for infrastructure-specific behaviors (e.g., HA failover reconnection) that cannot be validated with in-memory stores.

### Q5: Streaming Content Filter — Accumulated Buffer, Not Per-Chunk

**Decision**: The streaming content filter accumulates chunks in a buffer and evaluates the accumulated content at intervals (every 200 chars or 5 chunks). Evaluating individual chunks would miss patterns that span chunk boundaries (e.g., a harmful instruction split across two chunks). The accumulated approach ensures the same pattern matching used by `filterResponse` works correctly for streaming responses. The tradeoff is latency — harmful content is not detected until the evaluation threshold is reached. The default threshold (200 chars) balances detection latency against computational cost.

### Q6: Game-Day Drills — Execute Then Document, Not Document Then Execute

**Decision**: PR-09 executes actual failover and rollback drills against staging infrastructure. The runbook procedures were written in Sprint 10 (DR documentation) and Sprint 14 (operator runbook updates) based on theoretical understanding. Executing the drills reveals gaps between the documented procedure and actual behavior. Drill results are captured with real timestamps and any runbook corrections are applied in the same task. This is the standard SRE practice: documentation is only validated when executed under realistic conditions.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| Supabase Pro OIDC SSO + MFA config | 4 | **Commit** | Production gate — SSO/MFA is mandatory for production |
| Remove MFA stub in production | 2 | **Commit** | Security — stub MFA is cosmetic, must be removed |
| HA database cluster + failover | 5 | **Commit** | Production gate — DR capability required |
| Pool config enforcement | 2 | **Commit** | Production gate — pool isolation prevents cascading failures |
| Split Redis instances | 3 | **Commit** | Production gate — session/job isolation |
| SMTP activation + failover | 2 | **Commit** | Production gate — notification delivery |
| Feature flag rollout controls | 2 | **Commit** | Production gate — gradual rollout capability |
| Production E2E validation | 2 | **Commit** | Release gate — validates all infrastructure wiring |
| Game-day runbook drills | 1 | **Commit** | Operational readiness — validates DR procedures |
| Streaming content filter MVP | 3 | **Commit** | Epic 2 start — foundation for LLM safety v2 |
| ML injection classifier | 5 | **Defer -> Sprint 16** | Needs model hosting infrastructure + eval harness |
| Active anomaly blocking | 2 | **Defer -> Sprint 16** | Needs anomaly detector integrated with access control |
| Full visual workflow builder | 8 | **Defer -> Sprint 16** | Epic 3 — not production-blocking |
| WebSocket implementation | 5 | **Defer -> Sprint 16** | Epic 3 — not production-blocking |

**Committed**: 26 SP | **Deferred**: ~20 SP to Sprint 16

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | PR-01 (4), PR-03 (5), PR-08 (2) | 11 |
| **Web Dev 1** | PR-02 (2), PR-06 (2), PR-07 (2) | 6 |
| **Web Dev 2** | PR-04 (2), PR-05 (3), LLM3-01 (3) | 8 |
| **All** | PR-09 (1) | 1 |
| **Total** | | **26 SP** |

Senior carries the highest SP (11) because PR-01 and PR-03 are the most complex tasks: PR-01 requires real IdP configuration and MFA policy activation with Supabase, and PR-03 involves HA database cluster provisioning and real failover exercise. PR-08 requires deep knowledge of all subsystems to validate the full golden path against real infrastructure. Web Dev 1 handles the security hardening and operational controls: PR-02 is a focused services.ts change, PR-06 validates SMTP with real credentials, and PR-07 builds the env-backed flag provider. Web Dev 2 handles the database/connectivity track (PR-04 pool testing, PR-05 Redis split) and the independent LLM safety work (LLM3-01). PR-09 is a team activity — all developers participate in the game-day drills.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Supabase Pro plan activation delay (vendor SLA) | Medium | High | Start procurement Day 0; parallel work on PR-02/PR-07 not gated by Supabase |
| HA database failover takes longer than 30s RTO target | Medium | Medium | Railway PostgreSQL (Patroni HA) documented RTO is 15-30s; if >30s, document actual RTO and escalate to Railway support |
| Redis split misconfiguration (session data in jobs Redis) | Medium | High | Key prefix isolation (`bl:` for blacklist, `sess:` for sessions); integration tests verify correct Redis target |
| SMTP deliverability issues (SPF/DKIM misconfiguration) | Medium | Medium | Validate DNS records before deployment; use SendGrid domain verification wizard |
| Streaming filter false positives on legitimate chunked output | Medium | Medium | Feature flag kill-switch (default off); evaluation threshold prevents premature triggering |
| Production E2E failures requiring rollback | Medium | High | Run against staging (not production); document failures as release blockers with repro steps |
| MFA stub removal breaks dev/test workflows | Low | Medium | Guard is NODE_ENV-specific; stub preserved in test/development; CI always sets NODE_ENV=test |
| Feature flag env var size limit (some platforms cap env vars) | Low | Low | Keep FEATURE_FLAGS JSON minimal (only overrides, not full set); document size limits |

---

## 7. Definition of Done

- [ ] Real Supabase OIDC provider configured for Okta + Azure AD *(PR-01)*
- [ ] MFA policies activated: TOTP mandatory for admin roles *(PR-01)*
- [ ] Break-glass admin account procedure documented *(PR-01)*
- [ ] `getMfaClient()` returns real Supabase MFA client in production *(PR-02)*
- [ ] Startup guard throws when production env missing Supabase URL *(PR-02)*
- [ ] MFA routes return 503 when stub detected in production *(PR-02)*
- [ ] HA PostgreSQL cluster provisioned with standby *(PR-03)*
- [ ] Failover test executed with RTO <30 seconds *(PR-03)*
- [ ] Application reconnects automatically via `reconnect()` *(PR-03)*
- [ ] Pool config verified at pg driver level *(PR-04)*
- [ ] Per-domain pool isolation confirmed under concurrent load *(PR-04)*
- [ ] Split Redis instances configured: session + jobs *(PR-05)*
- [ ] Token blacklist uses session Redis; Inngest workers use jobs Redis *(PR-05)*
- [ ] Backward compatibility: single URL serves both instances *(PR-05)*
- [ ] Real SMTP credentials configured (SendGrid/Mailgun) *(PR-06)*
- [ ] Failover verified: Novu down -> SMTP delivers *(PR-06)*
- [ ] SPF/DKIM records validated for sending domain *(PR-06)*
- [ ] Env-backed feature flag provider for production *(PR-07)*
- [ ] Risky flags deny-by-default: `workflow-crud`, `smtp-fallback`, `llm-streaming-filter` *(PR-07)*
- [ ] `GET /api/admin/feature-flags` endpoint with source annotation *(PR-07)*
- [ ] Golden path E2E against staging: SSO -> MFA -> multi-approver -> LLM -> workflow *(PR-08)*
- [ ] Release gate document with GO/NO-GO decision *(PR-08)*
- [ ] Database failover drill executed with timestamps *(PR-09)*
- [ ] Application rollback drill executed with timestamps *(PR-09)*
- [ ] Incident communication drill executed *(PR-09)*
- [ ] Runbook updated with drill evidence and corrections *(PR-09)*
- [ ] `createStreamingContentFilter(config)` factory with chunk accumulation *(LLM3-01)*
- [ ] Kill signal on harmful content detection in stream *(LLM3-01)*
- [ ] Feature flag kill-switch for streaming filter *(LLM3-01)*
- [ ] `reset()` clears buffer and kill state for reuse *(LLM3-01)*
- [ ] 80%+ test coverage on new Sprint 15 code
- [ ] CI pipeline green with all tests passing

---

## 8. Doc-Gate Requirement

| Document | Section | Task |
|----------|---------|------|
| `docs/05-guidelines/operator-runbook.md` | Break-glass admin account procedure | PR-01 |
| `docs/05-guidelines/operator-runbook.md` | HA failover evidence (timestamps, RTO, reconnection logs) | PR-03 |
| `docs/05-guidelines/operator-runbook.md` | SMTP configuration and credentials rotation | PR-06 |
| `docs/05-guidelines/operator-runbook.md` | Game-day drill evidence (failover, rollback, incident comms) | PR-09 |
| `docs/06-sprints/sprint-15-e2e-results.md` | Production E2E validation results with GO/NO-GO decision | PR-08 |
| `docs/06-sprints/sprint-15-e2e-results.md` | Game-day drill summary appendix | PR-09 |

---

## 9. Sprint 16 Preview

Sprint 15 gates all production features. Sprint 16 picks up Epic 2 completion and begins Epic 3:

| Item | SP (est.) | Why it needs Sprint 15 |
|------|-----------|----------------------|
| ML injection classifier (replace rule-based with fine-tuned model) | 5 | Needs model hosting infrastructure validated in production |
| Active anomaly blocking (auto-throttle on PII bulk access) | 2 | Needs production telemetry + anomaly detector wired to access control |
| Eval harness for classifier accuracy (precision/recall benchmarks) | 3 | Needs ML classifier + production traffic patterns |
| Full visual workflow builder (drag-and-drop canvas) | 8 | Needs FEAT-07 foundation (Phase 2) + production workflow CRUD verified |
| WebSocket real-time collaboration | 5 | Needs production infrastructure stable for long-lived connections |
