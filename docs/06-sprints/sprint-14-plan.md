# Sprint 14 Implementation Plan: Integration & Phase 2 Delivery (FINAL)

**Theme**: "Seal, validate, ship" — visual builder foundation, MCP discovery and resilience config, deferred modules analysis, approval SLA metrics, full E2E validation, documentation closure, delivery review
**Duration**: 2 weeks (Phase 2, Weeks 11-12 — FINAL Phase 2 Sprint)
**Total Story Points**: 27 SP (8 tasks)
**Packages**: `apps/web` (workflow builder page, MCP discovery API, circuit breaker override, SLA metrics, E2E validation, composition root) + `@aptivo/mcp-layer` (discovery types, per-tool CB override) + `@aptivo/database` (adapters, schema) + `@aptivo/hitl-gateway` (SLA timing data)
**FRD Coverage**: FR-CORE-WFE-001 (visual workflow builder foundation), Epic 7 closure, Epic 8 analysis
**Sprint 13 Residuals**: 2/2 absorbed — Approval SLA metrics (OPS-01, deferred from S13) + WebSocket lifecycle docs RC-1/RC-2 (deferred from S13, merged into INT2-02)
**Derived from**: [Phase 2 Sprint Plan](./phase-2-sprint-plan.md) Sprint 6, [S13 Plan](./sprint-13-plan.md) §9
**Multi-Model Review**: [S14_PLAN_MULTI_REVIEW.md](./S14_PLAN_MULTI_REVIEW.md) — Claude Opus 4.6 + Codex/GPT

---

## Executive Summary

Sprint 14 is the final Phase 2 sprint. Its purpose is threefold: deliver the remaining Epic 7 features (visual workflow builder foundation, MCP discovery, circuit breaker override), complete Epic 8 analysis (deferred modules buy/build decision matrix), and validate the entire Phase 2 platform end-to-end before handover.

The feature track delivers a server-rendered workflow builder page (FEAT-07) that loads and saves workflow definitions via the CRUD API shipped in Sprint 13 (FEAT-01), a dynamic MCP server discovery API (FEAT-08) that exposes health status derived from the existing `CircuitBreakerRegistry`, and a per-tool circuit breaker override configuration API (FEAT-09) that enables admins to tune failure thresholds and reset timeouts per MCP tool. The analysis track (MOD-01) produces a decision matrix for four deferred module categories (Financial & Admin, Case Tracking, Project Management, CRM) with buy vs build recommendations and interface contract drafts for Phase 3 sequencing.

The operations track (OPS-01) adds approval SLA metrics — per-approver latency tracking, breach rate calculation, and a dashboard API endpoint — building on the HITL v2 multi-approver timing data from Sprint 11. The integration track runs a comprehensive E2E validation suite (INT2-01) exercising the golden path from SSO login through MFA step-up, multi-approver request creation, quorum approval, LLM call with safety pipeline, to workflow execution. Documentation closure (INT2-02) resolves the remaining WebSocket lifecycle docs (RC-1/RC-2), audits the WARNING register for completeness, and produces a Phase 2 handover summary. The sprint concludes with a multi-model delivery review (INT2-03) that assesses the complete Phase 2 delivery against the original roadmap.

### Sprint 13 Baseline (What Exists)

| Component | Sprint 13 State | Sprint 14 Target |
|-----------|----------------|-----------------|
| Workflow builder | CRUD API + versioned definitions (FEAT-01) | Server-rendered editor page with step add/remove/reorder |
| MCP discovery | Static registry in composition root | Dynamic discovery API with per-server health |
| Circuit breaker config | Global `CircuitBreakerRegistry` with default thresholds | Per-tool override configuration via admin API |
| Deferred modules | No analysis | Buy/build decision matrix for FA, CT, PM, CRM |
| Approval SLA | Multi-approver tokens + timing data (S11) | Per-approver latency tracking + breach rate dashboard |
| E2E validation | Per-sprint unit + integration tests | Cross-sprint golden path validation suite |
| WARNING register | All Phase 1 + Phase 2 warnings resolved | Final audit + documentation closure |
| WebSocket docs | Deferred (RC-1, RC-2) | Lifecycle documentation delivered |

---

## 1. Task Breakdown

### Phase 1: Platform Features (Days 1-5)

#### FEAT-07: Visual Workflow Builder Foundation (5 SP)

**Description**: Build a server-rendered rule editor page at `/admin/workflows/[id]/edit` that loads workflow definitions from the CRUD API (FEAT-01, Sprint 13) and provides a step editor for adding, removing, and reordering workflow steps. The editor renders the step list with type selection (`action`, `decision`, `hitl`, `notification`, `wait`), per-step configuration forms, and a save/activate flow. Save drafts are submitted via `PUT /api/workflows/:id` and activation changes the status to `active` via the existing `UpdateWorkflowInput` schema. This is the foundation layer only — drag-and-drop visual builder with canvas rendering is Phase 3 scope.

**Acceptance Criteria**:
- [ac] Server-rendered page at `/admin/workflows/[id]/edit` behind RBAC permission `workflow:write`
- [ac] Page loads workflow definition by ID from `GET /api/workflows/:id`
- [ac] Displays step list with each step's `id`, `type`, `name`, and `config` summary
- [ac] "Add step" button appends a new step with default values: `{ id: uuid, type: 'action', name: 'New Step', config: {} }`
- [ac] "Remove step" button removes a step by ID (confirmation prompt before removal)
- [ac] "Move up" / "Move down" buttons reorder steps in the array
- [ac] Step type selector: dropdown with options `action`, `decision`, `hitl`, `notification`, `wait`
- [ac] Step name field: inline-editable text input with 1-200 character validation
- [ac] Step config field: JSON textarea with syntax validation (must be valid JSON object)
- [ac] `nextSteps` editor: multi-select from existing step IDs for branching
- [ac] "Save draft" button submits `PUT /api/workflows/:id` with current step array and `status: 'draft'`
- [ac] "Activate" button submits `PUT /api/workflows/:id` with `status: 'active'` (only enabled when current status is `'draft'`)
- [ac] Error state: displays validation errors from the API response (Zod validation failures)
- [ac] Loading state: skeleton UI while fetching workflow definition
- [ac] `WorkflowBuilderPage` component with `WorkflowStepEditor` sub-component
- [ac] `useWorkflowBuilder` hook: manages step state, handles save/activate API calls
- [ac] Tests for step add/remove/reorder state management
- [ac] Tests for save draft API integration (mock fetch)
- [ac] Tests for activate flow (draft → active status transition)
- [ac] Tests for validation error display

