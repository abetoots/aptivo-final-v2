# Phase 1.5 Implementation Plan: Production Wiring

**Theme**: "Replace every stub, enforce every guard"
**Duration**: 2 weeks (Week 17-18)
**Total Story Points**: 24 SP (9 tasks)
**Packages**: `apps/web` (composition root, RBAC, routes, workflows) + `@aptivo/database` (4 new Drizzle adapters)
**Scope**: Wire Phase 1 stubs to real adapters. No new architecture, no new packages.
**Multi-Model Review**: [PHASE_1_5_PLAN_MULTI_REVIEW.md](./PHASE_1_5_PLAN_MULTI_REVIEW.md) — Claude Opus 4.6 + Gemini 3 Flash Preview + Codex/GPT

---

## Executive Summary

Phase 1 delivered 232 SP of platform and domain logic across 10 packages and 1,359 tests. However, the composition root (`apps/web/src/lib/services.ts`) still uses dev stubs for several subsystems — HITL persistence, LLM providers, Novu notifications, and MCP tool registry. Two security mitigations (RR-1 env sanitization, RR-7 SSRF validation) exist as tested utilities but are never invoked at runtime.

Phase 1.5 replaces every stub with a real adapter using established `createDrizzle*Store(db)` patterns, wires the RBAC middleware to actual Supabase JWTs, and closes both pre-production security gaps. Three minor logic fixes from the Sprint 7 sign-off are also included.

### Multi-Model Consensus

- 9 tasks, 24 SP, 3 sequential batches
- All tasks follow established patterns — no architectural design required
- Data deletion handler explicitly excluded (requires cross-system design)
- RR-1 and RR-7 are implemented but unenforced — must be wired into runtime paths
- LLM wiring must expand to include BudgetService + UsageLogger adapters (fail-closed without them)

---

## Pre-Conditions

- All 1,359 existing tests pass (`pnpm test`)
- TypeScript compiles clean (`pnpm typecheck`)
- Phase 1 semantic commits on `main` (a9b6f43..e991ff7)

---

## 1. Task Breakdown

### Batch 1: Core Adapter Wiring (Days 1-5) — 13 SP, All Independent

---

#### P1.5-01: HITL Drizzle Persistence Adapter (3 SP)

**Description**: Replace the stub store in the composition root that returns `{ id: record.id }` without persisting anything. Create a Drizzle adapter that inserts into `hitl_requests` and supports query by status for the admin dashboard.

**Current stub** (`services.ts:160-171`):
```ts
store: {
  insert: async (record) => ({ id: record.id }),  // persists nothing
}
```

**Interfaces to implement**:
- `RequestStore` from `@aptivo/hitl-gateway` — `insert(record: HitlRequestRecord): Promise<{ id: string }>`
- `DecisionStore` from `@aptivo/hitl-gateway` — `getRequest(requestId)`, `getDecisionByRequestId(requestId)`, `insertDecisionAndUpdateRequest(decision, newStatus)`

**Acceptance Criteria**:
- [ac] `createDrizzleHitlRequestStore(db)` implements `RequestStore.insert()` — INSERT on `hitlRequests` table
- [ac] `createDrizzleHitlDecisionStore(db)` implements full `DecisionStore` — atomic decision insert + request status update
- [ac] Query methods for admin dashboard: `getRequests({ status?, limit, offset })` returning paginated results
- [ac] Composition root updated — stub replaced with real adapter
- [ac] Barrel export from `@aptivo/database/adapters`
- [ac] Tests: insert persists and returns ID, query by status filters correctly, limit/offset pagination, atomic decision+status update

**Files**:
- Create: `packages/database/src/adapters/hitl-store-drizzle.ts`
- Modify: `packages/database/src/adapters/index.ts` (export)
- Modify: `apps/web/src/lib/services.ts` (replace stub)
- Create: `packages/database/tests/p1.5-01-hitl-store.test.ts`

**Dependencies**: None

**Schemas**: `hitlRequests` (`packages/database/src/schema/hitl-requests.ts`), `hitlDecisions` (`packages/database/src/schema/hitl-decisions.ts`)

