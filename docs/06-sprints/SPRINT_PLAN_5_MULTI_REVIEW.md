# Sprint 5 Planning Multi-Model Review

**Date**: 2026-03-10
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (Primary via Pal clink), Codex/GPT (Secondary)
**Task**: Sprint 5 implementation planning — "Wire it all together, lock it down"

---

## Executive Summary

All three models agree Sprint 5 is over-scoped at ~45 SP (33 planned + 12 carry-forward) against ~30 SP capacity. The consensus is to **commit 32-33 SP** of integration-critical and security-critical work, and **defer UI dashboards** (INT-02, INT-03) to Sprint 6.

The critical path is: DB adapters → Inngest registration → composition root → E2E demo workflow. Security hardening runs in parallel during Week 2. Trace context propagation and SLO alerts close out the sprint.

**Overall Verdict: CONSENSUS REACHED** — plan ready for implementation.

---

## Consensus Points (All 3 Models Agreed)

1. **Scope is ~45 SP** — must cut to fit 30 SP capacity
2. **Defer INT-02 (Admin Dashboard, 5 SP) and INT-03 (LLM Dashboard, 3 SP)** — UI reporting is not critical path
3. **DB adapters are critical path** — nothing else works until stores are wired
4. **Drizzle adapters live in `@aptivo/database`** — single package owns DB access
5. **INT-01 (E2E demo) depends on all carry-forward items** completing first
6. **Security hardening (INT-06) is high priority** — 8 WARNING items need closure
7. **Composition root needed** — a central place in `apps/web` that builds services with real deps

---

## Debated Items

### 1. DB Adapter Granularity

**Gemini**: Single 8 SP task for all 7 adapters.
**Codex**: Split into 2 tasks — audit (4 SP) and notification (4 SP).
**Claude (Lead)**: Split into 2 tasks — audit (3 SP) and notification (3 SP). The audit adapters are harder (transaction wrapping for chain-head locking), but each individual adapter is ~50-80 LOC of Drizzle queries.

**Resolution**: **2 tasks, 3 SP each**. Audit adapters are harder but fewer (2 vs 3). Notification adapters are simpler but more numerous.

### 2. INT-05 (Probes + Shutdown) Priority

**Gemini**: Stretch goal (Phase 3).
**Codex**: Committed at 2 SP.
**Claude (Lead)**: Committed at 2 SP. Small effort, high deployment value. DO App Platform needs probe config.

**Resolution**: **Committed** — 2 SP. Deploy-blocking for production readiness.

### 3. INT-08 Trace Context Scope

**Gemini**: Full 5 SP committed in Phase 2.
**Codex**: Reduced to 3 SP.
**Claude (Lead)**: 3 SP — propagate `traceparent` at all 6 boundaries, but defer full OTel span instrumentation to Sprint 6.

**Resolution**: **3 SP** — W3C traceparent propagation only. Full span trees are Sprint 6 scope.

### 4. INT-04 Observability Split

**Gemini**: Full 5 SP as single task.
**Codex**: Core alerts only (2 SP), defer dashboards.
**Claude (Lead)**: Agrees with Codex — 4 primary SLO alerts (2 SP), defer LLM spend dashboard (S2-W12), retention monitoring (S4-W10), and notification monitoring (T1-W23).

**Resolution**: **2 SP** — core alerts only. Dashboard/monitoring extras deferred to Sprint 6.

### 5. External Adapter SP Estimates

**Gemini**: 5 SP combined for AgentKit + S3.
**Codex**: 3 SP (AgentKit) + 3 SP (S3) = 6 SP.
**Claude (Lead)**: 2 SP each = 4 SP. Both are well-understood patterns wrapping external SDKs with existing interfaces.

**Resolution**: **2 SP each** — the interfaces already exist; this is SDK wrapping + error mapping.

---

## Agreed Task Breakdown

### Phase 1: Foundation Wiring (Days 1-5)

| ID | Task | SP | Owner | Dependencies | Key Files |
|----|------|----|-------|--------------|-----------|
| INT-W1 | Audit Drizzle adapters (AuditStore + DlqStore) | 3 | Senior | - | `packages/database/src/adapters/audit-store-drizzle.ts`, `dlq-store-drizzle.ts` |
| INT-W2 | Notification Drizzle adapters (PreferenceStore + DeliveryLogStore + TemplateStore) | 3 | Web Dev 2 | - | `packages/database/src/adapters/notification-*-drizzle.ts` |
| INT-W3 | S3StorageAdapter for DO Spaces | 2 | Web Dev 1 | - | `packages/file-storage/src/storage/s3-adapter.ts` |
| INT-W4 | AgentKitTransportAdapter for MCP | 2 | Web Dev 1 | - | `packages/mcp-layer/src/transport/agentkit-adapter.ts` |
| INT-W5 | Inngest function registration | 2 | Senior | INT-W1 | `apps/web/src/app/api/inngest/route.ts` |
| INT-W6 | Composition root + service wiring | 2 | Senior | INT-W1, INT-W2 | `apps/web/src/lib/services.ts` |