**Files**:
- Create: `apps/web/src/app/admin/workflows/[id]/edit/page.tsx`
- Create: `apps/web/src/lib/workflows/workflow-builder-types.ts`
- Create: `apps/web/src/lib/workflows/use-workflow-builder.ts`
- Create: `apps/web/src/components/workflow/workflow-step-editor.tsx`
- Create: `apps/web/src/components/workflow/step-type-selector.tsx`
- Create: `apps/web/tests/s14-feat-07-workflow-builder.test.ts`

**Dependencies**: None (uses FEAT-01 CRUD API from Sprint 13 as backend)

**TDD Micro-Tasks**:
1. Red: `useWorkflowBuilder(workflowId)` returns `{ steps, loading: true }` on initial render
2. Green: implement hook with `useState` + `useEffect` fetching from `GET /api/workflows/:id`, set `loading: false` after fetch
3. Red: `addStep()` appends a step with `type: 'action'` and unique id to the step array
4. Green: implement `addStep` — generate `crypto.randomUUID()`, push to steps state
5. Red: `removeStep(stepId)` removes the step from the array
6. Green: implement `removeStep` — filter by `step.id !== stepId`
7. Red: `moveStep(stepId, 'up')` swaps step with the one before it
8. Green: implement `moveStep` — find index, swap with `index - 1` (guard: no-op if first)
9. Red: `moveStep(stepId, 'down')` swaps step with the one after it
10. Green: swap with `index + 1` (guard: no-op if last)
11. Red: `updateStep(stepId, { type: 'hitl' })` updates the step's type field
12. Green: implement `updateStep` — map over steps, merge partial for matching id
13. Red: `saveDraft()` calls `PUT /api/workflows/:id` with `{ steps, status: 'draft' }` and returns `Result.ok`
14. Green: implement `saveDraft` — fetch with method PUT, parse response, return result
15. Red: `activate()` calls `PUT /api/workflows/:id` with `{ status: 'active' }` and returns `Result.ok`
16. Green: implement `activate` — fetch with method PUT, verify response includes `status: 'active'`
17. Red: `saveDraft()` returns validation errors when API returns 400 with Zod error
18. Green: parse error response body, extract Zod issues, set `errors` state

---

#### FEAT-08: Dynamic MCP Server Discovery API (3 SP)

**Description**: Build MCP server discovery API endpoints that expose registered MCP servers with real-time health status derived from the existing `CircuitBreakerRegistry`. The list endpoint returns all servers from the MCP registry with their current circuit breaker state (`closed`, `open`, `half-open`), failure count, and configuration. The health endpoint provides individual server health checks by probing the circuit breaker state and optionally performing a transport-level connectivity test. Health results are cached in the `InMemoryCacheStore` for 30 seconds to prevent health-check storms. The discovery API enables the visual workflow builder (FEAT-07) to show available MCP tools when configuring workflow steps.

**Acceptance Criteria**:
- [ac] API route: `GET /api/mcp/servers` — list all registered MCP servers with health status
- [ac] RBAC permission: `platform/admin.view` (read-only, same as admin dashboard)
- [ac] Response schema: `{ servers: McpServerHealthInfo[] }` where `McpServerHealthInfo` is `{ id, name, transport, isEnabled, health: { circuitState, failureCount, lastFailureTime?, config } }`
- [ac] `circuitState` sourced from `CircuitBreakerRegistry.getBreaker(serverId).getState()`
- [ac] `failureCount` sourced from `CircuitBreakerRegistry.getBreaker(serverId).getFailures()`
- [ac] `config` includes `{ failureThreshold, resetTimeoutMs, halfOpenMaxAttempts }` from breaker's config
- [ac] API route: `GET /api/mcp/servers/:id/health` — individual server health check
- [ac] Individual health response: `{ id, name, circuitState, failureCount, lastCheckedAt, tools: McpToolSummary[] }`
- [ac] `McpToolSummary`: `{ id, name, isEnabled, cacheTtlSeconds }` from registry `getTool()`
- [ac] Health cache: 30-second TTL in `InMemoryCacheStore` to prevent health-check storms
- [ac] `McpDiscoveryService` interface: `listServers()`, `getServerHealth(serverId)` with `McpDiscoveryDeps`
- [ac] `createMcpDiscoveryService(deps)` factory with `{ registry, circuitBreakers, cache? }` deps
- [ac] Server not found returns `404` with ProblemDetails `{ _tag: 'NotFoundError' }`
- [ac] Composition root: `getMcpDiscoveryService()` lazy getter
- [ac] Tests for list endpoint returning all servers with health
- [ac] Tests for individual health check with circuit breaker state
- [ac] Tests for health cache hit (second call within 30s returns cached)
- [ac] Tests for server not found (404)

**Files**:
- Create: `apps/web/src/lib/mcp/mcp-discovery-service.ts`
- Create: `apps/web/src/lib/mcp/mcp-discovery-types.ts`
- Create: `apps/web/src/app/api/mcp/servers/route.ts` (GET list)
- Create: `apps/web/src/app/api/mcp/servers/[id]/health/route.ts` (GET health)
- Modify: `apps/web/src/lib/services.ts` (add `getMcpDiscoveryService`)
- Create: `apps/web/tests/s14-feat-08-mcp-discovery.test.ts`

**Dependencies**: None (uses existing `CircuitBreakerRegistry`, `ToolRegistry`, `InMemoryCacheStore`)

**TDD Micro-Tasks**:
1. Red: `listServers()` returns `Result.ok({ servers: [{ id: 'srv-1', name: 'test-server', health: { circuitState: 'closed', failureCount: 0 } }] })` for a registered server
2. Green: implement `createMcpDiscoveryService` — query registry for all servers, get breaker state for each, return composed list
3. Red: `listServers()` returns `circuitState: 'open'` when breaker is open after 5 failures
4. Green: call `getBreaker(serverId).getState()`, include in health response
5. Red: `getServerHealth('srv-1')` returns health with `tools` array listing registered tools
6. Green: query registry `getTool(serverId, toolName)` for all tools on the server, include in response
7. Red: `getServerHealth('nonexistent')` returns `Result.err({ _tag: 'NotFoundError' })`
8. Green: check registry `getServer()` result, return error if null
9. Red: second call to `listServers()` within 30 seconds returns cached result
10. Green: implement cache check with `normalizeCacheKey('discovery', 'list', {})`, TTL 30s
11. Red: `GET /api/mcp/servers` returns JSON array with server health
12. Green: wire route handler with `getMcpDiscoveryService().listServers()`, format response
13. Red: `GET /api/mcp/servers/srv-1/health` returns individual health
14. Green: wire route handler with `getMcpDiscoveryService().getServerHealth(id)`, format response