**TDD Micro-Tasks**:
1. Red: `hitlRequestStore.insert(record)` returns `{ id }` and persists to DB
2. Green: Drizzle INSERT on `hitlRequests` with all HitlRequestRecord fields
3. Red: `hitlDecisionStore.getRequest(requestId)` returns RequestSnapshot
4. Green: Drizzle SELECT with status + expiry mapping
5. Red: `hitlDecisionStore.insertDecisionAndUpdateRequest(decision, 'approved')` atomically persists
6. Green: Drizzle transaction — INSERT decision + UPDATE request status
7. Red: Admin query `getRequests({ status: 'pending', limit: 10 })` returns filtered results
8. Green: Drizzle SELECT with optional WHERE + LIMIT + OFFSET

---

#### P1.5-02: LLM Provider + Budget + Usage Wiring (5 SP)

**Description**: Wire the LLM gateway with real provider SDKs, replace the fail-closed BudgetService stub, and replace the no-op UsageLogger. Without this, the gateway blocks all LLM requests (BudgetService returns null config → fail-closed) and loses all cost data.

**Current stubs** (`services.ts:251-264`):
```ts
providers: new Map(),                              // no providers
budgetService: new BudgetService({
  getConfig: async () => null,                     // fail-closed!
  getDailySpend: async () => 0,
  getMonthlySpend: async () => 0,
}),
usageLogger: new UsageLogger({
  insert: async () => {},                          // no-op, loses data
}),
```

**Interfaces to implement**:
- `BudgetStore` from `@aptivo/llm-gateway` — `getConfig(domain)`, `getDailySpend(domain)`, `getMonthlySpend(domain)`
- `UsageStore` from `@aptivo/llm-gateway` — `insert(record: UsageRecord)`
- `LLMProvider` from `@aptivo/llm-gateway` — `complete()`, `stream()`, `estimateCost()`, `isAvailable()`

**Acceptance Criteria**:
- [ac] `createDrizzleBudgetStore(db)` queries `llmBudgetConfigs` for config, aggregates `llmUsageLogs` for daily/monthly spend
- [ac] `createDrizzleUsageLogStore(db)` inserts into `llmUsageLogs` table
- [ac] Provider initialization env-gated: `OPENAI_API_KEY` → OpenAI provider, `ANTHROPIC_API_KEY` → Anthropic provider
- [ac] `modelToProvider` mapping populated from available providers
- [ac] Composition root updated — all three stubs replaced
- [ac] Graceful fallback: missing API keys → empty providers map (existing behavior), missing budget config → no budget enforcement (not fail-closed)
- [ac] Tests: budget config lookup, daily/monthly spend aggregation, usage insert, provider initialization with/without env vars

**Files**:
- Create: `packages/database/src/adapters/llm-budget-store-drizzle.ts`
- Create: `packages/database/src/adapters/llm-usage-log-store-drizzle.ts`
- Modify: `packages/database/src/adapters/index.ts` (export)
- Modify: `apps/web/src/lib/services.ts` (replace stubs, add provider init)
- Create: `packages/database/tests/p1.5-02-llm-stores.test.ts`
- Create: `apps/web/tests/p1.5-02-llm-providers.test.ts`

**Dependencies**: None

**Schemas**: `llmBudgetConfigs` (`packages/database/src/schema/llm-budget-configs.ts`), `llmUsageLogs` (`packages/database/src/schema/llm-usage.ts`)

**TDD Micro-Tasks**:
1. Red: `budgetStore.getConfig('crypto')` returns BudgetConfig from DB
2. Green: Drizzle SELECT on `llmBudgetConfigs` WHERE domain
3. Red: `budgetStore.getDailySpend('crypto')` returns aggregated cost since start of day
4. Green: Drizzle SUM on `llmUsageLogs.costUsd` WHERE domain AND timestamp >= startOfDay
5. Red: `usageLogStore.insert(record)` persists usage record
6. Green: Drizzle INSERT on `llmUsageLogs`
7. Red: Composition root with `OPENAI_API_KEY` set → providers map has 'openai' entry
8. Green: Env-gated provider factory with SDK initialization

---

#### P1.5-03: Novu SDK Wiring (2 SP)

**Description**: Replace the no-op Novu trigger stub with real `@novu/node` SDK initialization. Env-gated: real SDK when `NOVU_API_KEY` is set, stub fallback in dev.

