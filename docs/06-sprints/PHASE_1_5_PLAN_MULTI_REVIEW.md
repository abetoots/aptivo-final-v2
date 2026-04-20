# Phase 1.5 Sprint Plan — Multi-Model Review

**Date**: 2026-03-11
**Reviewers**: Claude Opus 4.6 (lead), Gemini 3 Flash Preview, Codex/GPT
**Scope**: Phase 1.5 sprint planning — wire stubs for production readiness
**Verdict**: Scope expansion recommended (6 items -> 9 tasks)

---

## Executive Summary

Phase 1 is complete with 232 SP and 1,359 tests across 10 packages. Phase 1.5 is a focused "wire the stubs" sprint — no new architecture, just replacing dev stubs in the composition root (`apps/web/src/lib/services.ts`) with real adapters using established patterns.

The original 6-item scope from the Sprint 7 sign-off is a good start but **incomplete for production readiness**. All three models identified additional stubs that must be wired. The 2 residual risk items (RR-1, RR-7) are already implemented but **not invoked at runtime** — they need integration verification.

**Recommended total: 9 tasks, ~24 SP, single sprint.**

---

## Consensus Findings (All 3 Models Agree)

### 1. Original 6 Items Are Valid and Well-Scoped

All three models confirm the Sprint 7 sign-off recommendations are legitimate wiring tasks that follow existing patterns. No architectural design needed.

### 2. Additional Stubs Must Be Wired

All three models independently identified the same missing stubs in `services.ts`:

| Stub | Location | Current State |
|------|----------|---------------|
| **Novu client** | `services.ts:137-145` | `trigger: async () => ({ acknowledged: true })` — no-op |
| **MCP registry** | `services.ts:197-201` | `getServer: async () => null, getTool: async () => null` |
| **LLM BudgetService** | `services.ts:254-258` | `getConfig: async () => null` — **fail-closed**, blocks all LLM requests |
| **LLM UsageLogger** | `services.ts:259-261` | `insert: async () => {}` — no-op, loses all cost data |
| **Data Deletion** | `services.ts:239-245` | All handlers return `{ deletedCount: 0 }` / `{ maskedCount: 0 }` |

### 3. RR-1 and RR-7: Implemented but Not Runtime-Enforced

**Critical finding** (Codex, confirmed by Claude): Both security mitigations exist as tested utilities but have **zero runtime call sites**:

- `sanitizeEnvForMcp()` — exported from `@aptivo/mcp-layer`, tested in `sp-06-mcp-security.test.ts`, but never called in `agentkit-adapter.ts` or any MCP spawn path
- `validateWebhookUrl()` — exported from `apps/web/src/lib/security`, tested in `int-06-security.test.ts`, but never called in notification dispatch or webhook sending paths

**Verdict**: These count as **unenforced mitigations**. Phase 1.5 must wire them into runtime paths to close the residual risks.

### 4. Data Deletion Should NOT Be in Phase 1.5

All three models agree: real data deletion requires cross-system semantics and compliance policy decisions. This is architectural design work, not wiring.

---

## Debated Items

### D1: LLM Provider Wiring Scope (Codex: 8 SP / Gemini: 5 SP / Claude: 5 SP)

**Codex's position**: Item #2 (LLM providers) must expand to include BudgetService DB adapter and UsageLogger DB adapter, since the current stubs fail-close (blocking all LLM requests) and lose all cost data. Total: 8 SP.

**Claude's analysis**: Codex is right that Budget and Usage stubs must be wired alongside providers — an LLM gateway with real providers but a fail-closed budget service is unusable. However, the Drizzle adapter pattern is well-established and the `llmUsageLogs` and `llmBudgetConfigs` schemas already exist. This is pattern replication, not new design. The 3 sub-items (providers + budget adapter + usage adapter) can share a single task.

**Verdict**: **5 SP** — expand scope to include budget + usage adapters, but the established `createDrizzle*` pattern keeps effort manageable. The provider SDK initialization is env-gated and well-documented.

### D2: RBAC Scope (Codex: 8 SP / Gemini: 5 SP / Claude: 5 SP)

**Codex's position**: No Supabase JWT extraction path exists in the web layer. The auth contract needs design. 8 SP.

**Gemini's position**: Schema exists, pattern is clear, Supabase JWT is standard. 5 SP.

**Claude's analysis**: The RBAC schema (`userRoles`, `rolePermissions`) and seed data (34 permissions, 7 roles from S6-INF-SEED) already exist. Supabase JWT extraction in Next.js is a well-documented pattern (`@supabase/ssr` + `createServerClient`). The `checkPermission()` function signature doesn't need to change — only its internals. This is integration, not design.

**Verdict**: **5 SP**. If Supabase auth integration proves more complex than expected, it can absorb 1-2 SP from the quick-fix items.

### D3: MCP Registry Wiring (Gemini: include / Codex: include with caveat / Claude: include)

**Codex's caveat**: MCP registry + allowlist needs a "source-of-truth strategy" (DB-only vs config+DB precedence). This could be architectural.