---

#### FEAT-09: Per-Tool MCP Circuit Breaker Override Configuration (3 SP)

**Description**: Build an admin API for configuring per-tool circuit breaker overrides. By default, all MCP tools on a server share the server-level circuit breaker with `DEFAULT_CIRCUIT_CONFIG` (`{ failureThreshold: 5, resetTimeoutMs: 30_000, halfOpenMaxAttempts: 3 }`). This feature allows admins to override those thresholds for individual tools — e.g., a slow external API tool might need `resetTimeoutMs: 60_000` and `failureThreshold: 10`. Override configurations are stored in a `mcp_circuit_overrides` table and loaded into the `CircuitBreakerRegistry` at startup. Changes are audited. The `CircuitBreakerRegistry` is extended with a `getBreakerWithConfig(key, config?)` method that creates breakers with per-key config overrides.

**Acceptance Criteria**:
- [ac] API route: `PUT /api/mcp/servers/:serverId/tools/:toolName/circuit-breaker` — set override config
- [ac] API route: `GET /api/mcp/servers/:serverId/tools/:toolName/circuit-breaker` — get current config (override or default)
- [ac] API route: `DELETE /api/mcp/servers/:serverId/tools/:toolName/circuit-breaker` — remove override (revert to default)
- [ac] RBAC permission: `platform/admin.write` for PUT/DELETE, `platform/admin.view` for GET
- [ac] Override config schema (Zod): `{ failureThreshold?: number (1-100), resetTimeoutMs?: number (1000-300000), halfOpenMaxAttempts?: number (1-10) }`
- [ac] `mcp_circuit_overrides` table: `id (uuid)`, `serverId (varchar)`, `toolName (varchar)`, `failureThreshold (integer)`, `resetTimeoutMs (integer)`, `halfOpenMaxAttempts (integer)`, `createdAt`, `updatedAt`, unique constraint on `(serverId, toolName)`
- [ac] `CircuitOverrideStore` interface: `upsert(serverId, toolName, config)`, `findByTool(serverId, toolName)`, `delete(serverId, toolName)`, `listByServer(serverId)`
- [ac] `createDrizzleCircuitOverrideStore(db)` adapter
- [ac] `CircuitBreakerRegistry` extended: `getBreakerWithConfig(key, config?)` method creates a breaker with custom config if provided, falls back to registry-level default
- [ac] On PUT: upsert override in DB, reset the breaker for the tool key so new config takes effect immediately
- [ac] On DELETE: remove override from DB, reset the breaker so it reverts to default config
- [ac] Audit trail: `mcp.circuit_breaker.configured` and `mcp.circuit_breaker.reset` actions emitted on change
- [ac] Composition root: `getCircuitOverrideStore()` lazy getter
- [ac] `loadCircuitOverrides(registry, store)` helper loads all overrides from DB into registry at startup
- [ac] Tests for override upsert and retrieval
- [ac] Tests for override delete reverting to default
- [ac] Tests for breaker reset on config change
- [ac] Tests for validation (rejects thresholds outside bounds)
- [ac] Tests for audit trail emission

**Files**:
- Create: `packages/database/src/schema/mcp-circuit-overrides.ts`
- Create: `packages/database/src/adapters/circuit-override-store.ts`
- Modify: `packages/database/src/adapters/index.ts` (barrel export)
- Modify: `packages/database/src/schema/index.ts` (barrel export)
- Modify: `packages/mcp-layer/src/resilience/circuit-breaker-registry.ts` (add `getBreakerWithConfig`)
- Modify: `packages/mcp-layer/src/resilience/index.ts` (re-export new method)
- Create: `apps/web/src/app/api/mcp/servers/[id]/tools/[toolName]/circuit-breaker/route.ts` (GET + PUT + DELETE)
- Create: `apps/web/src/lib/mcp/circuit-override-loader.ts`
- Modify: `apps/web/src/lib/services.ts` (add `getCircuitOverrideStore`, wire `loadCircuitOverrides`)
- Create: `apps/web/tests/s14-feat-09-circuit-breaker-override.test.ts`

**Dependencies**: FEAT-08 (discovery API provides server/tool context)

**TDD Micro-Tasks**:
1. Red: `CircuitBreakerRegistry.getBreakerWithConfig('srv-1:tool-a', { failureThreshold: 10 })` creates a breaker with threshold 10
2. Green: extend `CircuitBreakerRegistry` — if config provided, create breaker with merged config; cache by key
3. Red: `getBreakerWithConfig('srv-1:tool-a')` without config uses registry-level default
4. Green: fall back to `this.config` when no per-key config provided
5. Red: `store.upsert('srv-1', 'tool-a', { failureThreshold: 10, resetTimeoutMs: 60_000 })` creates override record
6. Green: implement `createDrizzleCircuitOverrideStore` with INSERT ON CONFLICT UPDATE
7. Red: `store.findByTool('srv-1', 'tool-a')` returns the override config
8. Green: implement SELECT with `serverId` + `toolName` filter
9. Red: `store.delete('srv-1', 'tool-a')` removes override, `findByTool` returns null
10. Green: implement DELETE with compound key
11. Red: `PUT /api/mcp/servers/srv-1/tools/tool-a/circuit-breaker` with `{ failureThreshold: 10 }` returns 200
12. Green: wire route handler with Zod validation, store upsert, breaker reset, audit emit
13. Red: `PUT` with `{ failureThreshold: 200 }` returns 400 (exceeds max 100)
14. Green: Zod schema validates `failureThreshold` with `.min(1).max(100)`
15. Red: `DELETE /api/mcp/servers/srv-1/tools/tool-a/circuit-breaker` returns 200, breaker reverts to default
16. Green: wire route handler with store delete, breaker reset
17. Red: `loadCircuitOverrides(registry, store)` loads all overrides from store into registry
18. Green: query `store.listByServer('*')`, call `getBreakerWithConfig` for each

---

### Phase 2: Operations & Analysis (Days 3-6)

#### MOD-01: Deferred Modules Buy/Build Analysis (3 SP)

**Description**: Produce a decision matrix document evaluating four deferred module categories for Phase 3 implementation: Financial & Admin (invoicing, expense tracking, budgeting), Case Tracking (issue management, SLA tracking, escalation), Project Management (task boards, milestones, resource allocation), and CRM (contact management, pipeline tracking, activity logging). Each module is evaluated against five criteria: build complexity (SP estimate), time-to-market, integration depth with existing platform services (audit, notifications, HITL, workflows), availability of quality SaaS alternatives, and long-term maintenance cost. The output includes a recommendation per module (build, buy, hybrid), interface contract drafts for the top-priority modules, and a Phase 3 implementation sequence.