**Current stub** (`services.ts:137-145`):
```ts
const getNovuAdapter = lazy(() =>
  new NovuNotificationAdapter(
    { trigger: async () => ({ acknowledged: true }) },  // no-op
    { workflowId: process.env.NOVU_WORKFLOW_ID ?? 'generic-notification' },
  ),
);
```

**Acceptance Criteria**:
- [ac] `@novu/node` added to `apps/web/package.json`
- [ac] Env-gated: `NOVU_API_KEY` present → real `Novu(apiKey)` client, absent → existing stub
- [ac] `NovuNotificationAdapter` receives real client — `trigger()` calls Novu API
- [ac] Tests: verify SDK initialization with key, verify stub fallback without key

**Files**:
- Modify: `apps/web/package.json` (add `@novu/node`)
- Modify: `apps/web/src/lib/services.ts` (env-gated Novu client)
- Create: `apps/web/tests/p1.5-03-novu-wiring.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: With `NOVU_API_KEY` set, adapter calls real trigger method
2. Green: `new Novu(apiKey)` in env-gated factory
3. Red: Without `NOVU_API_KEY`, adapter uses stub trigger
4. Green: Conditional initialization with fallback

---

#### P1.5-04: MCP Registry DB Adapter (3 SP)

**Description**: Replace the hardcoded null registry and empty allowlist with a Drizzle-backed adapter that queries `mcpServers` and `mcpTools` tables.

**Current stub** (`services.ts:197-209`):
```ts
registry: {
  getServer: async () => null,   // always null
  getTool: async () => null,     // always null
},
allowlist: [],                   // no servers allowed
```

**Interface to implement**:
- `ToolRegistry` from `@aptivo/mcp-layer` — `getServer(serverId): Promise<McpServerRecord | null>`, `getTool(serverId, toolName): Promise<McpToolRecord | null>`

**Acceptance Criteria**:
- [ac] `createDrizzleMcpRegistryAdapter(db)` implements `ToolRegistry` interface
- [ac] `getServer(serverId)` queries `mcpServers` WHERE id AND isEnabled
- [ac] `getTool(serverId, toolName)` queries `mcpTools` WHERE serverId AND name AND isEnabled
- [ac] Allowlist populated from DB: query all enabled server names
- [ac] `envAllowlist` from `mcpServers` record passed to `sanitizeEnvForMcp()` (connects to P1.5-06)
- [ac] Composition root updated — null registry replaced, allowlist populated
- [ac] Tests: getServer by ID, getTool by server+name, disabled server returns null, allowlist derivation

**Files**:
- Create: `packages/database/src/adapters/mcp-registry-drizzle.ts`
- Modify: `packages/database/src/adapters/index.ts` (export)
- Modify: `apps/web/src/lib/services.ts` (replace stub)
- Create: `packages/database/tests/p1.5-04-mcp-registry.test.ts`

**Dependencies**: None

**Schemas**: `mcpServers`, `mcpTools` (`packages/database/src/schema/mcp-registry.ts`)

**TDD Micro-Tasks**:
1. Red: `registry.getServer(id)` returns McpServerRecord from DB
2. Green: Drizzle SELECT on `mcpServers` WHERE id AND isEnabled = true
3. Red: `registry.getTool(serverId, 'tool-name')` returns McpToolRecord
4. Green: Drizzle SELECT on `mcpTools` WHERE serverId AND name AND isEnabled = true
5. Red: `getAllowlist()` returns array of enabled server names
6. Green: Drizzle SELECT name FROM `mcpServers` WHERE isEnabled = true

---

### Batch 2: Auth + Security Integration (Days 6-9) — 7 SP

---

#### P1.5-05: DB-Backed RBAC Middleware (5 SP)

**Description**: Replace the header-presence RBAC stub with real Supabase JWT extraction and database-backed role→permission lookup. The current middleware accepts any request with a non-empty `x-user-role` header regardless of the actual permission being checked.

**Current stub** (`rbac-middleware.ts:21-45`):
```ts
export function checkPermission(permission: string): RbacCheckResult {
  return async (request: Request) => {
    const role = request.headers.get('x-user-role');
    if (!role || role === 'anonymous') { return 403; }
    return null;  // permission param completely ignored!
  };
}
```

**Acceptance Criteria**:
- [ac] `@supabase/ssr` added to `apps/web/package.json`
- [ac] `extractUser(request)` utility: extracts Supabase JWT from cookie, validates, returns `{ userId, email }`
- [ac] `resolvePermissions(userId, db)` queries `userRoles` → `rolePermissions` → returns `Set<string>`
- [ac] `checkPermission(permission)` checks if extracted user has the required permission in DB
- [ac] Dev mode fallback: `NODE_ENV !== 'production'` → accept `x-user-role` header (preserves test compatibility)
- [ac] Per-request permission caching (avoid repeated DB lookups within same request)
- [ac] 401 response for missing/invalid JWT, 403 for missing permission
- [ac] Tests: valid JWT + matching permission → pass, valid JWT + wrong permission → 403, expired JWT → 401, dev mode header fallback, permission caching

**Files**:
- Modify: `apps/web/package.json` (add `@supabase/ssr`)
- Create: `apps/web/src/lib/security/rbac-resolver.ts` (user extraction + permission resolution)
- Modify: `apps/web/src/lib/security/rbac-middleware.ts` (real implementation)
- Create: `apps/web/tests/p1.5-05-rbac-db.test.ts`

**Dependencies**: P1.5-01 (uses HITL store in integration test scenarios)

**Schemas**: `userRoles` (`packages/database/src/schema/user-roles.ts`), `rolePermissions` (`packages/database/src/schema/role-permissions.ts`)
**Seed data**: 34 permissions, 7 roles from S6-INF-SEED

**TDD Micro-Tasks**:
1. Red: `extractUser(request)` returns user from valid Supabase JWT cookie
2. Green: `@supabase/ssr` `createServerClient` + `getUser()`
3. Red: `resolvePermissions(userId)` returns permission set from DB
4. Green: Drizzle JOIN `userRoles` → `rolePermissions` WHERE userId, collect permission names
5. Red: `checkPermission('admin:read')(request)` with valid JWT + admin role → null (permitted)
6. Green: Wire extractUser → resolvePermissions → set.has(permission)
7. Red: Same request with viewer role → 403
8. Green: Permission not in set → 403 Response
9. Red: Dev mode with `x-user-role` header → null (permitted, backward compatible)
10. Green: `NODE_ENV` check with header fallback

---

#### P1.5-06: Security Runtime Integration (2 SP)

**Description**: Wire the two existing security utilities into actual runtime code paths. Both `sanitizeEnvForMcp()` and `validateWebhookUrl()` are tested in isolation but never called during execution — making RR-1 and RR-7 "implemented but unenforced."

**Current state**:
- `sanitizeEnvForMcp()` — exported from `@aptivo/mcp-layer`, 7 test cases pass, zero runtime call sites
- `validateWebhookUrl()` — exported from `apps/web/src/lib/security`, 14 test cases pass, zero runtime call sites

**Acceptance Criteria**:
- [ac] **RR-1**: `sanitizeEnvForMcp()` called in `createAgentKitTransportAdapter()` when spawning MCP child process. Uses `envAllowlist` from the MCP server record (from P1.5-04 registry adapter).
- [ac] **RR-7**: `validateWebhookUrl()` called before any outbound HTTP request to user-supplied URLs in notification dispatch and webhook sending paths. Returns `Result.err(SsrfError)` on blocked URLs.
- [ac] Tests: MCP spawn receives sanitized env (no secrets), webhook to private IP rejected at runtime
- [ac] `docs/03-architecture/platform-core-add.md` §14.9 updated — RR-1 and RR-7 marked as **resolved** (runtime-enforced)

**Files**:
- Modify: `packages/mcp-layer/src/transport/agentkit-adapter.ts` (call sanitizeEnvForMcp)
- Modify: `apps/web/src/lib/workflows/` or notification dispatch path (call validateWebhookUrl)
- Create: `apps/web/tests/p1.5-06-security-integration.test.ts`
- Modify: `docs/03-architecture/platform-core-add.md` (update RR-1, RR-7 status)

**Dependencies**: P1.5-04 (MCP registry provides `envAllowlist` for sanitizer)

**TDD Micro-Tasks**:
1. Red: AgentKit adapter spawns with sanitized env — `DATABASE_URL` absent from child env
2. Green: Call `sanitizeEnvForMcp(process.env, server.envAllowlist)` in adapter
3. Red: Webhook to `http://169.254.169.254/` returns SsrfError
4. Green: Call `validateWebhookUrl(url)` before outbound fetch, propagate error