**Claude's analysis**: The `mcpServers` and `mcpTools` schema tables already exist (from Sprint 3). The registry interface is simple (`getServer`, `getTool`). The allowlist can be populated from DB query results — no policy decision needed. Config-vs-DB precedence is a Phase 2 concern when runtime tool registration is built.

**Verdict**: **Include at 3 SP**. Create `createDrizzleMcpRegistryAdapter(db)`, wire in services.ts, populate allowlist from DB.

### D4: Novu SDK Wiring (All agree: include)

**Consensus**: Replace the no-op trigger stub with real `@novu/node` SDK initialization. Env-gated pattern matches the existing S3/AgentKit approach.

**Verdict**: **2 SP**. Simple `new Novu(apiKey)` initialization with env gate.

---

## Phase 1.5 Sprint Plan

### Task Summary

| Task | Title | SP | Batch | Dependencies |
|------|-------|----|-------|-------------|
| **P1.5-01** | HITL Drizzle persistence adapter | 3 | 1 | None |
| **P1.5-02** | LLM provider + budget + usage wiring | 5 | 1 | None |
| **P1.5-03** | Novu SDK wiring | 2 | 1 | None |
| **P1.5-04** | MCP registry DB adapter | 3 | 1 | None |
| **P1.5-05** | DB-backed RBAC middleware | 5 | 2 | P1.5-01 (HITL store for integration test) |
| **P1.5-06** | Security runtime integration (RR-1 + RR-7) | 2 | 2 | P1.5-04 (MCP registry for sanitizer path) |
| **P1.5-07** | Interview slot validation | 2 | 3 | None |
| **P1.5-08** | Negative day guard | 1 | 3 | None |
| **P1.5-09** | Financial aggregation boundary fix (gte) | 1 | 3 | None |
| | **Total** | **24** | | |

---

### Batch 1: Core Adapter Wiring (13 SP) — All Independent

#### P1.5-01: HITL Drizzle Persistence Adapter (3 SP)

**Current state**: `services.ts:160-171` — stub store returns `{ id: record.id }`, persists nothing.

**Interface**: `RequestStore.insert(record: HitlRequestRecord): Promise<{ id: string }>` (from `packages/hitl-gateway/src/request/request-service.ts:24`)

**Work**:
1. Create `packages/database/src/adapters/hitl-store-drizzle.ts`
   - `createDrizzleHitlStore(db)` implementing `RequestStore`
   - INSERT on `hitlRequests` table, return `{ id }`
   - Add query methods for admin dashboard (`getHitlRequests({ status, limit })`)
2. Wire in `services.ts` — replace stub with real adapter
3. Tests: insert persists, query by status, limit enforcement
4. Update adapter barrel export

**Schema**: `hitlRequests` in `packages/database/src/schema/hitl.ts`

#### P1.5-02: LLM Provider + Budget + Usage Wiring (5 SP)

**Current state**: `services.ts:251-264` — empty providers Map, BudgetService with null config (fail-closed), UsageLogger no-op.

**Work**:
1. Create `packages/database/src/adapters/llm-budget-drizzle.ts`
   - `createDrizzleBudgetStore(db)` implementing `{ getConfig, getDailySpend, getMonthlySpend }`
   - Queries on `llmBudgetConfigs` and `llmUsageLogs` tables
2. Create `packages/database/src/adapters/llm-usage-logger-drizzle.ts`
   - `createDrizzleUsageLogStore(db)` implementing `{ insert }`
   - INSERT on `llmUsageLogs` table
3. Wire real providers in composition root (env-gated):
   ```
   if OPENAI_API_KEY → add OpenAI provider
   if ANTHROPIC_API_KEY → add Anthropic provider
   ```
4. Wire BudgetService and UsageLogger with real DB adapters
5. Tests: budget lookup, usage insert, provider initialization

**Schemas**: `llmUsageLogs`, `llmBudgetConfigs` in `packages/database/src/schema/llm.ts`

#### P1.5-03: Novu SDK Wiring (2 SP)

**Current state**: `services.ts:137-145` — stub trigger returns `{ acknowledged: true }`.

**Work**:
1. Add `@novu/node` to `apps/web/package.json`
2. Update `getNovuAdapter` — env-gated: real `Novu(apiKey)` when `NOVU_API_KEY` set, stub fallback
3. Tests: verify SDK initialization, verify stub fallback when env missing

#### P1.5-04: MCP Registry DB Adapter (3 SP)

**Current state**: `services.ts:197-201` — hardcoded `getServer: null, getTool: null`, empty allowlist.

**Work**:
1. Create `packages/database/src/adapters/mcp-registry-drizzle.ts`
   - `createDrizzleMcpRegistryAdapter(db)` implementing `{ getServer, getTool }`
   - Queries on `mcpServers` and `mcpTools` tables
2. Populate allowlist from DB query in composition root
3. Wire in `services.ts`
4. Tests: getServer by ID, getTool by name, empty results

**Schemas**: `mcpServers`, `mcpTools` in `packages/database/src/schema/mcp-registry.ts`

---

### Batch 2: Auth + Security Integration (7 SP) — Depends on Batch 1

#### P1.5-05: DB-Backed RBAC Middleware (5 SP)