**Phase 1 Total**: 14 SP (all parallel except INT-W5/W6 depend on adapters)

### Phase 2: End-to-End Validation (Days 5-8)

| ID | Task | SP | Owner | Dependencies | Key Files |
|----|------|----|-------|--------------|-----------|
| INT-01 | End-to-end demo workflow | 5 | Senior | INT-W5, INT-W6, INT-W3, INT-W4 | `apps/web/src/lib/workflows/demo-workflow.ts` |

### Phase 3: Hardening (Days 6-10, parallel with Phase 2)

| ID | Task | SP | Owner | Dependencies | Key Files |
|----|------|----|-------|--------------|-----------|
| INT-06 | Security hardening (8 WARNING items) | 4 | Web Dev 1 | - | `apps/web/src/middleware.ts`, `apps/web/src/app/health/` |
| INT-05 | Runtime hardening (probes + shutdown) | 2 | Web Dev 2 | - | `apps/web/src/instrumentation.ts`, DO app spec |
| INT-08 | Trace context propagation (6 boundaries) | 3 | Web Dev 2 | INT-W4, INT-W5 | Adapter files + Inngest payload fields |
| INT-04 | Core SLO alerts (4 alerts) | 2 | Senior | INT-01 | `apps/web/src/lib/observability/` |
| INT-07 | Documentation updates | 2 | All | All | Runbook, sprint plan, WARNING register |

**Phase 3 Total**: 13 SP

### Grand Total: 32 SP (committed)

### Deferred to Sprint 6

| ID | Task | SP | Reason |
|----|------|----|--------|
| INT-02 | Admin Dashboard (Basic) | 5 | UI — not needed for platform validation |
| INT-03 | LLM Usage Dashboard | 3 | Reporting feature — can wait |
| INT-04B | Monitoring extras (LLM spend dash, retention alerts, notification monitoring) | 3 | Lower priority observability items (S2-W12, S4-W10, T1-W23) |

**Deferred Total**: 11 SP

---

## Dependency Graph

```
Phase 1 (Days 1-5):
  INT-W1 (Audit adapters) ──┬──→ INT-W5 (Inngest reg) ──→ INT-01 (E2E Demo)
  INT-W2 (Notif adapters) ──┤                               ↑
                             └──→ INT-W6 (Composition root) ─┘
  INT-W3 (S3 adapter) ──────────────────────────────────────→↑
  INT-W4 (AgentKit adapter) ────────────────────────────────→↑

Phase 2-3 (Days 5-10):
  INT-06 (Security)  ← independent, starts Day 6
  INT-05 (Probes)    ← independent, starts Day 6
  INT-08 (Traces)    ← needs INT-W4, INT-W5
  INT-04 (Alerts)    ← needs INT-01
  INT-07 (Docs)      ← last
```

**Critical path**: INT-W1 → INT-W5 → INT-W6 → INT-01 → INT-04 → INT-07

---

## Architectural Decisions

### Q1: Where do Drizzle adapters live?

**Decision**: `packages/database/src/adapters/`

All Drizzle store adapters in a single package. Each adapter file implements the corresponding store interface from its feature package. Pattern:

```typescript
// packages/database/src/adapters/audit-store-drizzle.ts
import type { AuditStore } from '@aptivo/audit';
import type { DrizzleClient } from '../index.js';

export function createDrizzleAuditStore(db: DrizzleClient): AuditStore {
  return {
    async lockChainHead(scope) {
      // SELECT ... FOR UPDATE within caller's transaction
    },
    async insert(record) { ... },
    async updateChainHead(scope, seq, hash) { ... },
  };
}
```

**Rationale**: Feature packages stay DB-agnostic. `@aptivo/database` is the only package that imports Drizzle. Clean boundary.

### Q2: Composition root pattern

**Decision**: `apps/web/src/lib/services.ts`

Single file creates all service instances with real dependencies:

```typescript
// apps/web/src/lib/services.ts
import { db } from './db.js';
import { createAuditService } from '@aptivo/audit';
import { createDrizzleAuditStore } from '@aptivo/database/adapters';
// ...

const auditStore = createDrizzleAuditStore(db);
export const auditService = createAuditService({ store: auditStore, masking: DEFAULT_MASKING });
export const notificationService = createNotificationService({ ... });
// etc.
```

**Rationale**: Single composition point. API routes and Inngest functions import from here. Testable by replacing with mock services.