**Acceptance Criteria**:
- [ac] Decision matrix document: `docs/04-specs/deferred-modules-analysis.md`
- [ac] Module categories evaluated: Financial & Admin, Case Tracking, Project Management, CRM
- [ac] Five evaluation criteria per module: build complexity (SP), time-to-market (weeks), integration depth (1-5 scale), SaaS alternatives (listed with pros/cons), maintenance cost (annual estimate)
- [ac] Recommendation per module: `build` (deep integration needed), `buy` (commodity SaaS sufficient), `hybrid` (SaaS core + custom integration layer)
- [ac] Interface contract drafts for top-2 priority modules:
  - `ModuleAdapter` interface: `{ initialize(), getCapabilities(), executeAction(action, params), getStatus() }`
  - Domain-specific store interfaces following existing `Store` pattern (`create`, `findById`, `list`, `update`)
  - Event schema for module lifecycle events (Inngest event types)
- [ac] Phase 3 implementation sequence with dependencies and SP estimates
- [ac] SaaS evaluation includes at least 2 alternatives per category with pricing tier analysis
- [ac] Integration depth assessment references existing platform services: audit trail, notification routing, HITL approval, workflow definitions, feature flags
- [ac] Risk assessment per module (vendor lock-in for buy, maintenance burden for build)
- [ac] Document follows project documentation standards (markdown, section numbering)

**Files**:
- Create: `docs/04-specs/deferred-modules-analysis.md`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Draft: evaluation criteria table for Financial & Admin module with SP estimate and SaaS alternatives
2. Review: validate integration depth score against existing audit, notification, HITL services
3. Draft: evaluation criteria table for Case Tracking module
4. Draft: evaluation criteria table for Project Management module
5. Draft: evaluation criteria table for CRM module
6. Draft: `ModuleAdapter` interface contract with `initialize()`, `getCapabilities()`, `executeAction()`, `getStatus()`
7. Draft: domain-specific store interfaces for top-2 priority modules
8. Draft: Phase 3 implementation sequence with dependency graph
9. Review: cross-check recommendations against platform architecture (composition root pattern, factory+deps injection)
10. Finalize: executive summary with recommendation rationale

---

#### OPS-01: Approval SLA Metrics + Dashboard (3 SP)

**Description**: Build per-approver latency tracking and SLA breach detection for the multi-approver HITL flow shipped in Sprint 11. The service computes per-approver response time (time from request creation to individual decision), per-request total resolution time, SLA breach rate (percentage of requests exceeding the configured SLA window), and per-approver performance metrics (average latency, breach count). Metrics are exposed via an admin API endpoint for dashboard consumption. The SLA window is configurable per approval policy (default 4 hours). Breach detection emits an `platform/approval.sla.breached` Inngest event for alerting.

**Acceptance Criteria**:
- [ac] `ApprovalSlaService` interface: `computeMetrics(windowMs)`, `getApproverStats(approverId)`, `getBreachRate(windowMs)`
- [ac] `ApprovalSlaConfig` type: `{ defaultSlaMs: number, breachAlertThreshold: number }`
- [ac] Default config: `{ defaultSlaMs: 14_400_000 (4 hours), breachAlertThreshold: 0.1 (10% breach rate triggers alert) }`
- [ac] Per-approver latency: computed from `hitl_requests.createdAt` to `hitl_decisions.createdAt` for each approver
- [ac] `ApproverStats` type: `{ approverId, avgLatencyMs, medianLatencyMs, p95LatencyMs, totalDecisions, breachCount, breachRate }`
- [ac] Breach: a decision is "breached" when `decisionTimestamp - requestTimestamp > slaMs`
- [ac] `OverallMetrics` type: `{ totalRequests, totalDecisions, avgResolutionMs, breachRate, topBreachApprovers: ApproverStats[] }`
- [ac] `createApprovalSlaService(deps)` factory with `{ hitlRequestStore, hitlDecisionStore, config }` deps
- [ac] API route: `GET /api/admin/approval-sla` — overall SLA metrics for configurable window
- [ac] API route: `GET /api/admin/approval-sla/approvers/:id` — per-approver SLA stats
- [ac] Query params: `windowMs` (default 24h), `limit` for top breaching approvers (default 10, max 50)
- [ac] RBAC permission: `platform/admin.view`
- [ac] SLA breach detection: when breach rate exceeds `breachAlertThreshold`, emit `platform/approval.sla.breached` Inngest event
- [ac] Inngest cron function: `approval/sla-check` runs every 30 minutes to evaluate breach rate
- [ac] Composition root: `getApprovalSlaService()` lazy getter
- [ac] Tests for per-approver latency computation
- [ac] Tests for breach detection (decision after SLA window)
- [ac] Tests for overall breach rate calculation
- [ac] Tests for P95 latency computation
- [ac] Tests for breach alert emission when threshold exceeded

**Files**:
- Create: `apps/web/src/lib/hitl/approval-sla-service.ts`
- Create: `apps/web/src/lib/hitl/approval-sla-types.ts`
- Create: `apps/web/src/app/api/admin/approval-sla/route.ts` (GET overall)
- Create: `apps/web/src/app/api/admin/approval-sla/approvers/[id]/route.ts` (GET per-approver)
- Modify: `apps/web/src/lib/inngest.ts` (add `platform/approval.sla.breached` event type + cron function)
- Modify: `apps/web/src/lib/services.ts` (add `getApprovalSlaService`)
- Create: `apps/web/tests/s14-ops-01-approval-sla.test.ts`

**Dependencies**: None (uses existing HITL request/decision stores from Sprint 11)