**Current state**: `rbac-middleware.ts` — only checks `x-user-role` header existence, ignores `permission` parameter.

**Work**:
1. Add `@supabase/ssr` to `apps/web/package.json`
2. Create `apps/web/src/lib/security/rbac-resolver.ts`
   - Extract user from Supabase session (JWT in cookie)
   - Look up user's roles via `userRoles` table
   - Look up role permissions via `rolePermissions` table
   - Return `Set<string>` of granted permissions
3. Update `checkPermission(permission)` internals:
   - Extract user → resolve permissions → check if `permission` is in set
   - Keep header-based fallback for dev mode (`NODE_ENV !== 'production'`)
   - Cache permission set per request (avoid repeated DB lookups)
4. Tests: valid JWT + correct role → permitted, missing permission → 403, expired JWT → 401, dev mode header fallback
5. Update existing admin route tests if middleware behavior changes

**Schema**: `userRoles`, `rolePermissions` in `packages/database/src/schema/user-roles.ts`
**Seed data**: 34 permissions, 7 roles from S6-INF-SEED

#### P1.5-06: Security Runtime Integration (2 SP)

**Current state**: `sanitizeEnvForMcp()` and `validateWebhookUrl()` exist and are tested but have zero runtime call sites.

**Work**:
1. **RR-1**: Wire `sanitizeEnvForMcp()` into AgentKit transport adapter
   - Call in `createAgentKitTransportAdapter()` before passing env to child process
   - Accept `allowlist` in adapter config
2. **RR-7**: Wire `validateWebhookUrl()` into notification/webhook dispatch paths
   - Call before any outbound HTTP request to user-supplied URLs
   - Return `Result.err` with `SsrfError` on blocked URLs
3. Tests: verify sanitizer called on MCP spawn, verify SSRF check on webhook send
4. Update ADD §14.9 to mark RR-1 and RR-7 as **resolved** (runtime-enforced)

---

### Batch 3: Quick Fixes (4 SP) — Independent

#### P1.5-07: Interview Slot Validation (2 SP)

**Current state**: `hr-interview-scheduling.ts` — selected slot accepted without verification against proposed slots.

**Work**:
1. After `waitForEvent('select-slot')`, validate `selectedSlot` is in `proposedSlots` array
2. If invalid → return error result, don't create calendar event
3. Tests: valid slot proceeds, invalid slot rejected

#### P1.5-08: Negative Day Guard (1 SP)

**Current state**: `llm-usage/route.ts:22` — `parseInt(range, 10) || 30` allows negative values.

**Work**:
1. Add `Math.max(1, ...)` clamp: `const days = Math.max(1, parseInt(range, 10) || 30)`
2. Test: negative range → defaults to 1, zero → defaults to 30

#### P1.5-09: Financial Aggregation Boundary Fix (1 SP)

**Current state**: `llm-usage-store.ts` and `metric-queries.ts` use `gt()` for time boundaries, excluding exact boundary records.

**Work**:
1. Replace `gt(timestamp, cutoff)` with `gte(timestamp, cutoff)` in:
   - `packages/database/src/adapters/llm-usage-store.ts`
   - `packages/database/src/adapters/metric-queries.ts`
2. Tests: boundary record inclusion verified

---

## Explicitly NOT in Phase 1.5

| Item | Reason | Disposition |
|------|--------|-------------|
| Data deletion real wiring | Requires cross-system deletion semantics and compliance policy | Design phase |
| MCP allowlist source-of-truth strategy | Config vs DB precedence is a Phase 2 concern | Design phase |
| LLM injection detection | Needs classifier model design | Design phase |
| Enterprise auth (OIDC/SAML) | New architecture | Design phase |
| Audit query & export API | New feature | Phase 2 |

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Supabase JWT extraction more complex than expected | RBAC task overruns | Medium | Dev-mode header fallback preserved; RBAC can ship with partial impl |
| LLM provider SDK changes since Phase 1 spikes | Provider init fails | Low | SDKs were validated in SP-08; pin versions |
| HITL schema doesn't match RequestStore interface | Adapter mismatches | Low | Interface is a single `insert()` method; straightforward mapping |
| Missing DB migrations in target environment | All Drizzle adapters fail | Medium | Verify migrations run before starting; add migration check to health probe |

---

## Verification Plan

1. **Batch 1 gate**: `pnpm -F @aptivo/database test` + `pnpm -F @aptivo/web typecheck`
2. **Batch 2 gate**: `pnpm -F @aptivo/web test` (RBAC + security tests)
3. **Batch 3 gate**: `pnpm test` (full monorepo regression)
4. **Final**: All 1,359+ existing tests still pass + new Phase 1.5 tests

---

## Sprint Logistics

- **Total**: 24 SP across 9 tasks
- **Estimated duration**: 1 sprint (2 weeks)
- **No new packages**: All work is in existing `@aptivo/database` adapters + `apps/web` composition root
- **Pattern adherence**: `createDrizzle*Store(db)` factories, `Result<T,E>` types, `lazy()` singletons, `vi.mock` testing
- **DoD**: All adapters wired, all stubs replaced (except data deletion), RR-1/RR-7 runtime-enforced, all tests passing