---

### Batch 3: Quick Fixes (Days 9-10) — 4 SP, All Independent

---

#### P1.5-07: Interview Slot Validation (2 SP)

**Description**: The interview scheduling workflow accepts any slot value from the candidate without verifying it was in the proposed set. A candidate could submit an arbitrary datetime.

**Current state** (`hr-interview-scheduling.ts:137`):
```ts
const selectedSlot = (selection.data as { selectedSlot: string }).selectedSlot;
// immediately used to create calendar event — no validation
```

**Acceptance Criteria**:
- [ac] After `waitForEvent`, validate `selectedSlot` is in `proposedSlots` array
- [ac] Invalid slot → return error result with `{ status: 'error', reason: 'Invalid slot selection' }`
- [ac] Do not create calendar event for invalid slot
- [ac] Tests: valid slot proceeds to calendar event, invalid slot returns error, empty slot rejected

**Files**:
- Modify: `apps/web/src/lib/workflows/hr-interview-scheduling.ts` (add validation after line 137)
- Modify: `apps/web/tests/s7-hr-01-interview-scheduling.test.ts` (add invalid slot test)

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: Workflow returns error when selectedSlot not in proposedSlots
2. Green: `if (!proposedSlots.includes(selectedSlot))` guard before calendar step
3. Red: Workflow proceeds when selectedSlot is in proposedSlots
4. Green: Existing happy path still passes