**TDD Micro-Tasks**:
1. Red: `computeMetrics(86_400_000)` returns `{ totalRequests: 3, totalDecisions: 5, avgResolutionMs, breachRate: 0 }` when all decisions are within SLA
2. Green: implement `createApprovalSlaService` — query requests and decisions in window, compute average resolution time
3. Red: `computeMetrics(86_400_000)` returns `breachRate: 0.333` when 1 of 3 requests has a decision exceeding SLA
4. Green: compute breach rate as `breachedCount / totalRequests`
5. Red: `getApproverStats('approver-1')` returns `{ avgLatencyMs, medianLatencyMs, p95LatencyMs, breachCount }`
6. Green: query decisions for approver, compute statistical aggregates (sort latencies, find median and P95)
7. Red: `getApproverStats('approver-1')` returns `breachRate: 0.5` when 2 of 4 decisions exceed SLA
8. Green: count decisions where `latencyMs > slaMs`, compute `breachCount / totalDecisions`
9. Red: `computeMetrics(86_400_000)` includes `topBreachApprovers` sorted by breach count descending
10. Green: group decisions by approver, compute stats per approver, sort by `breachCount` desc, take top N
11. Red: `GET /api/admin/approval-sla?windowMs=86400000` returns JSON with overall metrics
12. Green: wire route handler with `getApprovalSlaService().computeMetrics(windowMs)`, format response
13. Red: Inngest cron emits `platform/approval.sla.breached` when breach rate exceeds 10%
14. Green: implement cron function — call `getBreachRate()`, emit event when above threshold

---

### Phase 3: Integration & Validation (Days 5-8)

#### INT2-01: E2E Phase 2 Validation Suite (5 SP)

**Description**: Build a comprehensive end-to-end validation suite exercising the complete Phase 2 platform across all major subsystems. The golden path test traces a full lifecycle: SSO login (OIDC claim mapping) → MFA step-up (enforcement check) → create multi-approver HITL request (quorum policy) → approve via quorum → LLM call with injection detection + content filtering → workflow execution via definition CRUD API. Failure path tests cover injection blocking, content filter rejection, rate limiting, approval timeout, and circuit breaker trip. All composition root services are exercised to verify wiring. The suite produces a coverage report mapping tests to Phase 2 FRD requirements.

**Acceptance Criteria**:
- [ac] Golden path test: SSO login → MFA step-up → multi-approver request → quorum approval → LLM call → workflow execution
- [ac] SSO path: `createClaimMapper` maps OIDC claims to platform roles, `JitProvisioner` creates/links account
- [ac] MFA path: `requireMfa` enforces step-up for sensitive operations, stub MFA client verifies AAL
- [ac] HITL path: `createMultiApproverRequestService` creates request with quorum policy, generates per-approver tokens
- [ac] Approval path: 2-of-3 quorum approval resolves the request
- [ac] LLM path: `getLlmGateway().chat()` with injection detection in prompt, content filter on response
- [ac] Workflow path: `getWorkflowDefinitionService().create()` → activate → execute steps
- [ac] Failure test: prompt injection detected → `Result.err({ _tag: 'InjectionDetected' })`
- [ac] Failure test: content filter blocks unsafe LLM response → `Result.err({ _tag: 'ContentFiltered' })`
- [ac] Failure test: rate limit exceeded on LLM call → `Result.err({ _tag: 'RateLimitExceeded' })`
- [ac] Failure test: approval timeout (TTL expired) → request status `'expired'`
- [ac] Failure test: MCP circuit breaker trips after 5 failures → `CircuitOpen` error
- [ac] Failure test: MCP circuit breaker override with custom threshold → trips at custom count
- [ac] Composition root verification: all lazy getters exercised without crash
- [ac] Coverage report: markdown table mapping each test to the Phase 2 FRD requirement it validates
- [ac] 30+ integration tests total
- [ac] All tests pass with in-memory stores (no external dependencies required)

**Files**:
- Create: `apps/web/tests/s14-int2-01-e2e-phase2-golden-path.test.ts`
- Create: `apps/web/tests/s14-int2-01-e2e-phase2-failure-paths.test.ts`
- Create: `apps/web/tests/s14-int2-01-e2e-phase2-composition-root.test.ts`

**Dependencies**: FEAT-07, FEAT-09, OPS-01

**TDD Micro-Tasks**:
1. Red: golden path — SSO claim mapping produces user with `admin` role from OIDC `groups` claim
2. Green: call `getOidcClaimMapper().mapClaims(oidcClaims)`, verify returned roles include `admin`
3. Red: golden path — MFA enforcement requires step-up for `hitl:approve` operation
4. Green: call `requireMfa('hitl:approve', { aal: 'aal1' })`, verify it demands `aal2`
5. Red: golden path — multi-approver request created with quorum policy `{ required: 2, total: 3 }`
6. Green: call `getHitlMultiApproverService().createRequest()`, verify 3 tokens generated
7. Red: golden path — 2-of-3 approvals resolve the request to `approved`
8. Green: record 2 approve decisions, verify request status transitions to `approved`
9. Red: golden path — LLM chat call returns valid response without injection or content filter
10. Green: call `getLlmGateway().chat()` with clean prompt, verify `Result.ok` response
11. Red: golden path — workflow definition created, activated, and steps verified
12. Green: call `getWorkflowDefinitionService().create()` then `update(id, { status: 'active' })`, verify lifecycle
13. Red: failure — injection detection blocks malicious prompt
14. Green: call LLM gateway with prompt containing `ignore previous instructions`, verify rejection
15. Red: failure — approval timeout produces expired status
16. Green: create request with short TTL, wait for expiry, verify status `expired`
17. Red: failure — circuit breaker trips after configured failures
18. Green: inject 5 transport failures, verify 6th call returns `CircuitOpen`
19. Red: failure — circuit breaker override with `failureThreshold: 3` trips after 3 failures
20. Green: configure override, inject 3 failures, verify trip at custom threshold
21. Red: composition root — all getters return valid instances
22. Green: iterate all exported getters from `services.ts`, call each, verify non-null return

---

### Phase 4: Documentation & Delivery (Days 7-10)

#### INT2-02: Phase 2 Documentation Closure (3 SP)

**Description**: Close all remaining documentation debt for Phase 2. This includes WebSocket lifecycle documentation (RC-1 real-time connection management, RC-2 reconnection strategy — deferred from Sprint 13), a WARNING register audit confirming all warnings are resolved, an architecture delta document describing what changed from the Phase 1 ADD, operator runbook updates for new Sprint 9-14 services, and a Phase 2 handover summary with metrics. The handover summary quantifies Phase 2 delivery: sprint count, total SP, test count, FRD coverage, and Phase 3 recommendations.