### Q3: Trace context propagation mechanism

**Decision**: Payload-level `traceparent` field propagation at each async boundary.

- **Inngest**: Add `traceparent` to event `data` payload; extract in function handler
- **Novu**: Add `traceId` to trigger payload metadata
- **MCP**: Add `traceparent` header to transport request
- **Webhooks**: Add `traceparent` header to outbound payload
- **JWT**: Wrap validation in explicit OTel span

No global middleware — each adapter handles its own propagation. This is consistent with the existing per-adapter pattern.

### Q4: E2E demo workflow shape

**Decision**: Single Inngest function with `step.run()` per subsystem call:

```typescript
inngest.createFunction(
  { id: 'demo/analysis-workflow' },
  { event: 'demo/analysis.requested' },
  async ({ event, step }) => {
    const analysis = await step.run('llm-analyze', () => llmGateway.chat(...));
    const request = await step.run('hitl-request', () => hitlService.createRequest(...));
    const decision = await step.waitForEvent('hitl/decision.submitted', { match: ... });
    const toolResult = await step.run('mcp-action', () => mcpWrapper.execute(...));
    const file = await step.run('store-result', () => fileStorage.upload(...));
    await step.run('audit-trail', () => auditWriter.emit(...));
  }
);
```

### Q5: AuditStore transaction wrapping

**Decision**: Drizzle adapter holds the transaction open across all three calls.

```typescript
async lockChainHead(scope: string) {
  // The caller (AuditService) calls lock → insert → update sequentially.
  // The adapter uses db.transaction() wrapping all three:
  return db.transaction(async (tx) => {
    const head = await tx.select().from(auditChainHeads).where(...).for('update');
    // store tx reference for subsequent insert + updateChainHead calls
  });
}
```

**Note**: This requires the adapter to manage a transaction lifecycle. The cleanest approach is a `withTransaction()` wrapper that the service calls:

```typescript
async emit(input) {
  return store.withTransaction(async (txStore) => {
    const head = await txStore.lockChainHead('global');
    // compute hash
    const record = await txStore.insert(eventWithHash);
    await txStore.updateChainHead('global', record.sequence, record.currentHash);
    return record;
  });
}
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation | Source |
|------|------------|--------|------------|--------|
| Scope overrun (45 SP demand) | High | High | Hard commit to 32 SP; dashboards deferred | All 3 models |
| Audit transaction adapter complexity | Medium | Medium | Senior dev owns; integration tests required | Gemini, Claude |
| External SDK integration issues (AgentKit, S3) | Medium | Low | Feature-flag fallback to in-memory adapters | Codex |
| Trace propagation gaps at wait/resume | Medium | Medium | Contract tests asserting traceparent at each boundary | Codex |
| Security middleware regressions | Low | High | Regression tests for payload limits, SSRF denylist | Codex, Claude |

---

## Owner Allocation

| Developer | Tasks | Total SP |
|-----------|-------|----------|
| **Senior** | INT-W1 (3), INT-W5 (2), INT-W6 (2), INT-01 (5), INT-04 (2) | 14 |
| **Web Dev 1** | INT-W3 (2), INT-W4 (2), INT-06 (4), INT-07 (1) | 9 |
| **Web Dev 2** | INT-W2 (3), INT-05 (2), INT-08 (3), INT-07 (1) | 9 |
| **Total** | | **32 SP** |

---

## Definition of Done (Committed)

- [ ] Demo workflow: trigger → LLM → HITL → MCP → file → audit (INT-01)
- [ ] All store interfaces have Drizzle adapters in `@aptivo/database` (INT-W1, INT-W2)
- [ ] S3 storage adapter for DO Spaces (INT-W3)
- [ ] AgentKit transport adapter for MCP (INT-W4)
- [ ] Audit + DLQ + deletion functions registered in Inngest (INT-W5)
- [ ] Composition root builds all services with real deps (INT-W6)
- [ ] SSRF validation on outbound webhooks (T1-W27)
- [ ] Inbound webhook HMAC + body limits enforced (T1-W28)
- [ ] Health check info disclosure mitigated (T1-W29)
- [ ] PII-safe logging across application (S2-W2, S2-W3)
- [ ] API body size/depth limits enforced at gateway (S1-W11, S1-W12)
- [ ] Zero-downtime secret rotation pattern documented (S1-W8)
- [ ] Readiness/startup probes configured (S6-W17)
- [ ] Graceful shutdown with drain period (S6-W18)
- [ ] Trace context propagated across all async boundaries (S7-W24 through S7-W30)
- [ ] 4 core SLO alerts defined and test-triggered (S5-W13 through S5-W16)
- [ ] Sprint 5 documentation complete (INT-07)