---

#### P1.5-08: Negative Day Guard (1 SP)

**Description**: The LLM usage API route parses the `range` query parameter but doesn't clamp negative values, allowing queries for negative time ranges.

**Current state** (`apps/web/src/app/api/admin/llm-usage/route.ts:22`):
```ts
const days = parseInt(range, 10) || 30;  // -5 passes through
```

**Acceptance Criteria**:
- [ac] Clamp to positive: `Math.max(1, parseInt(range, 10) || 30)`
- [ac] Cap maximum: `Math.min(365, ...)` to prevent unbounded queries
- [ac] Tests: negative range → 1, zero → 30, valid range passes, > 365 → 365

**Files**:
- Modify: `apps/web/src/app/api/admin/llm-usage/route.ts` (clamp line 22)
- Modify: `apps/web/tests/s7-int-03-llm-usage-dashboard.test.ts` (add edge case tests)

**Dependencies**: None

---

#### P1.5-09: Financial Aggregation Boundary Fix (1 SP)

**Description**: Time-range queries in LLM usage and metric stores use `gt()` (strictly greater than) instead of `gte()` (greater than or equal), excluding records that land exactly on the boundary timestamp.

**Current state**: 7 instances of `gt(timestamp, cutoff)` in `llm-usage-store.ts`, 5 instances in `metric-queries.ts`.

**Acceptance Criteria**:
- [ac] All `gt()` calls on time-range boundaries replaced with `gte()` in both files
- [ac] Import updated: `import { gte } from 'drizzle-orm'` (replacing or supplementing `gt`)
- [ac] Tests: record at exact boundary timestamp included in results

**Files**:
- Modify: `packages/database/src/adapters/llm-usage-store.ts` (7 replacements: lines 61, 80, 99, 117, 130, 144, 158)
- Modify: `packages/database/src/adapters/metric-queries.ts` (5 replacements: lines 47, 61, 85, 99, 110)
- Modify: `packages/database/tests/s7-int-03-llm-usage-store.test.ts` (add boundary test)
- Modify: `packages/database/tests/s7-cf-01-metric-queries.test.ts` (add boundary test)

**Dependencies**: None

---

## 2. Explicitly NOT in Phase 1.5

| Item | Location | Reason | Disposition |
|------|----------|--------|-------------|
| Data Deletion real wiring | `services.ts:239-245` | Cross-system deletion semantics + compliance policy | Design phase |
| MCP allowlist strategy | `services.ts:209` | Config vs DB precedence is a Phase 2 concern | Design phase |
| LLM injection detection | ADD §14.5.1 | Needs classifier model architecture | Design phase |
| Enterprise auth (OIDC/SAML) | ADD §8.1, §8.5 | New architecture (Supabase Pro tier) | Design phase |
| Audit query & export API | FR-CORE-AUD-002 | New feature, not wiring | Phase 2 |

