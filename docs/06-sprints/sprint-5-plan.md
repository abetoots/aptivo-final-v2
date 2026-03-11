# Sprint 5 Implementation Plan: Integration & Hardening

**Theme**: "Wire it all together, lock it down"
**Duration**: 2 weeks (Week 11-12)
**Total Story Points**: 32 SP (12 tasks)
**Packages**: `@aptivo/database` (adapters) + `apps/web` (composition root, Inngest, middleware) + all existing packages (adapter wiring)
**FRD Coverage**: End-to-end validation of all platform subsystems
**WARNING Closure**: 19 hardening items (S5-W13 through S5-W16, S6-W17, S6-W18, T1-W27 through T1-W29, S2-W2, S2-W3, S1-W8, S1-W11, S1-W12, S7-W24 through S7-W30)

---

## Executive Summary

Sprint 5 transitions the platform from isolated packages with in-memory mocks to a fully integrated system. Week 1 wires real Drizzle DB adapters, external SDK adapters (S3, AgentKit), and Inngest function registration. Week 2 validates the complete platform via an end-to-end demo workflow and applies security/observability hardening across 19 WARNING items.

Architecture constraints resolved in [SPRINT_PLAN_5_MULTI_REVIEW.md](./SPRINT_PLAN_5_MULTI_REVIEW.md):
- Drizzle adapters live in `@aptivo/database/adapters` — single package owns all DB access
- Composition root in `apps/web/src/lib/services.ts` — builds all services with real deps
- Trace context via payload-level `traceparent` fields at each async boundary
- AuditStore adapter manages transaction lifecycle via `withTransaction()` wrapper

### Multi-Model Consensus

This plan was produced via multi-model synthesis (Claude Opus 4.6 lead + Gemini 3 Flash Preview + Codex/GPT). All three models agree on:

- 32 SP committed scope (45 SP demand trimmed by deferring UI dashboards)
- DB adapters → Inngest registration → composition root → E2E demo as critical path
- INT-02 (Admin Dashboard, 5 SP) and INT-03 (LLM Dashboard, 3 SP) deferred to Sprint 6
- Security hardening (INT-06) is high priority — 8 WARNING items
- Drizzle adapter location in `@aptivo/database` and composition root pattern

---

## 1. Task Breakdown

### Phase 1: Foundation Wiring (Days 1-5)

#### INT-W1: Audit Drizzle Adapters (3 SP)

**Description**: Implement Drizzle-backed `AuditStore` and `DlqStore` adapters. The AuditStore adapter is the most complex — it manages a database transaction across `lockChainHead` → `insert` → `updateChainHead` via a `withTransaction()` wrapper.