**Acceptance Criteria**:
- [ac] WebSocket lifecycle docs: `docs/04-specs/platform-core/websocket-lifecycle.md` — covers RC-1 (connection management: auth handshake, heartbeat, channel subscription, graceful close) and RC-2 (reconnection: exponential backoff, session resumption, message replay window)
- [ac] WARNING register audit: review all entries in `docs/WARNINGS_REGISTER.md`, confirm zero open warnings, add Phase 2 summary section
- [ac] Architecture delta document: `docs/03-architecture/phase-2-architecture-delta.md` — new subsystems (OIDC/SAML, MFA, HITL v2 multi-approver, LLM safety pipeline, MCP discovery, approval SLA), changed interfaces (composition root additions, event schema extensions), removed/deprecated items
- [ac] Operator runbook updates: `docs/05-guidelines/operator-runbook.md` — new sections for: SSO/MFA troubleshooting, multi-approver HITL escalation, LLM budget alert response, circuit breaker override management, approval SLA breach response, anomaly detection alert triage
- [ac] Phase 2 handover summary: `docs/06-sprints/phase-2-handover.md` — metrics (6 sprints, 172 SP, test count, FRD coverage table), deferred items list (with SP estimates), Phase 3 recommendations, known limitations
- [ac] All FRD requirements mapped to delivery sprint in handover summary
- [ac] Phase 3 recommendations include: visual builder full implementation, ML injection classifier, live-trading workflow, module integrations (from MOD-01)

**Files**:
- Create: `docs/04-specs/platform-core/websocket-lifecycle.md`
- Modify: `docs/WARNINGS_REGISTER.md` (add Phase 2 summary section)
- Create: `docs/03-architecture/phase-2-architecture-delta.md`
- Modify: `docs/05-guidelines/operator-runbook.md` (add new sections)
- Create: `docs/06-sprints/phase-2-handover.md`

**Dependencies**: INT2-01 (E2E results inform handover summary), MOD-01 (module analysis informs Phase 3 recommendations)

**TDD Micro-Tasks**:
1. Draft: WebSocket lifecycle doc — §1 connection management (auth handshake with JWT, heartbeat interval, channel subscription model)
2. Draft: WebSocket lifecycle doc — §2 reconnection strategy (exponential backoff with jitter, session token for resumption, 5-minute message replay window)
3. Audit: WARNING register — scan all tiers for open items, verify each resolved/accepted/addressed entry
4. Draft: architecture delta doc — §1 new subsystems with interface diagrams
5. Draft: architecture delta doc — §2 changed interfaces (composition root growth from S9-S14)
6. Draft: operator runbook — SSO/MFA troubleshooting section
7. Draft: operator runbook — circuit breaker override and approval SLA sections
8. Draft: Phase 2 handover — metrics table (sprints, SP, tests, FRD coverage)
9. Draft: Phase 2 handover — deferred items with SP estimates and Phase 3 sequence
10. Review: cross-reference handover FRD coverage table against phase-2-sprint-plan.md FRD tracker

---

#### INT2-03: Multi-Model Phase 2 Delivery Review (2 SP)

**Description**: Execute a multi-model review of the complete Phase 2 delivery. Claude Opus 4.6 and Codex/GPT independently evaluate the Phase 2 implementation against the original [Phase 2 roadmap](./phase-2-roadmap.md) and [Phase 2 sprint plan](./phase-2-sprint-plan.md). The review assesses: FRD requirement coverage (17 requirements across Sprints 9-14), test suite completeness, architecture coherence, documentation quality, WARNING register closure, and Phase 3 readiness. The output is a structured review document with gap analysis, risk findings, and a go/no-go release recommendation.

**Acceptance Criteria**:
- [ac] Review document: `docs/06-sprints/S14_DELIVERY_MULTI_REVIEW.md`
- [ac] Reviewers: Claude Opus 4.6 (lead) + Codex/GPT (secondary)
- [ac] Coverage assessment: map each Phase 2 FRD requirement to its implementation sprint and test file
- [ac] Gap analysis: identify any FRD requirements not fully satisfied, with severity rating
- [ac] Test completeness: verify test count progression (Sprint 9: 483 → Sprint 14: target)
- [ac] Architecture coherence: verify composition root growth is maintainable, no circular dependencies
- [ac] Documentation quality: verify all doc-gate requirements from Sprints 9-14 are satisfied
- [ac] WARNING register: confirm zero open warnings across all tiers
- [ac] Phase 3 recommendations: prioritized list of deferred items with estimated SP and dependencies
- [ac] Release decision: `GO` / `NO-GO` with rationale and any conditions
- [ac] Dissent log: record disagreements between reviewers with resolution

**Files**:
- Create: `docs/06-sprints/S14_DELIVERY_MULTI_REVIEW.md`

**Dependencies**: INT2-02 (documentation must be complete before delivery review)

**TDD Micro-Tasks**:
1. Review: FRD coverage matrix — map 17 Phase 2 FRD requirements to implementation files and test files
2. Review: gap analysis — identify any requirements marked "scope-limited" or "partial" and assess severity
3. Review: test count audit — sum test files across Sprints 9-14, compare against Phase 1 baseline
4. Review: architecture coherence — trace composition root imports, verify no circular dependencies
5. Review: documentation completeness — check each sprint's doc-gate table against actual docs
6. Review: WARNING register — verify all tiers show zero open items
7. Draft: Phase 3 recommendation list with priority ordering
8. Draft: release decision with go/no-go rationale
9. Review: Codex/GPT independent assessment
10. Reconcile: merge both reviews, document dissent log, produce final verdict

---

## 2. Dependency Graph

```
Phase 1 (Days 1-5) — Platform Features:
  FEAT-07 (Workflow Builder, 5SP) ─── no deps ──────────────┐
  FEAT-08 (MCP Discovery, 3SP) ─── no deps ─────────────────┤
  FEAT-09 (CB Override, 3SP) ← FEAT-08                       │
                                                               │
Phase 2 (Days 3-6) — Operations & Analysis:                   │
  MOD-01 (Modules Analysis, 3SP) ─── no deps ───────────────┤
  OPS-01 (Approval SLA, 3SP) ─── no deps ───────────────────┤
                                                               │
Phase 3 (Days 5-8) — Integration & Validation:                │
  INT2-01 (E2E Validation, 5SP) ← FEAT-07, FEAT-09, OPS-01  │
                                                               ▼
Phase 4 (Days 7-10):
  INT2-02 (Documentation Closure, 3SP) ← INT2-01, MOD-01
  INT2-03 (Delivery Review, 2SP) ← INT2-02
```

**Critical path**: FEAT-08 → FEAT-09 → INT2-01 → INT2-02 → INT2-03

**Parallel tracks**:
- Track A (Senior): FEAT-07 → INT2-01 (workflow builder → E2E validation)
- Track B (Web Dev 1): MOD-01 → OPS-01 → INT2-02 (modules analysis → SLA metrics → documentation)
- Track C (Web Dev 2): FEAT-08 → FEAT-09 (MCP discovery → circuit breaker override)