---

## 3. Dependency Graph

```
Batch 1 (all parallel):
  P1.5-01 ─────────────────────────── (HITL store)
  P1.5-02 ─────────────────────────── (LLM providers)
  P1.5-03 ─────────────────────────── (Novu SDK)
  P1.5-04 ─────────────────────────── (MCP registry)
        │                       │
        └───────────┬───────────┘
                    ▼
Batch 2 (sequential after Batch 1):
  P1.5-05 ─────────────────────────── (RBAC, needs P1.5-01 for integration test)
  P1.5-06 ─────────────────────────── (Security integration, needs P1.5-04 for envAllowlist)

Batch 3 (independent, can overlap Batch 2):
  P1.5-07 ─────────────────────────── (Slot validation)
  P1.5-08 ─────────────────────────── (Day guard)
  P1.5-09 ─────────────────────────── (gte boundary fix)
```

---

## 4. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Supabase JWT extraction more complex than expected | RBAC task overruns by 1-2 SP | Medium | Dev-mode header fallback preserved; partial impl still shippable |
| LLM provider SDK breaking changes since SP-08 | Provider init fails | Low | Pin SDK versions from spike; fallback to empty map |
| Budget null config fail-closed behavior | All LLM requests blocked until budget configs seeded | Medium | Change fail-closed to fail-open when no config exists (explicit AC) |
| MCP registry empty in dev environments | MCP wrapper rejects all calls | Low | In-memory fallback when no DB servers registered |
| Missing DB migrations in target env | All Drizzle adapters fail | Medium | Add migration verification to health probe (`/health/ready`) |

---

## 5. Verification Plan

| Gate | Command | Passes When |
|------|---------|-------------|
| Batch 1 | `pnpm -F @aptivo/database test` | 4 new adapter test files pass |
| Batch 1 | `pnpm -F @aptivo/web typecheck` | Composition root compiles with real adapters |
| Batch 2 | `pnpm -F @aptivo/web test` | RBAC + security integration tests pass |
| Batch 3 | `pnpm -F @aptivo/web test` | Workflow + route edge case tests pass |
| Final | `pnpm test` | All 1,359+ existing tests still pass + new Phase 1.5 tests |
| Final | `pnpm typecheck` | Full monorepo typecheck clean |

---

## 6. Definition of Done

- [dod] All composition root stubs replaced with real adapters (except data deletion)
- [dod] HITL requests persist to database
- [dod] LLM gateway accepts requests with real provider SDKs (when API keys present)
- [dod] Budget enforcement uses real DB config (not fail-closed stub)
- [dod] Novu notifications dispatch to real Novu API (when API key present)
- [dod] MCP tool registry reads from database
- [dod] RBAC middleware extracts Supabase JWT and checks DB permissions
- [dod] `sanitizeEnvForMcp()` called on every MCP child process spawn
- [dod] `validateWebhookUrl()` called before every outbound webhook/notification
- [dod] ADD §14.9 RR-1 and RR-7 marked resolved (runtime-enforced)
- [dod] Interview slot validated against proposed set
- [dod] LLM usage range clamped to positive values
- [dod] Time-range aggregations use `gte()` for boundary inclusion
- [dod] All existing 1,359 tests still pass
- [dod] Multi-model implementation review conducted

---

## 7. Story Point Summary

| Task | Title | SP | Batch |
|------|-------|----|-------|
| P1.5-01 | HITL Drizzle persistence adapter | 3 | 1 |
| P1.5-02 | LLM provider + budget + usage wiring | 5 | 1 |
| P1.5-03 | Novu SDK wiring | 2 | 1 |
| P1.5-04 | MCP registry DB adapter | 3 | 1 |
| P1.5-05 | DB-backed RBAC middleware | 5 | 2 |
| P1.5-06 | Security runtime integration (RR-1 + RR-7) | 2 | 2 |
| P1.5-07 | Interview slot validation | 2 | 3 |
| P1.5-08 | Negative day guard | 1 | 3 |
| P1.5-09 | Financial aggregation boundary fix | 1 | 3 |
| **Total** | | **24** | |