**Acceptance Criteria**:
- [ac] `createDrizzleAuditStore(db)` implements `AuditStore` interface from `@aptivo/audit`
- [ac] `lockChainHead()` uses `SELECT ... FOR UPDATE` within transaction
- [ac] `insert()` + `updateChainHead()` execute within same transaction
- [ac] `withTransaction()` wrapper ensures atomicity of the 3-step pipeline
- [ac] `createDrizzleDlqStore(db)` implements `DlqStore` interface — CRUD for `audit_write_dlq` table
- [ac] Integration tests verify transaction isolation (concurrent writes don't corrupt chain)
- [ac] Exported from `@aptivo/database/adapters`

**Files**:
- Create: `packages/database/src/adapters/audit-store-drizzle.ts`
- Create: `packages/database/src/adapters/dlq-store-drizzle.ts`
- Create: `packages/database/src/adapters/index.ts`
- Create: `packages/database/tests/int-w1-audit-adapters.test.ts`
- Modify: `packages/database/package.json` (add `/adapters` export)

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `createDrizzleAuditStore(db).lockChainHead('global')` returns null for empty table
2. Green: Implement `lockChainHead` with `SELECT ... FOR UPDATE` + auto-seed on first call
3. Red: `insert()` persists audit record
4. Green: Implement `insert` mapping `AuditRecord` → Drizzle insert
5. Red: `withTransaction()` rolls back on failure
6. Green: Implement transaction wrapper with Drizzle `db.transaction()`
7. Red: DLQ `insert` + `getPending` + `markReplayed`
8. Green: Implement all `DlqStore` methods

---

#### INT-W2: Notification Drizzle Adapters (3 SP)

**Description**: Implement Drizzle-backed `NotificationPreferenceStore`, `DeliveryLogStore`, and `TemplateStore` adapters.

**Acceptance Criteria**:
- [ac] `createDrizzlePreferenceStore(db)` implements `NotificationPreferenceStore` — opt-out check + set
- [ac] `createDrizzleDeliveryLogStore(db)` implements `DeliveryLogStore` — insert delivery log entries
- [ac] `createDrizzleTemplateStore(db)` implements `TemplateStore` — `findBySlug(slug, version?)` with version fallback
- [ac] Template lookup resolves latest version when version param is omitted
- [ac] All adapters exported from `@aptivo/database/adapters`

**Files**:
- Create: `packages/database/src/adapters/notification-preference-drizzle.ts`
- Create: `packages/database/src/adapters/delivery-log-drizzle.ts`
- Create: `packages/database/src/adapters/template-store-drizzle.ts`
- Create: `packages/database/tests/int-w2-notification-adapters.test.ts`

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `preferenceStore.isOptedOut(userId, channel)` returns false for unknown user
2. Green: Implement with `SELECT` from preferences table
3. Red: `templateStore.findBySlug('hitl-approval-request')` returns latest version
4. Green: Implement with `ORDER BY version DESC LIMIT 1`
5. Red: `deliveryLogStore.insert(entry)` persists log
6. Green: Implement Drizzle insert

---

#### INT-W3: S3StorageAdapter for DO Spaces (2 SP)

**Description**: Implement `StorageAdapter` using `@aws-sdk/client-s3` for DigitalOcean Spaces (S3-compatible).

**Acceptance Criteria**:
- [ac] `createS3StorageAdapter(config)` implements `StorageAdapter` from `@aptivo/file-storage`
- [ac] `upload()` returns presigned PUT URL for client-side upload
- [ac] `download()` returns presigned GET URL for authorized download
- [ac] `delete()` removes object from bucket
- [ac] `getMetadata()` returns file size, content type, last modified
- [ac] All errors mapped to tagged union `StorageError` variants
- [ac] Config: bucket name, region, endpoint (DO Spaces URL)

**Files**:
- Create: `packages/file-storage/src/storage/s3-adapter.ts`
- Create: `packages/file-storage/tests/int-w3-s3-adapter.test.ts`
- Modify: `packages/file-storage/package.json` (add `@aws-sdk/client-s3` dep)

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `upload(key, contentType)` returns presigned URL
2. Green: Implement with `PutObjectCommand` + `getSignedUrl`
3. Red: SDK error → `Result.err({ _tag: 'StorageUnavailable' })`
4. Green: Map S3 errors to tagged union variants
5. Red: `delete(key)` removes object
6. Green: Implement with `DeleteObjectCommand`

---

#### INT-W4: AgentKitTransportAdapter for MCP (2 SP)

**Description**: Implement `McpTransportAdapter` using `@inngest/agent-kit` MCPClient for real MCP server communication.

**Acceptance Criteria**:
- [ac] `createAgentKitTransportAdapter(config)` implements `McpTransportAdapter` from `@aptivo/mcp-layer`
- [ac] `callTool(serverUrl, toolName, args)` invokes tool via MCPClient
- [ac] Transport errors mapped to `McpTransportError` tagged union variants
- [ac] Timeout configurable per call

**Files**:
- Create: `packages/mcp-layer/src/transport/agentkit-adapter.ts`
- Create: `packages/mcp-layer/tests/int-w4-agentkit-adapter.test.ts`
- Modify: `packages/mcp-layer/package.json` (add `@inngest/agent-kit` dep)

**Dependencies**: None

---

#### INT-W5: Inngest Function Registration (2 SP)

**Description**: Wire all Inngest function factories (`processAuditEvent`, `replayDlqEvents`, `processDataDeletion`) into `apps/web` Inngest route with real dependencies.

**Acceptance Criteria**:
- [ac] `apps/web/src/app/api/inngest/route.ts` registers all 3 function factories
- [ac] Each function receives real service instances from composition root
- [ac] `replayDlqEvents` configured with cron schedule (every 5 minutes)
- [ac] Functions discoverable in Inngest dev server

**Files**:
- Modify: `apps/web/src/app/api/inngest/route.ts`
- Modify: `apps/web/src/lib/inngest.ts` (add function definitions)

**Dependencies**: INT-W1 (audit adapters needed for real AuditService)

---

#### INT-W6: Composition Root (2 SP)

**Description**: Create a central service composition file that builds all platform services with real dependencies (Drizzle stores, Novu client, S3 adapter, etc.).

**Acceptance Criteria**:
- [ac] `apps/web/src/lib/services.ts` exports all service instances
- [ac] Each service created via factory function with real Drizzle adapters
- [ac] Environment-driven config (DB URL, S3 credentials, Novu API key, etc.)
- [ac] Lazy initialization where appropriate (avoid cold-start overhead)

**Files**:
- Create: `apps/web/src/lib/services.ts`
- Create: `apps/web/src/lib/db.ts` (Drizzle client instance)

**Dependencies**: INT-W1, INT-W2

---

### Phase 2: End-to-End Validation (Days 5-8)

#### INT-01: End-to-End Demo Workflow (5 SP)

**Description**: Implement a demo workflow that exercises all 6 platform subsystems: trigger → LLM analysis → HITL approval → MCP action → file storage → audit trail. This validates the entire integration.

**Acceptance Criteria**:
- [ac] Inngest function `demo/analysis-workflow` orchestrates the full pipeline
- [ac] Step 1: `llmGateway.chat()` — LLM analyzes input, cost tracked
- [ac] Step 2: `hitlService.createRequest()` — creates approval request with notification
- [ac] Step 3: `waitForEvent('hitl/decision.submitted')` — pauses for human decision
- [ac] Step 4: `mcpWrapper.execute()` — calls MCP tool based on decision
- [ac] Step 5: `fileStorage.upload()` — stores result artifact
- [ac] Step 6: `auditWriter.emit()` — records audit trail
- [ac] Integration test proves full flow with mock/test adapters
- [ac] Each step produces audit events via middleware

**Files**:
- Create: `apps/web/src/lib/workflows/demo-workflow.ts`
- Create: `apps/web/tests/int-01-e2e-workflow.test.ts`
- Modify: `apps/web/src/app/api/inngest/route.ts` (register demo function)

**Dependencies**: INT-W5, INT-W6, INT-W3, INT-W4

**TDD Micro-Tasks**:
1. Red: Trigger event → LLM step executes
2. Green: Wire `llmGateway.chat()` in `step.run('llm-analyze')`
3. Red: LLM result → HITL request created
4. Green: Wire `hitlService.createRequest()` in `step.run('hitl-request')`
5. Red: HITL decision → MCP tool called
6. Green: Wire `waitForEvent` + `mcpWrapper.execute()` in `step.run('mcp-action')`
7. Red: MCP result → file stored
8. Green: Wire `fileStorage.upload()` in `step.run('store-result')`
9. Red: Complete flow → audit trail recorded
10. Green: Wire `auditWriter.emit()` + verify audit records

---

### Phase 3: Hardening (Days 6-10, parallel with Phase 2)

#### INT-06: Security Hardening (4 SP)

**Description**: Implement 8 security WARNING items at the application gateway layer.

**Acceptance Criteria**:
- [ac] **SSRF validation** (T1-W27): Outbound webhook URLs validated — private IPs (10.x, 172.16-31.x, 192.168.x), localhost, link-local, metadata endpoints blocked
- [ac] **Inbound webhook limits** (T1-W28): 256KB body size limit; HMAC signature verification required
- [ac] **Health check disclosure** (T1-W29): `/health/live` returns only `{ status: 'ok' }`; `/health/ready` returns only `{ status: 'ok' | 'degraded' }` — no dependency details
- [ac] **PII-safe logging** (S2-W2): `sanitizeForLogging()` redacts email, name, phone, address, SSN fields
- [ac] **Access log PII** (S2-W3): Request logs redact/hash query params containing PII
- [ac] **Secret rotation** (S1-W8): Dual-key validation pattern documented + implemented for JWT signing keys
- [ac] **Webhook body size** (S1-W11): 256KB enforced at middleware layer
- [ac] **API body limits** (S1-W12): 1MB JSON body limit, 10-level nesting depth at gateway middleware

**Files**:
- Create: `apps/web/src/lib/security/ssrf-validator.ts`
- Create: `apps/web/src/lib/security/body-limits.ts`
- Create: `apps/web/src/lib/security/sanitize-logging.ts`
- Modify: `apps/web/src/middleware.ts` (wire security middleware)
- Modify: `apps/web/src/app/health/` (reduce info disclosure)
- Create: `apps/web/tests/int-06-security.test.ts`

**Dependencies**: None (independent of wiring)

**TDD Micro-Tasks**:
1. Red: `validateWebhookUrl('http://169.254.169.254/...')` returns false
2. Green: Implement private IP + metadata endpoint blocklist
3. Red: Request with 300KB body → 413 Payload Too Large
4. Green: Implement body size middleware
5. Red: `sanitizeForLogging({ email: 'test@example.com' })` → `{ email: '[REDACTED]' }`
6. Green: Implement PII field redaction
7. Red: Health endpoint returns dependency info
8. Green: Strip to status-only response

---

#### INT-05: Runtime Hardening (2 SP)

**Description**: Configure DO App Platform probes and implement graceful shutdown.

**Acceptance Criteria**:
- [ac] Readiness probe: `/health/ready` checks DB connectivity
- [ac] Startup probe: `/health/live` returns 200 when app is initialized
- [ac] DO app spec updated with probe configuration
- [ac] SIGTERM handler drains in-flight requests (30s grace period)
- [ac] Clean Inngest worker shutdown

**Files**:
- Create: `apps/web/src/lib/shutdown.ts`
- Modify: `apps/web/src/instrumentation.ts` (register shutdown hooks)
- Create/Modify: DO app spec YAML

**Dependencies**: None

---

#### INT-08: Trace Context Propagation (3 SP)

**Description**: Propagate W3C `traceparent` across all 6 async boundaries identified in WARNING items S7-W24 through S7-W30.

**Acceptance Criteria**:
- [ac] **Inngest waitForEvent** (S7-W24): `traceparent` included in HITL decision event payload; extracted by waiting function
- [ac] **BullMQ jobs** (S7-W25): `traceparent` field in job payload (if BullMQ is used)
- [ac] **Novu notifications** (S7-W26): `traceId` in `novu.trigger()` payload metadata
- [ac] **MCP tool calls** (S7-W27): `traceparent` header on transport requests
- [ac] **JWT validation** (S7-W29): Explicit OTel span wrapping Supabase JWT validation
- [ac] **Outbound webhooks** (S7-W30): `traceparent` header in outbound webhook payloads
- [ac] Contract tests assert `traceparent` presence at each boundary

**Files**:
- Create: `apps/web/src/lib/tracing/context-propagation.ts`
- Modify: `packages/hitl-gateway/src/workflow/hitl-step.ts` (add traceparent to events)
- Modify: `packages/notifications/src/adapters/novu-adapter.ts` (add traceId)
- Modify: `packages/mcp-layer/src/transport/agentkit-adapter.ts` (add traceparent header)
- Create: `apps/web/tests/int-08-trace-context.test.ts`

**Dependencies**: INT-W4, INT-W5

---

#### INT-04: Core SLO Alerts (2 SP)

**Description**: Define and configure the 4 primary SLO alerts.

**Acceptance Criteria**:
- [ac] **Workflow success rate** (S5-W13): Alert fires when success rate < 99% over 5-min window
- [ac] **HITL delivery latency** (S5-W14): Alert fires when P95 > 10s
- [ac] **MCP success rate** (S5-W15): Alert fires when success rate < 99.5%
- [ac] **Audit integrity** (S5-W16): Alert fires on audit completeness gap (DLQ count > threshold)
- [ac] Alerts defined as code (OTel-compatible alert rules)
- [ac] Test-triggered with synthetic failures

**Files**:
- Create: `apps/web/src/lib/observability/slo-alerts.ts`
- Create: `apps/web/tests/int-04-slo-alerts.test.ts`

**Dependencies**: INT-01 (needs running workflow for context)

---

#### INT-07: Documentation (2 SP)

**Description**: Update all documentation for Sprint 5 completion.

**Acceptance Criteria**:
- [ac] WARNINGS_REGISTER.md updated — 19 items marked resolved
- [ac] phase-1-sprint-plan.md Sprint 5 DoD checkboxes updated
- [ac] Runbook updated with new adapter operations (S3, AgentKit)
- [ac] MEMORY.md updated with Sprint 5 deliverables

**Files**:
- Modify: `docs/WARNINGS_REGISTER.md`
- Modify: `docs/06-sprints/phase-1-sprint-plan.md`

**Dependencies**: All tasks complete

---

## 2. Dependency Graph

```
Phase 1 (Days 1-5):
  INT-W1 (Audit adapters, 3SP) ──┬──→ INT-W5 (Inngest reg, 2SP) ──→ INT-01 (E2E, 5SP)
  INT-W2 (Notif adapters, 3SP) ──┤                                     ↑
                                  └──→ INT-W6 (Composition, 2SP) ──────┘
  INT-W3 (S3 adapter, 2SP) ────────────────────────────────────────────↑
  INT-W4 (AgentKit, 2SP) ──────────────────────────────────────────────↑

Phase 2 (Days 5-8):
  INT-01 (E2E Demo, 5SP)     depends on all Phase 1

Phase 3 (Days 6-10, parallel with Phase 2):
  INT-06 (Security, 4SP)     ← independent
  INT-05 (Probes, 2SP)       ← independent
  INT-08 (Traces, 3SP)       ← needs INT-W4, INT-W5
  INT-04 (Alerts, 2SP)       ← needs INT-01
  INT-07 (Docs, 2SP)         ← last
```

**Critical path**: INT-W1 → INT-W5 → INT-W6 → INT-01 → INT-04 → INT-07

---

## 3. Architectural Decisions

### Q1: Drizzle Adapter Location

**Decision**: `packages/database/src/adapters/`

Feature packages stay DB-agnostic with store interfaces. `@aptivo/database` is the only package importing Drizzle. Adapter files implement interfaces from feature packages.

```typescript
// packages/database/src/adapters/audit-store-drizzle.ts
import type { AuditStore } from '@aptivo/audit';
export function createDrizzleAuditStore(db: DrizzleClient): AuditStore { ... }
```

### Q2: Composition Root

**Decision**: `apps/web/src/lib/services.ts`

Single file builds all service instances. API routes and Inngest functions import from here.

```typescript
export const auditService = createAuditService({ store: createDrizzleAuditStore(db), masking });
export const notificationService = createNotificationService({ adapter, preferenceStore, logStore, templateRegistry });
```

### Q3: AuditStore Transaction Pattern

**Decision**: `withTransaction()` wrapper on the adapter.

The Drizzle adapter exposes a `withTransaction()` method. `AuditService.emit()` calls it to wrap the lock → insert → update pipeline in a single DB transaction.

### Q4: Trace Context Mechanism

**Decision**: Payload-level `traceparent` at each async boundary.

No global middleware — each adapter handles propagation. Consistent with the per-adapter dependency injection pattern used throughout.

### Q5: E2E Workflow Structure

**Decision**: Single Inngest function with `step.run()` per subsystem.

Each step returns `Result<T, E>`. Failures are mapped to audit events. HITL pause via `waitForEvent`.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| DB adapters (audit + notification) | 6 | **Commit** | Critical path — nothing works without real stores |
| S3 + AgentKit adapters | 4 | **Commit** | E2E demo needs real transports |
| Inngest + composition root | 4 | **Commit** | Wires everything together |
| E2E demo workflow (INT-01) | 5 | **Commit** | Validates entire platform |
| Security hardening (INT-06) | 4 | **Commit** | 8 WARNING items, production-blocking |
| Runtime hardening (INT-05) | 2 | **Commit** | Deploy-blocking for production |
| Trace context (INT-08) | 3 | **Commit** | 6 WARNING items |
| Core SLO alerts (INT-04) | 2 | **Commit** | 4 WARNING items |
| Documentation (INT-07) | 2 | **Commit** | Sprint completion requirement |
| Admin Dashboard (INT-02) | 5 | **Defer → Sprint 6** | UI — not needed for platform validation |
| LLM Usage Dashboard (INT-03) | 3 | **Defer → Sprint 6** | Reporting — can wait |
| Monitoring extras (LLM spend, retention, notif) | 3 | **Defer → Sprint 6** | Lower priority observability (S2-W12, S4-W10, T1-W23) |

**Committed**: 32 SP | **Deferred**: 11 SP

---

## 5. Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | INT-W1 (3), INT-W5 (2), INT-W6 (2), INT-01 (5), INT-04 (2) | 14 |
| **Web Dev 1** | INT-W3 (2), INT-W4 (2), INT-06 (4), INT-07 (1) | 9 |
| **Web Dev 2** | INT-W2 (3), INT-05 (2), INT-08 (3), INT-07 (1) | 9 |
| **Total** | | **32 SP** |

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Audit transaction adapter complexity | Medium | Medium | Senior dev owns; integration tests with real PG required |
| External SDK issues (AgentKit, S3) | Medium | Low | Feature-flag fallback to in-memory adapters for dev/staging |
| E2E workflow test flakiness | Medium | Low | Use Inngest test engine (`@inngest/test`) for deterministic replay |
| Security middleware regressions | Low | High | Dedicated regression test suite for limits, SSRF, redaction |
| Scope creep from deferred items | Low | Medium | Hard commit to 32 SP; dashboards are Sprint 6 |

---

## 7. Definition of Done

- [ ] Demo workflow: trigger → LLM → HITL → MCP → file → audit *(INT-01)*
- [ ] All store interfaces have Drizzle adapters *(INT-W1, INT-W2)*
- [ ] S3 storage adapter for DO Spaces *(INT-W3)*
- [ ] AgentKit transport adapter for MCP *(INT-W4)*
- [ ] Audit + DLQ + deletion functions registered in Inngest *(INT-W5)*
- [ ] Composition root builds all services with real deps *(INT-W6)*
- [ ] SSRF validation on outbound webhooks *(T1-W27)*
- [ ] Inbound webhook HMAC + body limits enforced *(T1-W28)*
- [ ] Health check info disclosure mitigated *(T1-W29)*
- [ ] PII-safe logging across application *(S2-W2, S2-W3)*
- [ ] API body size/depth limits enforced at gateway *(S1-W11, S1-W12)*
- [ ] Zero-downtime secret rotation documented *(S1-W8)*
- [ ] Readiness/startup probes configured *(S6-W17)*
- [ ] Graceful shutdown with drain period *(S6-W18)*
- [ ] Trace context propagated across all async boundaries *(S7-W24 through S7-W30)*
- [ ] 4 core SLO alerts defined *(S5-W13 through S5-W16)*
- [ ] Documentation complete *(INT-07)*
- [ ] 80%+ test coverage across new code