---

## 3. Architectural Decisions

### Q1: Visual Workflow Builder — Server-Rendered Foundation, Not SPA Canvas

**Decision**: The workflow builder is a server-rendered Next.js page with React state management for the step editor. This is the foundation layer: step list with add/remove/reorder, type selection, config editing, and save/activate flow. The page uses the existing CRUD API (`GET /api/workflows/:id`, `PUT /api/workflows/:id`) as its backend — no new API endpoints needed. The step editor is a controlled form, not a canvas-based visual builder. Drag-and-drop visual builder with node graph rendering is explicitly Phase 3 scope to avoid scope creep. The `useWorkflowBuilder` hook encapsulates all state management and API interaction, making it easy to upgrade the UI layer without changing the data flow.

### Q2: MCP Discovery — Health Derived from Circuit Breaker State

**Decision**: Server health is derived from the existing `CircuitBreakerRegistry` rather than performing active health probes. A server is "healthy" when its circuit breaker is `closed`, "degraded" when `half-open`, and "unhealthy" when `open`. This approach avoids the complexity of active health check polling (which would require transport-level connectivity tests) while providing meaningful real-time status based on actual call success/failure patterns. The 30-second cache on the list endpoint prevents health-check storms when the admin dashboard polls frequently. Individual health checks (`GET /api/mcp/servers/:id/health`) include tool listings from the registry, enabling the workflow builder to discover available tools.

### Q3: Circuit Breaker Override — Per-Tool Key, Not Per-Server

**Decision**: Override configuration uses the compound key `serverId:toolName` rather than overriding at the server level. This provides fine-grained control: a slow external API tool on an otherwise fast server can have relaxed thresholds without affecting the server's other tools. The `CircuitBreakerRegistry.getBreakerWithConfig(key, config?)` extension creates breakers with per-key config while maintaining backward compatibility — callers using `getBreaker(serverId)` get the existing default behavior. Overrides are persisted in `mcp_circuit_overrides` and loaded at startup via `loadCircuitOverrides()`. Config changes take effect immediately by resetting the breaker, which clears failure counts. This is intentional: an admin changing thresholds expects the new config to apply from a clean state.

### Q4: Approval SLA — Statistical Aggregates, Not Real-Time Streaming

**Decision**: SLA metrics are computed as statistical aggregates over a configurable window (default 24 hours) rather than real-time streaming counters. This approach is consistent with the existing metric service pattern (Sprint 7) and avoids the complexity of maintaining real-time counters across request/decision events. P95 latency is computed by sorting all decision latencies and selecting the value at the 95th percentile — accurate for the expected volume (hundreds of decisions per day, not millions). The 30-minute cron interval for breach detection provides timely alerting without adding per-request overhead.

### Q5: E2E Validation — In-Memory Stores Only

**Decision**: All E2E tests use in-memory stores and mock external services (no database, no Redis, no external APIs). This ensures the test suite runs in CI without infrastructure dependencies while still validating the full composition root wiring and service interaction patterns. The in-memory constraint is documented explicitly in the handover summary as a known limitation — production-grade E2E tests against real infrastructure are Phase 3 scope. Each test file focuses on a specific path (golden path, failure paths, composition root) to maintain test isolation and readability.

### Q6: Documentation Closure — Delta Document, Not Full Rewrite

**Decision**: Phase 2 architecture changes are documented as a delta from the Phase 1 ADD rather than a full architecture rewrite. The delta document lists new subsystems, changed interfaces, and deprecated items. This approach reduces documentation effort while providing a clear audit trail of what Phase 2 added. The Phase 2 handover summary is a new document (not an amendment to Phase 1 docs) because it serves a different audience: project stakeholders evaluating Phase 2 completion and Phase 3 planning.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| Visual workflow builder foundation | 5 | **Commit** | FR-CORE-WFE-001, Epic 7 closure |
| Dynamic MCP server discovery API | 3 | **Commit** | Epic 7 closure, builder prerequisite |
| Per-tool MCP circuit breaker override | 3 | **Commit** | Epic 7 closure, operational resilience |
| Deferred modules buy/build analysis | 3 | **Commit** | Epic 8, Phase 3 input |
| Approval SLA metrics + dashboard | 3 | **Commit** | Sprint 13 deferred, operational visibility |
| E2E Phase 2 validation suite | 5 | **Commit** | Phase 2 closure |
| Phase 2 documentation closure | 3 | **Commit** | Phase 2 closure, absorbs FEAT-05 RC-1/RC-2 |
| Multi-model Phase 2 delivery review | 2 | **Commit** | Phase 2 closure |
| MOD-02: Interface contract validation | 3 | **Defer → Phase 3** | Follows MOD-01 analysis output |
| LLM streaming content filter | 3 | **Defer → Phase 3** | New pipeline architecture |
| Crypto live-trading workflow | 5 | **Defer → Phase 3** | Domain build beyond closure sprint |
| HR onboarding workflow | 4 | **Defer → Phase 3** | Needs SLA metrics baseline first |
| ML injection classifier | 5 | **Defer → Phase 3** | Needs model hosting infrastructure |

**Committed**: 27 SP | **Deferred**: ~20 SP to Phase 3

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | FEAT-07 (5), INT2-01 (5) | 10 |
| **Web Dev 1** | MOD-01 (3), OPS-01 (3), INT2-02 (3) | 9 |
| **Web Dev 2** | FEAT-08 (3), FEAT-09 (3) | 6 |
| **All** | INT2-03 (2) | 2 |
| **Total** | | **27 SP** |

Senior carries the highest complexity (10 SP) because the workflow builder foundation (FEAT-07) requires full-stack Next.js page development with React state management, and the E2E validation suite (INT2-01) requires deep knowledge of all Phase 2 subsystems to design meaningful golden and failure path tests. Web Dev 1 handles the analysis and operations track: MOD-01 is a research-heavy documentation task requiring understanding of the platform's integration surface, OPS-01 builds on the HITL v2 data model from Sprint 11, and INT2-02 requires cross-cutting documentation knowledge across all Phase 2 sprints. Web Dev 2 handles the MCP feature pair: FEAT-08 leverages existing `CircuitBreakerRegistry` and `ToolRegistry` interfaces, and FEAT-09 extends the registry with per-tool config (a focused change to a well-understood subsystem). INT2-03 is a team activity requiring all developers to participate in the delivery review.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Visual builder scope creep (full drag-and-drop requested) | High | High | Enforce foundation-only boundary — step list editor with save/activate; canvas builder is Phase 3 |
| E2E test fragility across 10+ subsystems | Medium | High | All tests use in-memory stores; mocked external services; isolated test files per path |
| Documentation closure time pressure | Medium | Medium | INT2-02 starts Day 7; Web Dev 1 begins MOD-01/OPS-01 early to free capacity |
| MOD-01 analysis paralysis (4 modules, 5 criteria each) | Medium | Low | Time-boxed to 3 SP; decision matrix format forces structured output; no implementation required |
| In-memory store gaps in E2E (behavior differs from Drizzle) | Medium | Medium | Document explicitly in handover; add "production E2E with real DB" to Phase 3 backlog |
| Circuit breaker override misconfiguration by admin | Low | Medium | Zod validation bounds (1-100 threshold, 1s-300s timeout); audit trail on all changes |
| MCP discovery cache staleness (30-second TTL) | Low | Low | TTL configurable; real-time accuracy not critical for admin dashboard use case |
| Approval SLA false breaches from clock skew | Low | Low | All timestamps are server-generated; SLA window (4h default) absorbs minor skew |

---

## 7. Definition of Done

- [ ] Server-rendered workflow builder page at `/admin/workflows/[id]/edit` *(FEAT-07)*
- [ ] Step editor: add, remove, reorder, type selection, config editing *(FEAT-07)*
- [ ] Save draft and activate flow via existing CRUD API *(FEAT-07)*
- [ ] `GET /api/mcp/servers` returns all servers with circuit breaker health *(FEAT-08)*
- [ ] `GET /api/mcp/servers/:id/health` returns individual health with tool list *(FEAT-08)*
- [ ] Health cache: 30-second TTL prevents health-check storms *(FEAT-08)*
- [ ] `getMcpDiscoveryService()` in composition root *(FEAT-08)*
- [ ] `PUT /api/mcp/servers/:serverId/tools/:toolName/circuit-breaker` configures override *(FEAT-09)*
- [ ] `DELETE` endpoint reverts to default config *(FEAT-09)*
- [ ] `CircuitBreakerRegistry.getBreakerWithConfig()` supports per-key config *(FEAT-09)*
- [ ] Override changes audited and breaker reset immediately *(FEAT-09)*
- [ ] `mcp_circuit_overrides` table with Drizzle adapter *(FEAT-09)*
- [ ] Decision matrix document for FA, CT, PM, CRM modules *(MOD-01)*
- [ ] Interface contract drafts for top-2 priority modules *(MOD-01)*
- [ ] Phase 3 implementation sequence with dependencies *(MOD-01)*
- [ ] Per-approver latency tracking with P95 computation *(OPS-01)*
- [ ] SLA breach rate calculation with configurable window *(OPS-01)*
- [ ] `GET /api/admin/approval-sla` with overall metrics *(OPS-01)*
- [ ] Breach alert via `platform/approval.sla.breached` Inngest event *(OPS-01)*
- [ ] `getApprovalSlaService()` in composition root *(OPS-01)*
- [ ] Golden path E2E: SSO → MFA → multi-approver → LLM → workflow *(INT2-01)*
- [ ] Failure path E2E: injection, content filter, rate limit, timeout, circuit breaker *(INT2-01)*
- [ ] Composition root verification: all lazy getters exercised *(INT2-01)*
- [ ] 30+ integration tests in E2E validation suite *(INT2-01)*
- [ ] WebSocket lifecycle docs (RC-1, RC-2) delivered *(INT2-02)*
- [ ] WARNING register audit: zero open warnings confirmed *(INT2-02)*
- [ ] Phase 2 architecture delta document *(INT2-02)*
- [ ] Operator runbook updated for Sprint 9-14 services *(INT2-02)*
- [ ] Phase 2 handover summary with metrics and Phase 3 recommendations *(INT2-02)*
- [ ] Multi-model delivery review with go/no-go decision *(INT2-03)*
- [ ] FRD coverage matrix: 17 Phase 2 requirements mapped to implementations *(INT2-03)*
- [ ] 80%+ test coverage on new Sprint 14 code
- [ ] CI pipeline green with all tests passing

---

## 8. Doc-Gate Requirement

| Document | Section | Task |
|----------|---------|------|
| `docs/04-specs/platform-core/websocket-lifecycle.md` | §1 Connection management (RC-1), §2 Reconnection strategy (RC-2) | INT2-02 |
| `docs/04-specs/deferred-modules-analysis.md` | Full document — module evaluation matrix, interface contracts, Phase 3 sequence | MOD-01 |
| `docs/03-architecture/phase-2-architecture-delta.md` | §1 New subsystems, §2 Changed interfaces, §3 Deprecated items | INT2-02 |
| `docs/05-guidelines/operator-runbook.md` | §10 SSO/MFA troubleshooting, §11 Circuit breaker management, §12 Approval SLA response, §13 Anomaly alert triage | INT2-02 |
| `docs/06-sprints/phase-2-handover.md` | Full document — metrics, FRD coverage, deferred items, Phase 3 recommendations | INT2-02 |
| `docs/06-sprints/S14_DELIVERY_MULTI_REVIEW.md` | Full document — coverage assessment, gap analysis, release decision | INT2-03 |
| `docs/WARNINGS_REGISTER.md` | Phase 2 summary section | INT2-02 |

---

## 9. Phase 3 Preview

Sprint 14 closes Phase 2. The following items are recommended for Phase 3 based on MOD-01 analysis and deferred backlog:

| Item | SP (est.) | Why it needs Phase 2 |
|------|-----------|----------------------|
| Visual workflow builder full implementation (drag-and-drop canvas) | 8 | Needs FEAT-07 foundation as starting point |
| MOD-02: Interface contract validation for selected modules | 3 | Needs MOD-01 buy/build recommendations |
| Module integrations (top-2 from MOD-01) | 8-12 | Needs interface contracts from MOD-01 |
| ML injection classifier | 5 | Needs model hosting infrastructure + rule-based baseline from LLM2-01 |
| LLM streaming content filter | 3 | Needs content filter patterns from LLM2-02 adapted for streaming |
| Crypto live-trading workflow | 5 | Needs SMTP fallback (NOTIF2-01) + SLA metrics baseline (OPS-01) |
| HR onboarding workflow | 4 | Needs priority routing (NOTIF2-03) + SLA metrics (OPS-01) |
| Active anomaly blocking | 2 | Needs anomaly detector (OBS-05) wired to access control middleware |
| Production E2E with real infrastructure | 3 | Needs INT2-01 test patterns with real DB/Redis |
| Consent withdrawal UI | 3 | Needs consent API from FEAT-04 |
