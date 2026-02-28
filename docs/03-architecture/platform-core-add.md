---
id: ADD-PLATFORM-CORE
title: Platform Core - Application Design Document
status: Draft
version: 2.0.0
owner: '@owner'
last_updated: '2026-02-03'
parent: ../02-requirements/platform-core-frd.md
---

# Platform Core - Application Design Document (ADD)

**Version**: 2.0.0
**Date**: February 3, 2026
**Status**: Draft (Multi-Model Consensus Applied)
**Parent Document**: `../02-requirements/platform-core-frd.md`

---

## 1. Executive Summary

This document defines **HOW** the Aptivo Agentic Core is architected to meet the functional requirements in the Platform Core FRD. It specifies technology selections, architectural patterns, and component interactions for the shared infrastructure serving both Crypto and HR domains.

### 1.1 Document Boundaries

| Document | Scope |
|----------|-------|
| **BRD** | WHY - Business objectives and constraints |
| **FRD** | WHAT - Functional requirements and acceptance criteria |
| **ADD (this)** | HOW - Architecture patterns, technology choices, component design |
| **TSD** | HOW EXACTLY - Database schemas, API specs, deployment configs |

### 1.2 Key Architectural Decisions

> **Multi-Model Consensus (2026-02-02)**: Build unique differentiators, buy commodity infrastructure.

| Decision | Selection | Rationale |
|----------|-----------|-----------|
| Workflow Engine | **Inngest** (Buy) | AgentKit for MCP consumption, step.waitForEvent for HITL |
| AI Reasoning | **LangGraph.js** (inside Inngest) | Runs as activity within workflow steps |
| Identity | **Supabase Auth** (Buy) | 50K MAU free, magic links, saves 2+ months |
| Notifications | **Novu** (Buy) | Multi-channel, templates, quiet hours, saves 3 weeks |
| Runtime | Node.js 24 LTS + TypeScript | Async I/O, strong typing, LangGraph.js compatibility |
| Database | PostgreSQL 16 | ACID compliance, JSONB, full-text search |
| Cache | Redis 7 | Sub-ms latency, pub/sub, rate limiting |
| Audit | Append-only SQL | Phase 1 simplified; hash-chaining deferred to Phase 3+ |

**Build (unique differentiators)**:
- MCP Integration Layer
- HITL Gateway
- LLM Gateway (BRD-mandated cost tracking)

---

## 2. System Architecture Overview

### 2.1 High-Level Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                      DOMAIN APPLICATIONS                         │
├───────────────────────────┬─────────────────────────────────────┤
│     CRYPTO DOMAIN APP     │          HR DOMAIN APP              │
│  • Trading Dashboard      │  • Candidate Pipeline               │
│  • Exchange MCP Tools     │  • Gmail/Calendar MCP               │
│  • aptivo_trading.*       │  • aptivo_hr.*                      │
├───────────────────────────┴─────────────────────────────────────┤
│                     APTIVO AGENTIC CORE                          │
├─────────────────────────────────────────────────────────────────┤
│  Workflow Engine  │  Durable Execution orchestration            │
│  HITL Gateway     │  Human approval with signed tokens          │
│  MCP Layer        │  Universal external API connector           │
│  LLM Gateway      │  Provider routing + cost tracking           │
│  Notification Bus │  Telegram, Email dispatch                   │
│  Audit Service    │  Immutable event logging                    │
│  Identity Service │  Passwordless auth, RBAC                    │
│  File Storage     │  S3-compatible blob service                 │
├─────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE                              │
│  PostgreSQL (separate schemas) │ Redis │ S3/Minio              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Architectural Principles

1. **Durable Execution**: Workflows persist state, survive restarts, sleep without threads
2. **Domain Isolation**: Separate database schemas, separate deployments, separate secrets
3. **Failure Domain Isolation**: Every component declares its failure boundary, blast radius, and isolation mechanisms (see §2.3)
4. **Functional Core, Imperative Shell**: Pure business logic in domain/, side effects in infrastructure/
5. **LLM-Agnostic**: Provider abstraction enables runtime switching
6. **MCP-Based Integration**: Standardized external service access

### 2.3 Failure Domain Map

Every component declares its failure boundary, blast radius, propagation characteristics, isolation mechanisms, and fallback behavior. This section is the authoritative reference for incident triage and recovery prioritization.

> **Phase 1 Reality**: Aptivo runs as a single-region monolith deployment on DigitalOcean App Platform with a shared PostgreSQL instance and a single Redis node. True failure domain isolation (separate databases per domain, multi-region DR) is a Phase 2+ capability. Phase 1 relies on logical isolation (schema separation, circuit breakers, timeout paths) and documented degradation behavior.

#### 2.3.1 Component Criticality Classification

| Tier | Definition | Recovery Priority | Components |
|------|-----------|-------------------|------------|
| **Critical** | Failure causes platform-wide outage, data corruption risk, or compliance violation | Immediate (SEV-1/SEV-2) | Workflow Engine, HITL Gateway, Identity Service, Audit Service, PostgreSQL, Redis, DO App Platform |
| **Standard** | Failure causes feature degradation; core platform continues operating | High (SEV-2/SEV-3) | MCP Integration Layer, LLM Gateway, Notification Bus, File Storage, BullMQ |
| **Non-critical** | Failure is tolerable for extended periods | Normal (SEV-3/SEV-4) | — (all Phase 1 components are standard or critical) |

#### 2.3.2 Failure Domain Matrix

##### Workflow Engine (Inngest) — Critical

| Field | Value |
|-------|-------|
| **Failure Domain** | Workflow execution boundary. Owns durable workflow state (Inngest-managed). Shares PostgreSQL for application data. Depends on Inngest Cloud for scheduling, event routing, and step execution. |
| **Blast Radius** | All active workflows pause; new workflows cannot be triggered; HITL `waitForEvent` correlations stop processing; scheduled timers do not fire. Domain applications (HR, Crypto) that rely on workflow orchestration are fully blocked. API endpoints for workflow management return errors. Components NOT affected: Identity Service, direct API reads, health checks. |
| **Propagation Mode** | Both (sync for API-triggered workflows, async for event-triggered and timer-based) |
| **Propagation Outcome** | Degraded (contained by Inngest durable state — workflows resume from last successful step on recovery). Potential for cascading if recovery takes longer than HITL TTLs. |
| **Impacted Components** | HITL Gateway, MCP Integration Layer, LLM Gateway, Notification Bus (workflow-triggered), Audit Service (workflow audit events), all domain workflows |
| **Isolation Mechanisms** | Inngest memoization prevents duplicate step execution on replay; durable state persistence allows crash recovery; individual step failures do not fail the entire workflow (step-level retry with configurable policy). Inngest Cloud self-hosting available as DR option. |
| **Fallback Behavior** | Workflows resume automatically from last successful step when engine recovers. HITL requests that exceed TTL during outage follow the TIMEOUT error path. No new workflow execution until recovery. |

##### HITL Gateway — Critical

| Field | Value |
|-------|-------|
| **Failure Domain** | Approval processing boundary. Owns HITL request/decision tables in PostgreSQL `public` schema. Depends on Notification Bus for approval delivery, Workflow Engine for `waitForEvent` correlation. |
| **Blast Radius** | All workflows requiring human approval stall in SUSPENDED state. Business processes gated by approval (trade execution, hiring decisions, contract approvals) are blocked. Components NOT affected: workflows without HITL steps, API reads, notification delivery for non-HITL events. |
| **Propagation Mode** | Sync (approval endpoints block caller until response; workflow suspends synchronously) |
| **Propagation Outcome** | Degraded — workflows auto-resume via TIMEOUT error path after configurable TTL (default 24h–7d per policy). Does not cascade beyond approval-gated workflows. |
| **Impacted Components** | Workflow Engine (suspended workflows), Notification Bus (pending approval notifications), approver-facing clients |
| **Isolation Mechanisms** | Signed JWT approval tokens (self-contained, verifiable without HITL service for read-only validation); idempotent decision recording (duplicate submissions safe); configurable TTL auto-resume prevents indefinite suspension; race condition guards on concurrent approvals. |
| **Fallback Behavior** | Workflows auto-resume with TIMEOUT error path if no decision received within TTL. Approvers can retry via token link once service recovers. Pending decisions are durable in PostgreSQL. |

##### MCP Integration Layer — Standard

| Field | Value |
|-------|-------|
| **Failure Domain** | External tool integration boundary. Per-tool isolation via circuit breaker composition. Shares Redis for idempotency keys and rate-limit queue (BullMQ). |
| **Blast Radius** | Limited — individual tool failures affect only the calling workflow step; other tools and workflows continue. If the entire MCP layer is down, all external tool calls fail but core platform (HITL, auth, audit) continues. |
| **Propagation Mode** | Both (sync for direct tool calls within workflow steps, async for rate-limited queued requests via BullMQ) |
| **Propagation Outcome** | Degraded — workflows receive explicit `service-unavailable` signal and can follow error paths. Unavailable MCP servers are flagged at startup but do not prevent system boot. |
| **Impacted Components** | Workflow Engine (steps waiting on MCP calls), domain workflows using external tools |
| **Isolation Mechanisms** | Circuit breaker (cockatiel: 5 consecutive failures → open, 30s half-open test, 10s timeout) + retry (3 attempts, exponential backoff) composition per tool; per-tool rate limits with BullMQ queueing instead of rejection; idempotency keys in Redis prevent duplicate side-effecting calls; schema validation rejects malformed responses. |
| **Fallback Behavior** | Workflow receives explicit error signal; can retry, skip, or follow error path. Rate-limited requests queue in BullMQ and drain when capacity is available. |

##### LLM Gateway — Standard

| Field | Value |
|-------|-------|
| **Failure Domain** | LLM provider abstraction boundary. No shared state except PostgreSQL for usage logging. |
| **Blast Radius** | Limited — AI-powered workflow steps fail or degrade. Core platform operations (HITL, MCP non-AI calls, auth, audit) are unaffected. Budget exhaustion blocks all LLM calls for the affected domain. |
| **Propagation Mode** | Sync (workflow steps block on LLM response) |
| **Propagation Outcome** | Degraded — provider fallback (primary → secondary on 429/5xx); budget enforcement returns explicit error; Inngest memoization prevents duplicate LLM calls on workflow replay. |
| **Impacted Components** | Workflow Engine (AI-dependent steps), domain workflows using LLM reasoning |
| **Isolation Mechanisms** | Provider-agnostic interface enables runtime switching; budget guardrails (daily/monthly caps) prevent runaway costs; Inngest step memoization deduplicates on replay. |
| **Fallback Behavior** | Automatic retry with backup provider on transient failures. Budget exceeded returns `Result.err` with `DAILY_BUDGET_EXCEEDED` or `MONTHLY_BUDGET_EXCEEDED`. Workflow can handle via error path. |

##### Notification Bus (Novu) — Standard

| Field | Value |
|-------|-------|
| **Failure Domain** | Notification delivery boundary. Depends on Novu Cloud (Phase 1) for channel routing and delivery. No shared state with other components except receiving events from Workflow Engine and HITL Gateway. |
| **Blast Radius** | Notification delivery delayed or lost. HITL approval notifications are most impactful — approvers may not know they have pending approvals, causing workflows to timeout at TTL. Non-HITL notifications (status updates, alerts) are delayed but not business-critical. Core platform operations continue. |
| **Propagation Mode** | Async (fire-and-forget from caller perspective; Novu handles delivery retries internally) |
| **Propagation Outcome** | Degraded — notification delivery fails silently from platform perspective. HITL workflows degrade to TTL timeout path. |
| **Impacted Components** | HITL Gateway (approval notification delivery), users (miss alerts), domain workflows (notification steps) |
| **Isolation Mechanisms** | Novu internal retry logic; `transactionId` deduplication for critical notifications; priority routing (critical notifications get preferred delivery). Phase 2: self-hosted Novu option. |
| **Fallback Behavior** | Phase 1: No fallback — Novu is single notification path. HITL workflows fall back to TTL timeout. Phase 2: Consider direct SMTP fallback for critical HITL notifications; in-app notification as secondary channel. |

##### Audit Service — Critical

| Field | Value |
|-------|-------|
| **Failure Domain** | Compliance logging boundary. Owns `audit_logs` table in PostgreSQL `public` schema. Audit writes are currently **synchronous** (`await auditService.log()`) in critical paths including HITL decision recording, file access, and retention enforcement. |
| **Blast Radius** | If audit writes slow or fail: HITL decision recording blocks (approvals delayed), file access logging blocks (downloads delayed), retention enforcement stalls. Audit table lock contention or disk pressure can transitively degrade all audit-emitting components. |
| **Propagation Mode** | Sync (audit writes are `await`-ed inline in calling components) |
| **Propagation Outcome** | Degraded — audit failures should not cascade to data corruption, but **currently risk blocking critical paths** due to synchronous writes. Must be addressed. |
| **Impacted Components** | HITL Gateway (decision audit), File Storage (access audit), Workflow Engine (workflow audit events), Identity Service (role change audit) |
| **Isolation Mechanisms** | Append-only SQL with idempotent inserts (deterministic IDs prevent duplicates on retry); `REVOKE UPDATE, DELETE` on `audit_logs` table enforces immutability. **Gap**: No timeout or async decoupling on audit writes — a slow audit insert blocks the caller. |
| **Fallback Behavior** | Phase 1: Audit write failure propagates to caller as error. **Recommended**: Add write timeout (500ms) with dead-letter queue for failed audit entries; retry via background job. This preserves compliance (no silent drops) while decoupling audit latency from critical paths. |

##### Identity Service (Supabase Auth) — Critical

| Field | Value |
|-------|-------|
| **Failure Domain** | Authentication and authorization boundary. Depends on Supabase Auth Cloud for session management, magic link delivery, and OAuth flows. Application-layer RBAC uses PostgreSQL `public` schema tables. |
| **Blast Radius** | **Platform-wide for authenticated operations.** All API endpoints requiring `BearerAuth` (all except health checks, magic-link request, auth callback, inbound webhooks) return 401/503. Users cannot log in. Approvers cannot submit HITL decisions via authenticated endpoints. Workflow management APIs unavailable. |
| **Propagation Mode** | Sync (every authenticated request validates JWT against Supabase) |
| **Propagation Outcome** | Degraded with Phase 1 mitigation, potentially cascading without JWKS caching. See isolation mechanisms. |
| **Impacted Components** | All authenticated API endpoints, HITL Gateway (approver authentication), RBAC enforcement, workflow management APIs |
| **Isolation Mechanisms** | JWT tokens are self-contained — **JWKS public keys should be cached locally** with a TTL of 1 hour and stale-if-error of 24 hours. During Supabase outage, already-authenticated sessions continue working with cached JWKS validation. New logins and token refresh require live Supabase connection. Exit strategy: standard OIDC/JWT tokens enable migration to Keycloak/Authentik (ADD §8.1). |
| **Fallback Behavior** | With JWKS caching: existing sessions continue for up to 24h (stale key grace period). New login attempts fail with user-friendly "Authentication service temporarily unavailable" message. HITL approval tokens (signed JWTs) can be validated locally without Supabase. Without JWKS caching: all authenticated endpoints fail immediately. |

##### File Storage (S3/Minio + ClamAV) — Standard

| Field | Value |
|-------|-------|
| **Failure Domain** | File management boundary. Depends on S3-compatible object storage (Minio/DO Spaces) for binary data and PostgreSQL for file metadata. ClamAV for malware scanning. |
| **Blast Radius** | File upload, download, and link operations fail. Workflows requiring document attachments (HR contracts, resumes) degrade. Audit export downloads fail. Core platform operations (workflows without files, HITL, auth) continue. |
| **Propagation Mode** | Async (file operations are typically workflow steps, not blocking API-level) |
| **Propagation Outcome** | Degraded — file-dependent workflow steps fail; non-file workflows continue. |
| **Impacted Components** | File-dependent workflow steps, audit export downloads, malware scanning flow |
| **Isolation Mechanisms** | Metadata/binary separation (PostgreSQL metadata survives object storage failure); scan status uses upsert (idempotent); S3 delete is inherently idempotent. |
| **Fallback Behavior** | File upload returns error; workflow step follows error path. Existing file metadata remains accessible even if binary storage is down. ClamAV unavailability: files flagged as `scan_pending` and quarantined until scanner recovers. |

##### PostgreSQL Database — Critical (Shared Infrastructure)

| Field | Value |
|-------|-------|
| **Failure Domain** | **Shared infrastructure — single failure domain for entire platform in Phase 1.** Single managed PostgreSQL instance hosts `public` schema (core platform), `aptivo_hr` schema, and `aptivo_trading` schema. Schema separation provides data isolation but NOT failure isolation. |
| **Blast Radius** | **Total platform outage.** All components using PostgreSQL become unavailable: Workflow Engine (application data), HITL Gateway (request/decision tables), Audit Service (audit_logs), Identity Service (RBAC tables), File Storage (metadata), LLM Gateway (usage logs). Only stateless health checks (`/health/live`) continue responding. |
| **Propagation Mode** | Sync (all database queries are synchronous from caller perspective) |
| **Propagation Outcome** | **Cascading** — database failure propagates synchronously to all callers. No component can operate independently of PostgreSQL in Phase 1. |
| **Impacted Components** | All platform components (Workflow Engine, HITL Gateway, Audit Service, Identity Service, File Storage, LLM Gateway, domain applications) |
| **Isolation Mechanisms** | **Phase 1**: Schema isolation (logical separation only); connection pooling via managed database; automated daily backups (RPO < 24h). **Phase 2+**: HA-tier managed database with standby failover; connection pool per schema/domain to prevent pool exhaustion cascade; statement timeouts per domain. |
| **Fallback Behavior** | Phase 1: Application reconnects automatically when database recovers. Restore from backup if unrecoverable (RTO < 4h, RPO < 24h). Phase 2+: Automatic failover to standby via connection pooler. |

> **Accepted Risk (Phase 1)**: PostgreSQL is a single point of failure. All domains share one instance. Mitigation: managed daily backups, health monitoring, and documented recovery playbook (RUNBOOK §8.5). Phase 2 upgrade path: HA-tier database with standby nodes, connection pool isolation per schema.

##### Redis Cache — Critical (Shared Infrastructure)

| Field | Value |
|-------|-------|
| **Failure Domain** | **Shared infrastructure — affects multiple unrelated concerns.** Single Basic-tier Redis instance serves: MCP idempotency keys, rate-limit queueing (BullMQ), webhook deduplication, session cache. |
| **Blast Radius** | MCP idempotency checks fail (risk of duplicate side-effecting tool calls including financial operations); rate-limited requests cannot be queued (rejected instead of queued); webhook deduplication fails (duplicate processing); BullMQ job queue halts. Core platform operations that don't depend on Redis (direct API calls, HITL approval recording, audit writes) continue. |
| **Propagation Mode** | Sync (Redis operations are synchronous from caller perspective) |
| **Propagation Outcome** | **Degraded with data integrity risk.** Most consumers can tolerate temporary Redis unavailability with degraded behavior, but MCP idempotency loss can cause duplicate financial operations. |
| **Impacted Components** | MCP Integration Layer (idempotency, rate limiting), BullMQ workers (rate-limited requests, outbound webhooks), webhook deduplication, session performance |
| **Isolation Mechanisms** | **Phase 1**: Logical database separation — use separate Redis databases (SELECT 0–3) or key prefix namespacing for different concerns: `idem:*` for idempotency, `rl:*` for rate limiting, `dedup:*` for webhook deduplication, `sess:*` for sessions. Memory policy: `allkeys-lru` with monitoring for eviction pressure. **Phase 2+**: Separate Redis instances for job queues vs. cache. |
| **Fallback Behavior** | **Per-consumer degradation policy**: (1) MCP idempotency: **fail-closed** — reject tool calls when idempotency cannot be verified (prevents duplicate financial operations); (2) Rate limiting: **fail-open** — allow requests without rate limiting (temporary burst acceptable); (3) Webhook dedup: **fail-open** — process webhooks without dedup (handlers are idempotent); (4) Session cache: **fail-open** — fall back to database session lookup (slower but functional). |

> **Accepted Risk (Phase 1)**: Single Redis node. BullMQ job accumulation could cause OOM affecting all Redis consumers. Mitigation: memory limit monitoring, key TTL enforcement, consumer-specific degradation policies documented above.

##### DigitalOcean App Platform — Critical (Infrastructure)

| Field | Value |
|-------|-------|
| **Failure Domain** | **Platform infrastructure boundary.** Single-region deployment on DigitalOcean App Platform. All containers (API, workers) run in one region. |
| **Blast Radius** | **Total platform outage** on regional failure. All API endpoints, workflow workers, and background jobs unavailable. |
| **Propagation Mode** | Sync (infrastructure failure immediately affects all hosted services) |
| **Propagation Outcome** | **Cascading** — regional outage takes down all services simultaneously. |
| **Impacted Components** | All services and infrastructure |
| **Isolation Mechanisms** | Health checks (liveness, readiness, startup probes) trigger container restarts for individual container failures; rolling deployment with rollback; auto-scaling 1–3 containers. These mitigate container-level failures but not regional outages. |
| **Fallback Behavior** | Container failure: automatic restart via health checks. Regional outage: restore to alternate region manually (RTO < 4h per RUNBOOK §8.6). Feature flags for instant rollback of new functionality. Phase 2+: multi-region DR with DNS failover. |

##### BullMQ (Job Queue) — Standard

| Field | Value |
|-------|-------|
| **Failure Domain** | Job queue processing boundary. Depends entirely on Redis for job storage and coordination. |
| **Blast Radius** | Rate-limited MCP requests stop draining; outbound webhook delivery halts. Does not affect synchronous API operations or direct workflow execution. |
| **Propagation Mode** | Async (jobs are enqueued and processed asynchronously) |
| **Propagation Outcome** | Degraded — queued work stalls but does not affect non-queued operations. Jobs resume when Redis recovers. |
| **Impacted Components** | MCP rate-limited request processing, outbound webhook delivery |
| **Isolation Mechanisms** | Job deduplication by `jobId`; inherits Redis availability. |
| **Fallback Behavior** | Jobs remain in Redis and resume processing when BullMQ workers reconnect. No data loss for enqueued jobs (Redis persistence). |

---

## 3. Workflow Engine Architecture

**FRD Reference**: FR-CORE-WFE-001 to FR-CORE-WFE-007
**Pattern**: Durable Execution

### 3.1 Technology Selection

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Inngest** | TypeScript-native, AgentKit for MCP, step.waitForEvent for HITL | Source-available (Elastic License); self-hosting supported | **Selected** |
| **Trigger.dev** | Open source, warm starts | MCP exposes server only, no consumption | Not selected |
| **Temporal.io** | Production-proven, full durable execution | Heavy infrastructure, Java SDK primary | Consider for scale |

**Decision**: **Inngest** selected as Platform Core Workflow Engine.

> **Verified (2026-02-26)**: AgentKit MCP consumption confirmed at [agentkit.inngest.com](https://agentkit.inngest.com/advanced-patterns/mcp). `step.waitForEvent()` confirmed at [inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event). Self-hosting available at [inngest.com/docs/self-hosting](https://www.inngest.com/docs/self-hosting). Pricing at [inngest.com/pricing](https://www.inngest.com/pricing).

**Rationale** (Multi-Model Consensus 2026-02-02):
1. **MCP Consumption**: AgentKit natively supports calling external MCP servers (required for 13+ crypto integrations)
2. **HITL Pattern**: `step.waitForEvent()` is industry standard for approval gates
3. **Operational Velocity**: No separate worker fleet (critical for 3-dev team)
4. **AI Integration**: LangGraph runs cleanly inside `step.run()` activities

> **LangGraph.js Clarification**: LangGraph.js runs **inside Inngest `step.run()` activities** for AI reasoning tasks (sentiment analysis, narrative clustering). Inngest owns orchestration, state, timers, and retries. LangGraph provides cognitive capabilities within individual workflow steps only.

### 3.2 Inngest SDK Usage (Direct, No Abstraction)

> **Multi-Model Consensus**: Do NOT build custom workflow abstractions on top of Inngest. Use Inngest SDK directly to avoid "platform within a platform" complexity.

```typescript
// direct inngest function definition (Phase 1)
import { inngest } from './client';

export const smartMoneyWorkflow = inngest.createFunction(
  { id: 'smart-money-tracking', name: 'Smart Money Tracking' },
  { event: 'crypto/wallet.transaction' },
  async ({ event, step }) => {
    // step 1: analyze transaction
    const analysis = await step.run('analyze-transaction', async () => {
      return analyzeTransaction(event.data);
    });

    // step 2: run langgraph reasoning (AI activity)
    const reasoning = await step.run('generate-reasoning', async () => {
      return runLangGraphAnalysis(analysis); // langgraph runs HERE
    });

    // step 3: check if signal worthy
    if (reasoning.confidenceScore < 7) {
      return { skipped: true, reason: 'low_confidence' };
    }

    // step 4: create HITL approval request
    const approval = await step.waitForEvent('hitl-approval', {
      event: 'hitl/decision',
      match: 'data.requestId',
      timeout: '24h',
    });

    if (!approval || approval.data.decision !== 'approved') {
      return { skipped: true, reason: 'not_approved' };
    }

    // step 5: execute trade
    return await step.run('execute-trade', async () => {
      return executeTrade(event.data, reasoning);
    });
  }
);

> **Inngest Serve Endpoint Security**: The Inngest SDK serves an HTTP endpoint (typically `/api/inngest`) that receives events from Inngest Cloud. This endpoint MUST be protected with `INNGEST_SIGNING_KEY` validation — the SDK rejects unsigned requests when this key is configured. See §14.8 for the full threat model.

### 3.3 Inngest Idempotency Guarantees

**Scope**: This section documents which operations are protected by Inngest's built-in idempotency (memoization) and which require additional application-level handling.

#### 3.3.1 Operations Protected by Inngest Memoization

| Operation | Idempotency Mechanism | Behavior on Replay |
|-----------|----------------------|-------------------|
| `step.run()` activities | Step ID memoization | Returns cached result |
| `step.sleep()` timers | Timer state persistence | Skips if already elapsed |
| `step.waitForEvent()` | Event correlation | Returns cached event |
| Local variable assignment | Workflow state persistence | Restored from snapshot |

**How It Works**: When a workflow step completes, Inngest persists the result. If the workflow restarts (server crash, deployment), Inngest replays the workflow but skips already-completed steps, returning their cached results.

**Example**:
```typescript
// this entire function can be replayed safely
export const exampleWorkflow = inngest.createFunction(
  { id: 'example' },
  { event: 'example/trigger' },
  async ({ event, step }) => {
    // step 1: memoized - only executes once
    const data = await step.run('fetch-data', async () => {
      return fetchExternalAPI(event.data.id); // only called once
    });

    // step 2: memoized - only executes once
    const processed = await step.run('process-data', async () => {
      return processData(data); // only called once
    });

    // step 3: if crash happens here, steps 1 and 2 are NOT re-executed
    await step.run('save-result', async () => {
      return saveToDatabase(processed); // only called once
    });
  }
);
```

#### 3.3.2 Operations Requiring Application-Level Idempotency

| Operation | Why Not Covered | Required Handling |
|-----------|-----------------|-------------------|
| Inbound webhook triggers | Before workflow starts | Deduplicate webhook IDs (see §12.3) |
| HITL approval endpoints | External to workflow | Check request status (see §4.5) |
| Audit log writes | Inside step.run but generates new UUID | Use deterministic IDs (see §9.3) |
| MCP tool calls with side effects | External system may not support replay | Pass idempotency key (see §5.1) |
| Notification sends | External system (Novu) | Novu handles; document behavior |

**Key Insight**: Inngest protects workflow-internal operations. Operations that cross trust boundaries (external APIs, webhooks, databases with non-deterministic IDs) require explicit idempotency handling at the application layer.

#### 3.3.3 Event Deduplication

Inngest supports event-level deduplication via the `id` field:

```typescript
// event with idempotency key
await inngest.send({
  id: `webhook:${sourceId}:${webhookId}`, // dedupe key
  name: 'webhook/received',
  data: { sourceId, webhookId, payload },
});

// duplicate events with same ID are ignored
```

**Window**: Event deduplication window is 24 hours (Inngest default).

### 3.4 Durable Timer Implementation

```typescript
// sleep without consuming resources (FR-CORE-WFE-003)
async function durableSleep(duration: Duration): Promise<void> {
  // persists wake time to database
  // releases worker
  // scheduler resumes at wake time
  await workflow.sleep(duration);
}

// usage in workflow
async function interviewSchedulingWorkflow(ctx: Context) {
  await sendInterviewProposal(ctx);

  // sleep 24 hours for reminder - no thread consumed
  await durableSleep({ hours: 24 });

  await sendReminder(ctx);
}
```

### 3.4 Retry and Compensation

```typescript
// exponential backoff pattern (FR-CORE-WFE-005)
const retryPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialInterval: '1s',
  backoffCoefficient: 2,
  maxInterval: '30s',
  nonRetryableErrors: ['VALIDATION_ERROR', 'AUTH_ERROR'],
};

// compensation for rollback
async function transferFunds(ctx: Context) {
  const debit = await debitAccount(ctx.from, ctx.amount);

  try {
    await creditAccount(ctx.to, ctx.amount);
  } catch (error) {
    // compensation: reverse the debit
    await creditAccount(ctx.from, ctx.amount);
    throw error;
  }
}
```

### 3.5 Workflow Data Ownership

#### Workflow Definitions

| Field | Value |
|-------|-------|
| **Owner** | Workflow Management API (single writer) |
| **Source of Truth** | PostgreSQL `public.workflow_definitions` table (see TSD `database.md` §3.1) |
| **Write Access** | Single-owner — all CRUD via `/api/v1/workflows` endpoints. Inngest reads definitions at execution time. |
| **Conflict Resolution** | Optimistic concurrency via `version` column. UPDATE with `WHERE version = expected` prevents stale overwrites. |
| **Handoff** | API writes definition → Inngest runtime reads on workflow trigger. No async sync required — Inngest functions are code-defined, referencing definition data at step execution time. |

#### Workflow Execution State (Inngest ↔ PostgreSQL Bridge)

| Field | Value |
|-------|-------|
| **Authoritative Owner** | Inngest Cloud (durable execution runtime). Inngest owns step execution order, memoization, timer state, and event correlation. |
| **Queryable Projection** | PostgreSQL `public.workflow_executions` table (see TSD `database.md` §3.2). This is an application-layer projection of Inngest state for API queryability. |
| **Sync Mechanism** | Inngest lifecycle events update the projection: workflow started → INSERT; step completed → UPDATE stepResults; workflow completed/failed → UPDATE status + completedAt. Updates are idempotent (upsert on execution ID). |
| **Which Is Authoritative?** | **Inngest is authoritative for execution state.** The PostgreSQL table is a read-optimized projection. In case of divergence, Inngest state wins. The API reads from PostgreSQL for list/search queries and from Inngest for detailed step-level debugging. |
| **Conflict Resolution** | Single-owner (Inngest). PostgreSQL projection writes are event-driven and idempotent — no concurrent write conflicts possible. |

#### Feature Flag State

| Field | Value |
|-------|-------|
| **Owner** | Application configuration layer (code-defined) |
| **Source of Truth** | Code-defined `FEATURE_FLAGS` array with environment variable overrides (see TSD `configuration.md` §5) |
| **Write Access** | Phase 1: Static code definition + env var override at deployment. Runtime toggling via env var change + container restart. |
| **Propagation** | All containers read flags from process environment on startup. Changes require redeployment or env var update + restart. No runtime propagation delay — flags are read synchronously from memory. |
| **Consistency** | Strongly consistent within a container. During rolling deployment, containers may briefly disagree (old vs. new flag values). This window is bounded by deployment duration (< 5 minutes). |

> **Phase 1 Reality**: Feature flags are compile-time constants with env var escape hatches, not a runtime feature flag service. RUNBOOK §2.4 "feature flag management" refers to environment variable toggling and deployment-gated rollouts. A dedicated feature flag service (LaunchDarkly, Unleash, etc.) is a Phase 2+ consideration if runtime percentage rollouts are needed without redeployment.

---

## 4. HITL Gateway Architecture

**FRD Reference**: FR-CORE-HITL-001 to FR-CORE-HITL-006

### 4.1 Approval Token Design

```typescript
interface HITLRequest {
  id: string;                    // unique request ID
  workflowId: string;            // parent workflow
  token: string;                 // cryptographically signed
  payload: ApprovalPayload;      // what's being approved
  expiresAt: Date;               // auto-reject after
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  channels: NotificationChannel[];
}

interface ApprovalPayload {
  actionType: string;            // e.g., 'trade_execution', 'contract_approval'
  summary: string;               // human-readable
  details: Record<string, unknown>;
  reasoning?: string;            // AI-generated explanation
}
```

### 4.2 Token Security

```typescript
// JWT-based signed tokens (jose library)
import { SignJWT, jwtVerify } from 'jose';

async function generateApprovalToken(request: HITLRequest): Promise<string> {
  const secret = new TextEncoder().encode(process.env.HITL_SECRET);

  return new SignJWT({
    requestId: request.id,
    workflowId: request.workflowId,
    action: request.payload.actionType,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(request.expiresAt)
    .sign(secret);
}

async function verifyApprovalToken(token: string): Promise<HITLRequest> {
  const secret = new TextEncoder().encode(process.env.HITL_SECRET);
  const { payload } = await jwtVerify(token, secret);
  // validate not expired, not already used
  return await getRequest(payload.requestId);
}
```

### 4.3 Multi-Channel Delivery

```
┌─────────────┐
│ HITL Request│
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│           Notification Bus               │
├─────────────┬─────────────┬─────────────┤
│   Telegram  │    Email    │  Web Push   │
│   (urgent)  │  (standard) │  (optional) │
└─────────────┴─────────────┴─────────────┘
```

### 4.4 Approval Policy Engine

**FRD Reference**: FR-CORE-HITL-004

```typescript
// approval policy configuration
interface ApprovalPolicy {
  type: 'single' | 'multi' | 'sequential';
  approvers: ApproverSpec[];
  quorum?: number;           // for multi: how many must approve
  expiryTTL: Duration;       // auto-reject after
  escalation?: EscalationPolicy;
}

interface ApproverSpec {
  type: 'user' | 'role' | 'group';
  id: string;
  required?: boolean;        // for sequential: must approve in order
}

// policy evaluation
async function evaluateApproval(
  request: HITLRequest,
  decisions: Decision[]
): Promise<'pending' | 'approved' | 'rejected'> {
  const policy = request.policy;

  if (policy.type === 'single') {
    return decisions.length > 0 ? decisions[0].outcome : 'pending';
  }

  if (policy.type === 'multi') {
    const approvals = decisions.filter(d => d.outcome === 'approved');
    if (approvals.length >= policy.quorum!) return 'approved';
    const rejections = decisions.filter(d => d.outcome === 'rejected');
    if (rejections.length > (policy.approvers.length - policy.quorum!)) return 'rejected';
    return 'pending';
  }

  // sequential: each required approver must approve in order
  // ... implementation
}
```

### 4.5 HITL API Endpoints

**FRD Reference**: FR-CORE-HITL-005

#### 4.5.1 Idempotent Approval Handling

**Idempotency Guarantee**: Approving an already-approved request returns success without side effects.

**Mechanism**: Check `request.status` before processing; return existing decision if already resolved.

**Duplicate Behavior**:
| Current Status | Action | Response |
|----------------|--------|----------|
| `pending` | Process approval | 200 OK with new decision |
| `approved` | Return existing | 200 OK with `idempotent: true` |
| `rejected` | Conflict | 409 Conflict (cannot change) |
| `expired` | Gone | 410 Gone |

**Retry Sources Considered**:
- User double-click on approve button
- Network retry on timeout
- Mobile app background retry
- Telegram/email link clicked multiple times

**Rationale**: Prevents user confusion; safe for retry at any layer.

```typescript
// idempotent RESTful endpoints for approval actions
router.post('/api/v1/hitl/:requestId/approve', authenticate, async (req, res) => {
  const { requestId } = req.params;
  const { token, comment } = req.body;

  // verify token matches request and is not expired
  const request = await verifyApprovalToken(token);

  // idempotency check: handle already-resolved requests
  if (request.status === 'approved') {
    // idempotent success: return existing decision without side effects
    const existingDecision = await db.hitlDecisions.findByRequestId(requestId);
    logger.info({ requestId, approver: req.user.id }, 'Duplicate approval attempt - returning cached');
    return res.json({
      status: 'approved',
      idempotent: true,
      originalDecision: {
        approver: existingDecision.approver,
        timestamp: existingDecision.timestamp,
        comment: existingDecision.comment,
      },
    });
  }

  if (request.status === 'rejected') {
    // cannot change a rejection to approval
    return res.status(409).json({
      error: 'DECISION_CONFLICT',
      message: 'Request was already rejected and cannot be approved',
      existingStatus: 'rejected',
    });
  }

  if (request.status === 'expired') {
    return res.status(410).json({
      error: 'REQUEST_EXPIRED',
      message: 'Approval request has expired',
      expiredAt: request.expiresAt,
    });
  }

  // record decision with audit trail (idempotent via requestId constraint)
  // returns { inserted: boolean } to prevent race condition double-signal
  const result = await recordDecision(requestId, {
    decision: 'approved',
    approver: req.user.id,
    comment,
    timestamp: new Date(),
    channel: req.headers['x-approval-channel'] || 'web',
  });

  // CRITICAL: only signal if we actually inserted the decision
  // prevents race condition where two requests both pass status check
  if (result.inserted) {
    await workflowEngine.signal(request.workflowId, 'approval', { approved: true });
  } else {
    // another request won the race - return idempotent success
    logger.info({ requestId }, 'Decision race detected - returning idempotent success');
    return res.json({ status: 'approved', idempotent: true, raceResolved: true });
  }

  res.json({ status: 'approved' });
});

router.post('/api/v1/hitl/:requestId/reject', authenticate, async (req, res) => {
  const { requestId } = req.params;
  const { token, reason } = req.body;

  const request = await verifyApprovalToken(token);

  // idempotency check
  if (request.status === 'rejected') {
    const existingDecision = await db.hitlDecisions.findByRequestId(requestId);
    return res.json({
      status: 'rejected',
      idempotent: true,
      originalDecision: {
        approver: existingDecision.approver,
        timestamp: existingDecision.timestamp,
        reason: existingDecision.comment,
      },
    });
  }

  if (request.status === 'approved') {
    return res.status(409).json({
      error: 'DECISION_CONFLICT',
      message: 'Request was already approved and cannot be rejected',
      existingStatus: 'approved',
    });
  }

  if (request.status === 'expired') {
    return res.status(410).json({
      error: 'REQUEST_EXPIRED',
      message: 'Approval request has expired',
    });
  }

  const result = await recordDecision(requestId, {
    decision: 'rejected',
    approver: req.user.id,
    comment: reason,
    timestamp: new Date(),
    channel: req.headers['x-approval-channel'] || 'web',
  });

  // only signal if we actually inserted (prevent race double-signal)
  if (result.inserted) {
    await workflowEngine.signal(request.workflowId, 'approval', { approved: false, reason });
  } else {
    return res.json({ status: 'rejected', idempotent: true, raceResolved: true });
  }

  res.json({ status: 'rejected' });
});

router.post('/api/v1/hitl/:requestId/request-changes', authenticate, async (req, res) => {
  // records request for more info, does not resolve workflow
  // idempotent: multiple change requests are allowed and logged
});
```

### 4.6 HITL Audit Integration

**FRD Reference**: FR-CORE-HITL-006

#### 4.6.1 Idempotent Decision Recording

**Idempotency Guarantee**: Each decision is recorded exactly once per request.

**Mechanism**:
- Decision uses `requestId` as natural idempotency key
- INSERT uses `ON CONFLICT (request_id) DO NOTHING`
- Audit log uses deterministic ID derived from `requestId + decision`

**Duplicate Behavior**: Silent ignore (decision already recorded)

**Retry Sources Considered**:
- Workflow step retry after crash
- Network retry on DB timeout
- Concurrent approval attempts (race condition)

```typescript
interface RecordDecisionResult {
  inserted: boolean;  // true if new decision, false if duplicate (race loser)
}

// idempotent decision recording - returns insertion status for race handling
async function recordDecision(requestId: string, decision: Decision): Promise<RecordDecisionResult> {
  // store decision with idempotency via request_id unique constraint
  const result = await db.hitlDecisions.insert({
    requestId,
    ...decision,
  }).onConflict('request_id').ignore();

  // if no rows inserted, decision already exists (race loser or duplicate)
  if (result.rowCount === 0) {
    logger.info({ requestId }, 'Decision already recorded - race loser or duplicate');
    return { inserted: false };
  }

  // update request status atomically
  await db.hitlRequests.update(requestId, {
    status: decision.decision,
    resolvedAt: decision.timestamp,
  });

  // emit immutable audit event with deterministic ID
  await auditService.log({
    id: generateDeterministicUUID(requestId, 'HITL_DECISION', decision.decision),
    action: 'HITL_DECISION',
    resourceType: 'hitl_request',
    resourceId: requestId,
    actorId: decision.approver,
    metadata: {
      decision: decision.decision,
      comment: decision.comment,
      channel: decision.channel,
      originalRequestPayload: await getRequestPayload(requestId),
    },
  });

  return { inserted: true };
}

// deterministic UUID generation for audit idempotency
function generateDeterministicUUID(...components: string[]): string {
  const input = components.join(':');
  return uuidv5(input, AUDIT_UUID_NAMESPACE);
}
```

---

## 5. MCP Integration Layer

**FRD Reference**: FR-CORE-MCP-001 to FR-CORE-MCP-003

### 5.1 MCP Server Registry

#### 5.1.1 Idempotency for Side-Effecting Tools

**Idempotency Guarantee**: Side-effecting MCP tool calls can be safely retried.

**Mechanism**:
- Optional `idempotencyKey` parameter derived from workflow context
- Key format: `${workflowId}:${stepId}:${toolName}:${argsHash}`
- Idempotency state stored in Redis with configurable TTL
- MCP servers supporting idempotency receive key in request headers

**Duplicate Behavior**:
| Tool supports idempotency | Behavior |
|---------------------------|----------|
| Yes | MCP server returns cached result |
| No | Core layer checks Redis for cached result |

**Idempotency Window**: Tool-specific, default 24 hours

**Retry Sources Considered**:
- Cockatiel retry policy (3 attempts with exponential backoff)
- Workflow step retry (configurable, default 3)
- Circuit breaker recovery retry
- **Max Retry Depth**: cockatiel 3x × workflow 3x = 9x potential executions

**Critical Tools Requiring Idempotency**:
- `executeTrade` (crypto domain) - financial impact
- `sendEmail` (HR domain) - duplicate notifications
- `createCandidate` (HR domain) - duplicate records
- Any tool that mutates external state

```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  endpoint?: string;
  capabilities: string[];
  rateLimit?: RateLimitConfig;
  cacheTTL?: Record<string, number>;
  enabled: boolean;
  supportsIdempotency?: boolean; // server supports X-Idempotency-Key header
}

interface MCPInvokeOptions {
  idempotencyKey?: string;       // explicit key (overrides auto-generation)
  workflowContext?: {            // for auto-generating idempotency key
    workflowId: string;
    stepId: string;
  };
  skipIdempotencyCheck?: boolean; // for read-only operations
}

// registry pattern with idempotency support
class MCPRegistry {
  private servers: Map<string, MCPServer> = new Map();
  private idempotencyStore: Redis;

  async discover(): Promise<void> {
    for (const config of this.configs) {
      const server = await this.connect(config);
      const tools = await server.listTools();
      this.servers.set(config.id, { config, tools, client: server });
    }
  }

  async invoke(
    serverId: string,
    tool: string,
    args: unknown,
    options?: MCPInvokeOptions
  ): Promise<Result<unknown, MCPError>> {
    const server = this.servers.get(serverId);
    if (!server?.config.enabled) {
      return Result.err({ code: 'SERVER_DISABLED', message: `${serverId} is disabled` });
    }

    // generate or use provided idempotency key
    const idempotencyKey = this.resolveIdempotencyKey(serverId, tool, args, options);

    // check idempotency cache for side-effecting tools
    if (idempotencyKey && !options?.skipIdempotencyCheck) {
      const cachedResult = await this.checkIdempotencyCache(idempotencyKey);
      if (cachedResult) {
        logger.info({ serverId, tool, idempotencyKey }, 'MCP call deduplicated - returning cached result');
        return Result.ok(cachedResult);
      }
    }

    // execute with resilience
    const result = await this.executeWithResilience(server, tool, args, idempotencyKey);

    // cache successful results for idempotency
    if (idempotencyKey && Result.isOk(result)) {
      await this.cacheIdempotencyResult(idempotencyKey, result.data, server.config.cacheTTL?.[tool] || 86400);
    }

    return result;
  }

  private resolveIdempotencyKey(
    serverId: string,
    tool: string,
    args: unknown,
    options?: MCPInvokeOptions
  ): string | null {
    // explicit key takes precedence
    if (options?.idempotencyKey) {
      return options.idempotencyKey;
    }

    // auto-generate from workflow context if provided
    if (options?.workflowContext) {
      const argsHash = createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
      return `${options.workflowContext.workflowId}:${options.workflowContext.stepId}:${serverId}:${tool}:${argsHash}`;
    }

    return null; // no idempotency for this call
  }

  private async checkIdempotencyCache(key: string): Promise<unknown | null> {
    const cached = await this.idempotencyStore.get(`mcp:idempotency:${key}`);
    return cached ? JSON.parse(cached) : null;
  }

  private async cacheIdempotencyResult(key: string, result: unknown, ttlSeconds: number): Promise<void> {
    await this.idempotencyStore.set(
      `mcp:idempotency:${key}`,
      JSON.stringify(result),
      'EX',
      ttlSeconds
    );
  }
}
```

### 5.2 Resilience Patterns

```typescript
// circuit breaker + retry + timeout composition
import { circuitBreaker, retry, timeout, wrap } from 'cockatiel';

const mcpPolicy = wrap(
  retry(handleAll, { maxAttempts: 3, backoff: new ExponentialBackoff() }),
  circuitBreaker(handleAll, {
    halfOpenAfter: 30_000,
    breaker: new ConsecutiveBreaker(5),
  }),
  timeout(10_000)
);

async function callMCPTool(server: MCPServer, tool: string, args: unknown) {
  return mcpPolicy.execute(() => server.client.callTool(tool, args));
}
```

### 5.3 Schema Validation

**FRD Reference**: FR-CORE-MCP-002

```typescript
import { z } from 'zod';

// tool output schemas defined per MCP server
const toolSchemas: Record<string, z.ZodSchema> = {
  'dexscreener.getTokenInfo': z.object({
    address: z.string(),
    symbol: z.string(),
    price: z.number(),
    liquidity: z.number(),
  }),
  'gmail.sendEmail': z.object({
    messageId: z.string(),
    threadId: z.string(),
  }),
  // ... domain-specific schemas
};

async function executeWithValidation(
  server: MCPServer,
  tool: string,
  args: unknown
): Promise<Result<unknown, MCPError>> {
  const result = await callMCPTool(server, tool, args);

  if (Result.isErr(result)) return result;

  const schema = toolSchemas[`${server.id}.${tool}`];
  if (schema) {
    const validation = schema.safeParse(result.data);
    if (!validation.success) {
      logger.error({ tool, errors: validation.error }, 'MCP output schema validation failed');
      return Result.err({ code: 'SCHEMA_VALIDATION_ERROR', tool, errors: validation.error });
    }
  }

  return result;
}
```

### 5.4 Rate Limit Queueing

**FRD Reference**: FR-CORE-MCP-003 (queue, not reject)

#### 5.4.1 Idempotent Queue Processing

**Idempotency Guarantee**: Queued MCP requests are processed exactly once.

**Mechanism**:
- Job ID derived from idempotency key (if provided)
- BullMQ deduplicates jobs with same ID
- Worker checks idempotency cache before execution

**Duplicate Behavior**: Job silently deduplicated by BullMQ

```typescript
import { Queue, Worker } from 'bullmq';

// rate-limited requests are queued, not rejected
const mcpQueue = new Queue('mcp-requests', { connection: redis });

interface QueuedMCPRequest {
  serverId: string;
  tool: string;
  args: unknown;
  workflowId: string;
  stepId: string;
  idempotencyKey: string | null;
  priority: number;
}

async function invokeWithRateLimiting(
  serverId: string,
  tool: string,
  args: unknown,
  workflowContext: { workflowId: string; stepId: string }
): Promise<Result<unknown, MCPError>> {
  const server = registry.get(serverId);
  const limit = server.config.rateLimit;

  // generate idempotency key from workflow context
  const argsHash = createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
  const idempotencyKey = `${workflowContext.workflowId}:${workflowContext.stepId}:${serverId}:${tool}:${argsHash}`;

  if (limit && await isRateLimited(serverId)) {
    // queue instead of reject - use idempotency key as job ID for deduplication
    const jobId = `mcp-${idempotencyKey}`;
    const job = await mcpQueue.add('mcp-request', {
      serverId,
      tool,
      args,
      workflowId: workflowContext.workflowId,
      stepId: workflowContext.stepId,
      idempotencyKey,
      priority: 1,
    }, {
      jobId, // BullMQ deduplicates by jobId
      delay: limit.windowMs,
      attempts: 3,
    });

    // workflow will be signaled when job completes
    return Result.ok({ queued: true, jobId: job.id });
  }

  return registry.invoke(serverId, tool, args, {
    idempotencyKey,
    workflowContext,
  });
}

// worker processes queued requests with idempotency
const worker = new Worker('mcp-requests', async (job) => {
  const { serverId, tool, args, workflowId, idempotencyKey } = job.data;

  // execute with idempotency check
  const result = await registry.invoke(serverId, tool, args, {
    idempotencyKey,
    skipIdempotencyCheck: false,
  });

  // signal workflow with result (idempotent via Inngest's event deduplication)
  await workflowEngine.signal(workflowId, 'mcp-result', {
    tool,
    result,
    idempotencyKey,
  });
}, { connection: redis });
```

### 5.5 Tool Registry Query

**FRD Reference**: FR-CORE-MCP-001 (queryable by domain/capability)

```typescript
// query tools by domain and capability
class MCPRegistry {
  // ... existing code

  queryTools(filter: {
    domain?: 'crypto' | 'hr' | 'core';
    capability?: string;
    enabled?: boolean;
  }): ToolInfo[] {
    return Array.from(this.servers.values())
      .filter(s => filter.enabled === undefined || s.config.enabled === filter.enabled)
      .filter(s => filter.domain === undefined || s.config.domain === filter.domain)
      .flatMap(s => s.tools.map(t => ({
        serverId: s.config.id,
        tool: t.name,
        capabilities: t.capabilities,
        domain: s.config.domain,
      })))
      .filter(t => filter.capability === undefined ||
        t.capabilities.includes(filter.capability));
  }
}
```

### 5.6 Caching Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Price data | 60s | Market volatility |
| Transactions | 5min | Block finality |
| Social posts | 15min | Engagement lag |
| Security scans | 24h | Contract code static |
| Calendar availability | 5min | Meeting changes |

---

## 6. Notification Bus Architecture

**FRD Reference**: FR-CORE-NOTIF-001 to FR-CORE-NOTIF-003

> **Multi-Model Consensus (2026-02-02)**: Replace custom notification bus with **Novu** (open-source notification infrastructure). Custom templating, priority routing, and quiet hours management is not defensible for a 3-person team when SaaS handles it out of the box.

### 6.1 Technology Selection

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Novu (self-hosted)** | Open source, full control, unlimited events | Requires infrastructure (~$20/mo) | **Phase 2+** |
| **Novu (cloud)** | Managed, 10K events/mo free | Vendor dependency | **Phase 1** |
| **Custom build** | Full control | 3+ weeks dev time | Not selected |

**Decision**: Novu Cloud (free tier) for Phase 1. Self-hosted option for Phase 2+ if volume increases.

### 6.2 Novu Integration Pattern

#### 6.2.1 Notification Idempotency

**Idempotency Guarantee**: Critical notifications (HITL approvals) are sent exactly once.

**Mechanism**:
- Novu supports `transactionId` for deduplication
- For HITL notifications: use `hitl:{requestId}` as transactionId
- Novu deduplicates via `transactionId` (idempotency key; explicit window not publicly documented)

**Duplicate Behavior**: Novu silently ignores duplicate transactionIds

**Retry Sources Considered**:
- Workflow step retry
- Novu internal retry (on delivery failure)
- Application-level retry on timeout

**Non-Critical Notifications**:

| Type | Idempotency | Duplicate Behavior | Rationale |
|------|-------------|-------------------|-----------|
| Critical (HITL, alerts) | Required | Deduplicated via transactionId | Business impact |
| Normal (reminders) | Best-effort | May duplicate on retry | User inconvenience only |
| Low (digests) | Not required | Batched, natural dedup | Aggregated content |

**Non-Critical Notification Handling**:
- transactionId optional (set to `undefined` if not provided)
- Novu may send duplicate on retry - acceptable for reminders
- For digest notifications, batch aggregation provides natural deduplication

```typescript
import { Novu } from '@novu/node';

const novu = new Novu(process.env.NOVU_API_KEY);

// idempotent notification sending
async function sendNotification(request: NotificationRequest): Promise<void> {
  // generate transactionId for idempotency (critical notifications)
  const transactionId = request.idempotencyKey
    || (request.critical ? `${request.type}:${request.resourceId}` : undefined);

  await novu.trigger('hitl-approval-request', {
    to: {
      subscriberId: request.recipientId,
      email: request.email,
      // telegram handled via novu integration
    },
    payload: {
      actionType: request.actionType,
      actionSummary: request.summary,
      approvalUrl: request.approvalUrl,
      rejectUrl: request.rejectUrl,
    },
    transactionId, // novu deduplicates on this
  });
}

// example: HITL approval notification (critical, must be idempotent)
async function notifyApprover(hitlRequest: HITLRequest): Promise<void> {
  await sendNotification({
    type: 'hitl-approval-request',
    resourceId: hitlRequest.id,
    recipientId: hitlRequest.approverId,
    email: hitlRequest.approverEmail,
    actionType: hitlRequest.payload.actionType,
    summary: hitlRequest.payload.summary,
    approvalUrl: generateApprovalUrl(hitlRequest),
    rejectUrl: generateRejectUrl(hitlRequest),
    critical: true, // enables idempotency
    idempotencyKey: `hitl:${hitlRequest.id}`, // explicit key
  });
}

// novu handles: templating, channel routing, quiet hours, retries
```

### 6.3 Notification Templates (Managed in Novu)

Templates are configured in Novu dashboard, not code:
- `hitl-approval-request` - HITL approval notifications
- `trade-signal-alert` - Crypto trade signal alerts
- `interview-reminder` - HR interview reminders
- `contract-ready` - Contract approval notifications

### 6.4 Channel Configuration

> **Verified (2026-02-26)**: Novu supports Telegram as a chat channel provider ([docs.novu.co/platform/integrations/chat](https://docs.novu.co/platform/integrations/chat)). Resend email integration is documented at [docs.novu.co/platform/integrations/email/resend](https://docs.novu.co/platform/integrations/email/resend). The `transactionId` parameter for deduplication is confirmed in the [Trigger Event API](https://docs.novu.co/api-reference/events/trigger-event); however, the deduplication window duration is not publicly documented by Novu -- the ADD's "24-hour" claim should be validated during integration testing.

| Channel | Provider | Phase |
|---------|----------|-------|
| Email | Resend (via Novu) | Phase 1 |
| Telegram | Novu Telegram integration | Phase 1 |
| Push | Deferred | Phase 2 |
| SMS | Deferred | Phase 2 |

### 6.5 Priority Routing

Novu's workflow editor handles priority-based routing:
- **Critical**: All channels immediately, bypass quiet hours
- **Normal**: Email + Telegram, respect quiet hours
- **Low**: Email only, batched into digest

---

## 7. LLM Gateway Architecture

**FRD Reference**: FR-CORE-LLM-001 to FR-CORE-LLM-003

### 7.1 Provider Abstraction

#### 7.1.1 LLM Request Idempotency

**Idempotency Posture for LLM Requests**:

| Operation | Type | Idempotency | Duplicate Behavior | Notes |
|-----------|------|-------------|-------------------|-------|
| Completion request | Outbound API | **Non-idempotent** | Each request generates new response | Intentional - AI responses vary |
| Provider fallback | Retry pattern | **Non-idempotent** | Fallback generates different response | Acceptable for availability |

**Important**: LLM completion requests are intentionally NOT idempotent. Each request may produce different output due to:
- Model temperature/sampling
- Context window differences
- Provider-specific behavior

**Retry Safety**:
- Retry on network failure is safe (no side effects beyond cost)
- Retry on timeout may result in duplicate cost but no data corruption
- Inngest memoization prevents workflow-level duplicate LLM calls

**Retry Sources Considered**:
- Provider timeout (30s default)
- Network failure
- Rate limit (429) with exponential backoff
- Fallback to secondary provider

**Cost Protection**: Usage logging (§7.2) is idempotent; duplicate requests are logged once per workflow step.

#### 7.1.2 Provider Rate Limits Reference

> **Verified (2026-02-26)**: Rate limits are tier-based and change frequently. The table below captures baseline Tier 1 limits. Teams must check current limits at provider dashboards before production launch.

| Provider | Rate Limit Reference | Tier 1 Baseline (approx.) | Notes |
|----------|---------------------|--------------------------|-------|
| **OpenAI** | [platform.openai.com/docs/guides/rate-limits](https://platform.openai.com/docs/guides/rate-limits) | ~500K TPM, ~1,000 RPM (GPT-5) | Auto-graduates tiers by spend |
| **Anthropic** | [platform.claude.com/docs/en/api/rate-limits](https://platform.claude.com/docs/en/api/rate-limits) | ~5-60 RPM, scales by tier ($5→$400+ deposit) | Long-context requests have separate limits |
| **Google** | [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) | 150-300 RPM (Paid Tier 1); Free tier: 5-15 RPM | Free tier reduced ~50-80% in Dec 2025 |

**Rate Limit Management Strategy**:
- LLM Gateway must implement per-provider rate tracking using token bucket or sliding window
- When approaching limits: queue requests rather than fail (aligns with Durable Execution pattern)
- Budget enforcement (§7.2) acts as secondary rate governor
- Provider fallback (§7.1) triggers on 429 responses before circuit breaker

```typescript
interface LLMProvider {
  id: string;
  generateCompletion(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>>;
  estimateCost(tokens: TokenCount): number;
  isAvailable(): Promise<boolean>;
}

class LLMGateway {
  private providers: Map<string, LLMProvider>;
  private primary: string;
  private fallback: string;

  // LLM requests are non-idempotent by design (each call may produce different response)
  // Inngest memoization at workflow level prevents duplicate calls on step retry
  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>> {
    const result = await this.providers.get(this.primary)?.generateCompletion(request);

    if (Result.isErr(result)) {
      logger.warn({ error: result.error }, 'Primary LLM failed, trying fallback');
      return this.providers.get(this.fallback)?.generateCompletion(request);
    }

    await this.trackUsage(request, result.data);
    return result;
  }
}
```

### 7.2 Cost Tracking

#### 7.2.1 Idempotent Usage Logging

**Idempotency Guarantee**: Each LLM request is logged exactly once for cost tracking.

**Mechanism**:
- Log ID is deterministically generated from `workflowId + stepId + requestHash`
- INSERT uses `ON CONFLICT (id) DO NOTHING`

**Duplicate Behavior**: Silent ignore (log entry already exists)

**Rationale**: Accurate cost tracking requires no duplicate entries on workflow step retry.

```typescript
// per-workflow cost attribution (FR-CORE-LLM-002)
interface LLMUsageLog {
  id: string;                    // deterministic: hash(workflowId + stepId + requestHash)
  workflowId: string;
  stepId: string;                // for idempotency
  domain: 'crypto' | 'hr';
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUSD: number;
  timestamp: Date;
}

// budget enforcement (FR-CORE-LLM-002 requires daily cap)
const DAILY_BUDGET_USD = 50;    // configurable per domain
const MONTHLY_BUDGET_USD = 500; // per BRD constraint

async function checkBudget(domain: 'crypto' | 'hr'): Promise<BudgetStatus> {
  const [dailyTotal, monthlyTotal] = await Promise.all([
    db.query(`
      SELECT SUM(cost_usd) FROM llm_usage_logs
      WHERE domain = $1 AND timestamp >= date_trunc('day', NOW())
    `, [domain]),
    db.query(`
      SELECT SUM(cost_usd) FROM llm_usage_logs
      WHERE domain = $1 AND timestamp >= date_trunc('month', NOW())
    `, [domain]),
  ]);

  return {
    dailyUsed: dailyTotal,
    dailyLimit: DAILY_BUDGET_USD,
    dailyExceeded: dailyTotal >= DAILY_BUDGET_USD,
    monthlyUsed: monthlyTotal,
    monthlyLimit: MONTHLY_BUDGET_USD,
    monthlyExceeded: monthlyTotal >= MONTHLY_BUDGET_USD,
    warningAt90: dailyTotal >= DAILY_BUDGET_USD * 0.9 || monthlyTotal >= MONTHLY_BUDGET_USD * 0.9,
  };
}

// gateway enforces budget before request
async function complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>> {
  const budget = await checkBudget(request.domain);

  if (budget.dailyExceeded) {
    return Result.err({ code: 'DAILY_BUDGET_EXCEEDED', ...budget });
  }
  if (budget.monthlyExceeded) {
    return Result.err({ code: 'MONTHLY_BUDGET_EXCEEDED', ...budget });
  }

  // proceed with request...
  const result = await this.providers.get(this.primary)?.generateCompletion(request);

  if (Result.isOk(result)) {
    await this.trackUsage(request, result.data);
  }

  return result;
}

// idempotent usage tracking
async function trackUsage(
  request: CompletionRequest,
  response: CompletionResponse
): Promise<void> {
  // generate deterministic ID from request context
  const requestHash = createHash('sha256')
    .update(JSON.stringify(request.messages))
    .digest('hex')
    .slice(0, 16);

  const deterministicId = uuidv5(
    `${request.workflowId}:${request.stepId}:${requestHash}`,
    LLM_USAGE_UUID_NAMESPACE
  );

  // idempotent insert
  await db.llmUsageLogs.insert({
    id: deterministicId,
    workflowId: request.workflowId,
    stepId: request.stepId,
    domain: request.domain,
    provider: response.provider,
    model: response.model,
    promptTokens: response.usage.promptTokens,
    completionTokens: response.usage.completionTokens,
    costUSD: calculateCost(response),
    timestamp: new Date(),
  }).onConflict('id').ignore();
}
```

---

## 8. Identity Service Architecture

**FRD Reference**: FR-CORE-ID-001 to FR-CORE-ID-003

> **Multi-Model Consensus (2026-02-02)**: Replace custom WebAuthn/JWT implementation with **Supabase Auth** (managed). Custom identity is a "velocity killer" for a 3-person team. Supabase Auth provides passwordless (magic links), social login, and session management out of the box.

### 8.1 Technology Selection

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Supabase Auth** | 50K MAU free, magic links, social login | Vendor dependency | **Selected** |
| **Clerk** | Best DX, WebAuthn native | Per-MAU pricing risk | Alternative |
| **Custom WebAuthn** | Full control | 2+ months dev time | Not selected |

**Decision**: Supabase Auth (free tier) for Phase 1. Supports magic links (passwordless) per BRD requirement.

**Exit Strategy**: Standard OIDC/JWT tokens; can migrate to Keycloak/Authentik if needed.

### 8.2 Supabase Auth Integration

#### 8.2.1 Identity Service Idempotency

**Idempotency Posture for Auth Operations**:

| Operation | Type | Idempotency | Duplicate Behavior | Notes |
|-----------|------|-------------|-------------------|-------|
| `signInWithOtp` (magic link) | Outbound API | **Safe to retry** | Supabase sends new email; user clicks latest link | Multiple emails acceptable |
| `signInWithOAuth` | Outbound redirect | **Inherently idempotent** | OAuth flow is stateless redirect | User re-authenticates |
| `auth.getUser` | Outbound API | **Read-only** | No side effects | Safe for any retry |
| Session validation | Outbound API | **Read-only** | No side effects | Safe for any retry |

**Retry Sources Considered**:
- User retry on slow email delivery
- Network timeout on OAuth redirect
- Session check retry on API gateway

**Rationale**: Authentication operations are either read-only (session validation) or user-initiated with clear feedback (magic link email). Supabase handles rate limiting. Duplicate magic link sends are acceptable (user clicks latest).

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// magic link login (passwordless) - safe to retry; sends new email
async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${APP_URL}/auth/callback` },
  });
  if (error) throw error;
}

// social login (OAuth) - inherently idempotent redirect
async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${APP_URL}/auth/callback` },
  });
  if (error) throw error;
}

// get current user - read-only, no side effects
async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

### 8.3 RBAC Model (Application Layer)

Supabase handles authentication; RBAC is managed in application layer:

```typescript
// roles stored in app database, linked to supabase user id
type CoreRole = 'admin' | 'user' | 'viewer';
type HRRole = CoreRole | 'recruiter' | 'interviewer' | 'hiring_manager' | 'client';
type CryptoRole = CoreRole | 'trader';

// permission check (app layer)
async function hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
  const userRoles = await db.userRoles.findByUserId(userId);
  const permissions = getRolePermissions(userRoles);
  return permissions.some(p => p.resource === resource && p.actions.includes(action));
}
```

### 8.4 Session Management (Supabase Managed)

Supabase Auth handles session management automatically:
- **Session persistence**: Managed by Supabase client
- **Token refresh**: Automatic refresh tokens
- **Session revocation**: Via Supabase dashboard or API

```typescript
// session validation (middleware)
async function validateSession(req: Request): Promise<User | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return user;
}
```

### 8.5 Phase 2: WebAuthn/Passkeys

Full WebAuthn support deferred to Phase 2. Supabase Auth roadmap includes passkey support; evaluate when available.
```

---

## 9. Data Architecture

### 9.1 Schema Isolation

```
PostgreSQL
├── public (shared — Platform Core)
│   ├── users                    → Identity Service (owner)
│   ├── authenticators           → Identity Service (owner)
│   ├── user_roles               → Identity Service (owner, RBAC)
│   ├── workflow_definitions     → Workflow Management API (owner) [TSD database.md §3.1]
│   ├── workflow_executions      → Workflow Engine (owner, Inngest projection) [TSD database.md §3.2]
│   ├── hitl_requests            → HITL Gateway (owner) [TSD hitl-gateway.md]
│   ├── hitl_decisions           → HITL Gateway (owner) [TSD hitl-gateway.md]
│   ├── hitl_policies            → HITL Gateway (owner) [TSD hitl-gateway.md]
│   ├── audit_logs               → Audit Service (owner, append-only)
│   ├── audit_exports            → Audit Service (owner)
│   ├── llm_usage_logs           → LLM Gateway (owner)
│   ├── files                    → File Storage Service (owner, metadata)
│   ├── file_entity_links        → File Storage Service (owner)
│   ├── webhook_deliveries       → Interop Layer (owner, outbound)
│   └── notification_logs        → Notification Bus (owner) [TSD notification-bus.md]
├── aptivo_hr (HR domain)
│   ├── candidates
│   ├── applications
│   ├── interviews
│   └── contracts
└── aptivo_trading (Crypto domain)
    ├── monitored_wallets
    ├── trade_signals
    ├── trade_executions
    └── security_reports
```

> **Ownership Rule**: Each table has exactly one owner component that is the single writer. Other components interact via the owner's API, not by direct table access. Domain tables are owned by their respective domain applications.

### 9.2 Audit Log Schema

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID REFERENCES users(id),
  actor_type VARCHAR(50) NOT NULL, -- 'user', 'system', 'workflow'
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  domain VARCHAR(50), -- 'hr', 'crypto', 'core'
  metadata JSONB,
  ip_address INET,
  user_agent TEXT
);

-- append-only: no UPDATE/DELETE permissions
-- partitioned by month for retention management

-- tamper-evident: each row references previous hash
CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
```

### 9.3 Audit Tamper-Evidence

**FRD Reference**: FR-CORE-AUD-001

> **Multi-Model Consensus (2026-02-02)**: Simplify to append-only SQL for Phase 1. Cryptographic hash-chaining adds complexity (concurrency edge cases, schema migration issues) without immediate regulatory requirement. Defer to Phase 3+ when compliance demands it.

#### Phase 1: Append-Only SQL with Idempotent Inserts

**Idempotency Guarantee**: Each audit event is recorded exactly once.

**Mechanism**:
- ID is deterministically generated from caller-provided `eventId` OR `hash(workflowId + stepId + action + resourceId + eventSequence)`
- INSERT uses `ON CONFLICT (id) DO NOTHING`
- Event sequence (caller-provided or metadata hash) ensures distinct events within same second are not collapsed

**Duplicate Behavior**: Silent ignore (audit entry already exists)

**Retry Sources Considered**:
- Workflow step retry after crash (most common)
- Database connection retry
- Service restart during write

**Rationale**: Workflow step retry after crash must not create duplicate audit records; audit trail integrity is critical for compliance.

**Important**: The caller SHOULD provide an `eventId` or include distinguishing data in `metadata` to prevent false deduplication of legitimate distinct events within the same second.

```sql
-- tamper protection via database permissions
-- app user has INSERT only, no UPDATE/DELETE
GRANT INSERT ON audit_logs TO app_user;
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

-- only admin can query (read-only)
GRANT SELECT ON audit_logs TO app_user;

-- idempotency: unique constraint on deterministic ID
-- (already covered by PRIMARY KEY, but explicit for clarity)
```

```typescript
import { v5 as uuidv5 } from 'uuid';

// namespace UUID for audit log idempotency (fixed, never changes)
const AUDIT_UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

interface AuditLogEntry {
  // ... existing fields
  eventId?: string;  // caller-provided unique event ID (preferred)
}

// idempotent append-only audit logging
async function appendAuditLog(entry: AuditLogEntry): Promise<AuditLog | null> {
  let deterministicId: string;

  if (entry.eventId) {
    // preferred: caller provides unique event ID
    deterministicId = entry.eventId;
  } else if (entry.id) {
    // caller provided explicit ID
    deterministicId = entry.id;
  } else {
    // fallback: generate from content
    // include metadata hash to distinguish multiple events with same action/resource
    const metadataHash = entry.metadata
      ? createHash('sha256').update(JSON.stringify(entry.metadata)).digest('hex').slice(0, 8)
      : 'no-meta';

    const idempotencyInput = [
      entry.workflowId || 'no-workflow',
      entry.stepId || 'no-step',
      entry.action,
      entry.resourceType,
      entry.resourceId || 'no-resource',
      metadataHash,  // distinguishes events with different metadata
    ].join(':');

    deterministicId = uuidv5(idempotencyInput, AUDIT_UUID_NAMESPACE);
  }

  // idempotent insert: ON CONFLICT DO NOTHING
  const result = await db.auditLogs.insert({
    id: deterministicId,
    timestamp: new Date(),
    ...entry,
  }).onConflict('id').ignore();

  if (result.rowCount === 0) {
    // duplicate detected - this is expected on retry
    logger.debug({ deterministicId, action: entry.action }, 'Audit log entry already exists - idempotent skip');
    return null;
  }

  return result.rows[0];
}

// convenience wrapper for workflow context - always use eventId for clarity
async function auditFromWorkflow(
  ctx: WorkflowContext,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  // generate stable eventId from workflow context
  const eventId = generateDeterministicUUID(
    ctx.workflowId,
    ctx.stepId,
    action,
    ctx.resourceId || 'no-resource'
  );

  await appendAuditLog({
    eventId,
    workflowId: ctx.workflowId,
    stepId: ctx.stepId,
    action,
    resourceType: ctx.resourceType,
    resourceId: ctx.resourceId,
    actorId: ctx.actorId,
    actorType: ctx.actorType,
    domain: ctx.domain,
    metadata,
  });
}
```

#### Phase 3+: Cryptographic Hash-Chaining (Deferred)

When regulatory compliance requires cryptographic proof of integrity:

```typescript
// future: tamper-evident chain
interface AuditLogWithChain extends AuditLog {
  previousHash: string | null;
  currentHash: string;
}

// implementation deferred to Phase 3+
```

### 9.4 Audit Retention Policies

**FRD Reference**: FR-CORE-AUD-003

```typescript
interface RetentionPolicy {
  id: string;
  domain: 'core' | 'hr' | 'crypto';
  resourceType?: string;         // optional: specific resource type
  retentionYears: number;        // default: 7
  overrideAllowed: boolean;      // can domain override?
}

// default: 7 years platform-wide
const DEFAULT_RETENTION_YEARS = 7;

// domain can override if allowed
const domainOverrides: Record<string, number> = {
  'hr.candidate': 5,           // GDPR consideration
  'crypto.trade_execution': 10, // financial record keeping
};

async function getRetentionPolicy(domain: string, resourceType: string): Promise<number> {
  const override = domainOverrides[`${domain}.${resourceType}`];
  return override ?? DEFAULT_RETENTION_YEARS;
}

#### 9.4.1 Retention Enforcement Idempotency

**Idempotency Guarantee**: Running retention multiple times in same period has no additional effect.

**Mechanism**:
- Archive operation uses date-based selection (inherently idempotent)
- Already-archived records are skipped
- Audit log for enforcement uses deterministic ID (date + policy)

**Duplicate Behavior**: Archive returns 0 count if already run; audit log deduplicated

**Retry Sources Considered**:
- Cron job re-execution on failure
- Manual retry

```typescript
// scheduled job: archive/delete expired records (idempotent)
async function enforceRetention(): Promise<void> {
  const policies = await db.retentionPolicies.findAll();
  const runDate = new Date().toISOString().split('T')[0]; // daily bucket

  for (const policy of policies) {
    const cutoffDate = subYears(new Date(), policy.retentionYears);

    // archive is idempotent: already-archived records are skipped
    const expiredCount = await db.auditLogs.archiveOlderThan(cutoffDate, policy.domain);

    // deterministic audit ID for this run (daily + policy)
    await auditService.log({
      eventId: generateDeterministicUUID('RETENTION_ENFORCED', policy.id, runDate),
      action: 'RETENTION_ENFORCED',
      resourceType: 'audit_log',
      metadata: { policy: policy.id, archivedCount: expiredCount, cutoffDate, runDate },
    });
  }
}
```

### 9.5 Audit Export with Integrity

**FRD Reference**: FR-CORE-AUD-002

#### 9.5.1 Export Idempotency

**Idempotency Guarantee**: Export requests with same parameters produce same result.

**Mechanism**:
- Export ID is deterministic: `hash(requestedBy + params + date_bucket)`
- Export record uses upsert on deterministic ID
- S3 presigned URL generation is read-only (inherently idempotent)

**Duplicate Behavior**: Return existing export record if parameters match within 1-hour window

**Idempotency Window**: 1 hour (same user + same params = same export)

**Retry Sources Considered**:
- User retry on timeout
- API gateway retry

```typescript
interface AuditExport {
  format: 'csv' | 'json';
  startDate: Date;
  endDate: Date;
  filters?: {
    actorId?: string;
    resourceType?: string;
    domain?: string;
  };
}

async function exportAuditLogs(params: AuditExport, requestedBy: string): Promise<ExportResult> {
  // generate deterministic export ID for idempotency (1-hour bucket)
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const exportId = generateDeterministicUUID(
    requestedBy,
    JSON.stringify(params),
    hourBucket.toString()
  );

  // check for existing export (idempotent return)
  const existing = await db.auditExports.findById(exportId);
  if (existing && existing.status === 'completed') {
    return {
      downloadUrl: generatePresignedUrl(`exports/${exportId}.${params.format}`),
      checksum: existing.checksum,
      recordCount: existing.recordCount,
      idempotent: true,
    };
  }

  // audit the export action itself (idempotent via deterministic audit ID)
  await auditService.log({
    id: generateDeterministicUUID(exportId, 'AUDIT_EXPORT_REQUESTED'),
    action: 'AUDIT_EXPORT_REQUESTED',
    resourceType: 'audit_log',
    actorId: requestedBy,
    metadata: { params, exportId },
  });

  const logs = await db.auditLogs.findByFilters(params);

  // generate export content
  const content = params.format === 'json'
    ? JSON.stringify(logs, null, 2)
    : convertToCSV(logs);

  // compute checksum for integrity verification
  const checksum = computeSHA256(content);

  // store export metadata (idempotent via exportId)
  await db.auditExports.upsert({
    id: exportId,
    requestedBy,
    requestedAt: new Date(),
    params,
    recordCount: logs.length,
    checksum,
    status: 'completed',
    expiresAt: addDays(new Date(), 7),
  });

  return {
    downloadUrl: generatePresignedUrl(`exports/${exportId}.${params.format}`),
    checksum,
    recordCount: logs.length,
  };
}
```

### 9.6 File Storage

#### 9.6.1 File Storage Idempotency

**Idempotency Guarantee**: File uploads and metadata operations are idempotent.

**Mechanism by Operation**:

| Operation | Idempotency Key | Duplicate Behavior |
|-----------|-----------------|-------------------|
| Upload URL generation | Read-only, inherently idempotent | Same URL returned |
| Download URL generation | Read-only, inherently idempotent | Same URL returned |
| Metadata insert | Client-provided `fileId` or content hash | ON CONFLICT update |
| Scan status update | `fileId` | Upsert (idempotent) |
| File delete | `fileId` | S3 delete is idempotent |
| Access logging | Deterministic audit ID | ON CONFLICT ignore |

**Retry Sources Considered**:
- Client retry on upload timeout
- Workflow step retry
- Scan worker retry

```typescript
// S3-compatible interface (FR-CORE-BLOB-001/002)
interface FileStorage {
  generateUploadUrl(key: string, contentType: string, expiresIn: number): Promise<string>;
  generateDownloadUrl(key: string, expiresIn: number): Promise<string>;
  deleteFile(key: string): Promise<void>;  // S3 delete is idempotent
  getMetadata(key: string): Promise<FileMetadata>;
}

// metadata stored in PostgreSQL, binary in S3/Minio
interface FileMetadata {
  id: string;           // client-provided or content-hash for idempotency
  key: string;          // S3 object key
  filename: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  linkedEntities: EntityLink[];
  scanStatus: 'pending' | 'clean' | 'infected' | 'error';
  version: number;
}

// idempotent file metadata creation
async function createFileMetadata(
  params: CreateFileParams,
  workflowContext?: { workflowId: string; stepId: string }
): Promise<FileMetadata> {
  // generate deterministic ID from content hash or workflow context
  const fileId = params.fileId
    || (params.contentHash ? `hash:${params.contentHash}` : null)
    || (workflowContext ? generateDeterministicUUID(workflowContext.workflowId, workflowContext.stepId, params.filename) : generateUUID());

  return db.files.upsert({
    id: fileId,
    key: params.key,
    filename: params.filename,
    contentType: params.contentType,
    size: params.size,
    uploadedBy: params.uploadedBy,
    uploadedAt: new Date(),
    scanStatus: 'pending',
    version: 1,
  });
}

### 9.7 File Access Control

**FRD Reference**: FR-CORE-BLOB-002

```typescript
interface EntityLink {
  entityType: string;   // 'candidate', 'contract', 'trade_execution'
  entityId: string;
  domain: 'hr' | 'crypto';
  accessLevel: 'read' | 'write' | 'admin';
}

// access control inherits from linked entity permissions
async function canAccessFile(userId: string, fileId: string, action: 'read' | 'write'): Promise<boolean> {
  const file = await db.files.findById(fileId);
  if (!file) return false;

  // check each linked entity - user needs permission on at least one
  for (const link of file.linkedEntities) {
    const entityPermission = await getEntityPermission(userId, link.entityType, link.entityId);

    if (action === 'read' && entityPermission !== null) return true;
    if (action === 'write' && ['write', 'admin'].includes(entityPermission)) return true;
  }

  return false;
}

// file access is logged
async function logFileAccess(userId: string, fileId: string, action: 'view' | 'download'): Promise<void> {
  await auditService.log({
    action: `FILE_${action.toUpperCase()}`,
    resourceType: 'file',
    resourceId: fileId,
    actorId: userId,
    metadata: {
      filename: (await db.files.findById(fileId))?.filename,
    },
  });
}
```

### 9.8 Malware Scanning Integration

**FRD Reference**: FR-CORE-BLOB-002

#### 9.8.1 Scan Idempotency

**Idempotency Guarantee**: Each file is scanned exactly once; scan results are stable.

**Mechanism**:
- Scan triggered by file upload event (deduplicated by Inngest)
- Scan status update uses upsert (idempotent)
- Quarantine (S3 delete) is inherently idempotent

**Duplicate Behavior**: Re-scanning returns cached result if scanStatus != 'pending'

**Retry Sources Considered**:
- Scan worker crash/retry
- ClamAV timeout retry
- Workflow step retry

```typescript
#### 9.8.2 ClamAV Deployment Specification

> **Verified (2026-02-26)**: ClamAV provides official Docker images ([docs.clamav.net/manual/Installing/Docker.html](https://docs.clamav.net/manual/Installing/Docker.html)). For REST API access, use [clamav-rest-api](https://github.com/benzino77/clamav-rest-api) or [ajilach/clamav-rest](https://github.com/ajilach/clamav-rest) which bundles ClamAV daemon + REST API + auto signature updates in a single container.

**Deployment Model**: Separate container service (not sidecar -- incompatible with DO App Platform)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Container image | `ajilach/clamav-rest` or `benzino77/clamav-rest-api` | Two-in-one: daemon + REST API |
| Minimum RAM | 1.2 GiB | Signature database loading |
| Peak RAM (updates) | 2.4 GiB | During daily `freshclam` updates |
| API protocol | HTTP POST (multipart/form-data) | Scan file via `POST /api/v1/scan` |
| ClamAV port | 3310 (TCP) | Direct `clamd` connection (internal only) |
| Timeout | 30s per file (configurable) | Large files may need longer |
| Phase 1 deployment | Docker Compose service | Runs alongside API container |
| Production deployment | DO App Platform worker or external service | Evaluate cost vs. managed alternatives |

```typescript
// malware scan integration point
interface MalwareScanResult {
  fileId: string;
  status: 'clean' | 'infected' | 'error';
  engine: string;
  scanTimestamp: Date;
  threats?: string[];
}

// scan triggered after upload, before file is "confirmed"
async function scanUploadedFile(fileId: string): Promise<MalwareScanResult> {
  const file = await db.files.findById(fileId);
  const fileBuffer = await s3.getObject(file.key);

  // integration with ClamAV or external service
  const scanResult = await malwareScanner.scan(fileBuffer);

  await db.files.update(fileId, {
    scanStatus: scanResult.infected ? 'infected' : 'clean',
  });

  if (scanResult.infected) {
    // quarantine: delete from S3, mark as infected
    await s3.deleteObject(file.key);
    await auditService.log({
      action: 'FILE_QUARANTINED',
      resourceType: 'file',
      resourceId: fileId,
      metadata: { threats: scanResult.threats },
    });
  }

  return {
    fileId,
    status: scanResult.infected ? 'infected' : 'clean',
    engine: 'clamav',
    scanTimestamp: new Date(),
    threats: scanResult.threats,
  };
}

// files with scanStatus !== 'clean' cannot be downloaded
async function generateDownloadUrl(fileId: string, userId: string): Promise<Result<string, FileError>> {
  const file = await db.files.findById(fileId);

  if (file.scanStatus !== 'clean') {
    return Result.err({ code: 'FILE_NOT_AVAILABLE', reason: file.scanStatus });
  }

  await logFileAccess(userId, fileId, 'download');
  return Result.ok(await s3.getSignedUrl(file.key, { expiresIn: 3600 }));
}
```

---

## 10. Deployment Architecture

### 10.1 Environment Topology

| Environment | Purpose | Infrastructure |
|-------------|---------|----------------|
| Development | Local dev | Docker Compose |
| Staging | Integration testing | DigitalOcean (preview) |
| Production | Live system | DigitalOcean (production) |

### 10.2 Container Structure

```yaml
# docker-compose structure
services:
  # Core Services
  api:
    image: aptivo/api
    depends_on: [postgres, redis]

  workflow-worker:
    image: aptivo/worker
    depends_on: [postgres, redis]

  # Infrastructure
  postgres:
    image: postgres:16

  redis:
    image: redis:7

  minio:
    image: minio/minio

  clamav:
    image: ajilach/clamav-rest
    mem_limit: 2560m  # 2.5GB for signature update peak
```

### 10.3 Infrastructure Selection Rationale

> **Multi-Model Consensus (2026-02-03)**: DigitalOcean App Platform over Kubernetes. Unanimous decision by Claude Opus 4.5, OpenAI Codex, Gemini 3 Pro.

**BRD Constraints Driving Selection**:

| Constraint | BRD Reference | Impact on Selection |
|------------|---------------|---------------------|
| 3-developer team | BRD-PLATFORM-CORE §2.2 | Cannot absorb K8s operational overhead |
| Self-funded | BRD-PLATFORM-CORE §2.2 | Cost-effective solutions required |
| "Buy commodity infrastructure" | BRD-PLATFORM-CORE §2.1 | PaaS over self-managed K8s |

**Traceability**: BRD-PLATFORM-CORE Section 2.2 Constraints

**K8s Upgrade Triggers** (documented, not currently met):

| Trigger | Threshold | Current Status |
|---------|-----------|----------------|
| Custom networking/sidecars required | Service mesh, custom ingress | Not needed |
| Fine-grained autoscaling beyond PaaS | Custom HPA metrics | Not needed |
| Multi-tenant isolation or compliance mandates | Namespace-level isolation | Not needed |
| Cost inflection where PaaS > K8s + ops overhead | ~$500/mo with dedicated ops | Not reached |
| Team growth with K8s expertise | 5+ engineers | Currently 3 |

**Decision Record**:
- **Date**: 2026-02-03
- **Decision**: Use DigitalOcean App Platform
- **Status**: Active
- **Review Trigger**: Any K8s upgrade trigger met, or quarterly review

---

## 11. Cross-Cutting Concerns

### 11.1 Error Handling Pattern

```typescript
// Result type for all fallible operations in domain layer
import { Result } from '@satoshibits/functional';

// ReaderResult for application/orchestration layer (explicit dependencies)
// See: docs/05-guidelines/05c-ReaderResult-Guide.md
type ReaderResult<R, E, A> = (deps: R) => Promise<Result<A, E>>;

// domain errors are tagged unions
type DomainError =
  | { _tag: 'ValidationError'; field: string; message: string }
  | { _tag: 'NotFoundError'; resource: string; id: string }
  | { _tag: 'AuthorizationError'; required: string }
  | { _tag: 'ExternalServiceError'; service: string; cause: unknown };

// API errors use RFC 7807 Problem Details
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}
```

### 11.2 Observability

```typescript
// structured logging (Pino)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// OpenTelemetry tracing
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('aptivo-core');

async function processWorkflow(ctx: Context) {
  return tracer.startActiveSpan('workflow.process', async (span) => {
    span.setAttribute('workflow.id', ctx.workflowId);
    span.setAttribute('domain', ctx.domain);
    // ... workflow logic
    span.end();
  });
}
```

---

## 12. Interoperability Architecture

**FRD Reference**: FR-CORE-INT-001 to FR-CORE-INT-002

### 12.1 Workflow Definition Export API

**FRD Reference**: FR-CORE-INT-001

#### 12.1.1 Cursor-Based Pagination Standard

All list endpoints use cursor-based pagination to ensure consistency in multi-tenant environments with high-volume data streams (especially audit logs).

**Why Cursor (not Offset)**:
- Offset pagination causes drift when items are inserted/deleted during pagination
- Audit logs are append-only and high-volume — offset guarantees skipped/duplicate records
- Cursor scales better for large datasets without full table scans

**Standard Parameters**:
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `cursor` | string | `null` | - | Opaque cursor from previous response |
| `limit` | number | 50 | 200 | Number of items to return |

**Standard Response**:
```typescript
interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;  // null when no more results
  has_more: boolean;
}
```

**Cursor Format**: Base64url-encoded JSON containing `{ id, ts }` for stable ordering by creation time.

```typescript
// API endpoint for workflow definition export
router.get('/api/v1/workflows/:id/export', authenticate, authorize('workflow:export'), async (req, res) => {
  const { id } = req.params;
  const { format = 'json' } = req.query;

  const workflow = await workflowEngine.getDefinition(id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  const exportData: WorkflowExport = {
    id: workflow.id,
    version: workflow.version,
    name: workflow.name,
    status: workflow.active ? 'enabled' : 'disabled',
    states: Object.entries(workflow.states).map(([name, def]) => ({
      name,
      transitions: Object.keys(def.transitions),
      onEnter: def.onEnter?.map(a => a.name) ?? [],
      onExit: def.onExit?.map(a => a.name) ?? [],
    })),
    triggers: workflow.triggers.map(t => ({
      type: t.type,
      config: t.config,
    })),
    exportedAt: new Date().toISOString(),
  };

  res.setHeader('Content-Type', 'application/json');
  res.json(exportData);
});

// list all workflows (cursor-paginated)
router.get('/api/v1/workflows', authenticate, authorize('workflow:list'), async (req, res) => {
  const { domain, status, cursor, limit = 50 } = req.query;
  const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200); // max 200

  const workflows = await workflowEngine.listDefinitions({
    domain,
    active: status === 'enabled' ? true : status === 'disabled' ? false : undefined,
    cursor,        // opaque cursor from previous response
    limit: parsedLimit + 1, // fetch one extra to determine has_more
  });

  const hasMore = workflows.items.length > parsedLimit;
  const items = hasMore ? workflows.items.slice(0, parsedLimit) : workflows.items;
  const lastItem = items[items.length - 1];

  res.json({
    data: items.map(w => ({
      id: w.id,
      name: w.name,
      version: w.version,
      status: w.active ? 'enabled' : 'disabled',
      domain: w.domain,
    })),
    next_cursor: hasMore && lastItem ? encodeCursor(lastItem.id, lastItem.createdAt) : null,
    has_more: hasMore,
  });
});

// cursor encoding/decoding helpers
function encodeCursor(id: string, timestamp: Date): string {
  return Buffer.from(JSON.stringify({ id, ts: timestamp.toISOString() })).toString('base64url');
}

function decodeCursor(cursor: string): { id: string; ts: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
```

### 12.2 Outbound Webhooks

**FRD Reference**: FR-CORE-INT-002

#### 12.2.1 Webhook Idempotency for Receivers

**Idempotency Guarantee**: Webhook payloads include unique event ID for receiver-side deduplication.

**Mechanism**:
- Each webhook includes `X-Webhook-ID` header containing the unique `eventId`
- `eventId` is deterministically generated from workflow context (see §12.2.2)
- Same ID sent on every retry attempt
- Receivers SHOULD deduplicate based on this ID

**Receiver Contract**:
| Header | Purpose |
|--------|---------|
| `X-Webhook-ID` | Unique event identifier for deduplication |
| `X-Webhook-Signature` | HMAC signature for payload verification |
| `X-Webhook-Timestamp` | Event timestamp (for replay attack prevention) |

**Retry Behavior**:
- On delivery failure: retry up to 3 times with exponential backoff
- Same `X-Webhook-ID` sent on each retry
- Receiver must handle duplicate deliveries idempotently

**Documentation for Webhook Consumers**:
```
## Handling Aptivo Webhooks

Your endpoint MUST:
1. Verify the X-Webhook-Signature header
2. Deduplicate based on X-Webhook-ID
3. Return 200 OK within 30 seconds
4. Process asynchronously if needed

Example deduplication:
- Check if X-Webhook-ID exists in your processed set
- If yes, return 200 OK (already processed)
- If no, process event and store ID with TTL
```

#### 12.2.2 Sender-Side Idempotency

**Idempotency Guarantee**: Each event is sent exactly once per webhook subscription.

**Mechanism**:
- Event ID generated deterministically: `hash(workflowId + stepId + event + webhookConfigId)`
- BullMQ deduplicates jobs by event ID (jobId)
- Same event ID used on retry (stable across attempts)
- No timestamp in ID ensures same workflow step always produces same eventId

**Duplicate Behavior**: BullMQ silently deduplicates; delivery table uses event ID as key

**Idempotency Window**: Job lifetime + delivery record retention (7 days)

```typescript
interface WebhookConfig {
  id: string;
  url: string;
  events: string[];           // e.g., ['workflow.completed', 'hitl.approved']
  secret: string;             // for HMAC signature verification
  active: boolean;
  retryPolicy: RetryPolicy;
}

// workflow actions can include webhook calls - with sender-side idempotency
const webhookAction: ActionFn = async (ctx: WorkflowContext) => {
  const webhooks = await db.webhooks.findByEvent(ctx.event);

  for (const webhook of webhooks) {
    if (!webhook.active) continue;

    // generate stable event ID for idempotency (same ID on retry)
    const eventId = generateDeterministicUUID(
      ctx.workflowId,
      ctx.stepId,
      ctx.event,
      webhook.id
    );

    const payload = {
      id: eventId,              // event ID included in payload
      event: ctx.event,
      timestamp: new Date().toISOString(),
      workflowId: ctx.workflowId,
      data: ctx.eventData,
    };

    // sign payload for verification
    const signature = computeHMAC(JSON.stringify(payload), webhook.secret);

    // use eventId as jobId for BullMQ deduplication
    await webhookQueue.add('send-webhook', {
      url: webhook.url,
      payload,
      signature,
      eventId,
      webhookConfigId: webhook.id,
    }, {
      jobId: `webhook:${eventId}`,  // BullMQ deduplicates by jobId
      attempts: webhook.retryPolicy.maxAttempts,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
};

// webhook worker with logging - uses eventId for stable tracking
const webhookWorker = new Worker('send-webhook', async (job) => {
  const { url, payload, signature, eventId, webhookConfigId } = job.data;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': eventId,         // event ID, not config ID
        'X-Webhook-Timestamp': payload.timestamp,
      },
      body: JSON.stringify(payload),
    });

    // idempotent delivery logging via eventId
    await db.webhookDeliveries.upsert({
      id: eventId,
      webhookConfigId,
      payload,
      status: response.ok ? 'delivered' : 'failed',
      statusCode: response.status,
      attemptNumber: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  } catch (error) {
    await db.webhookDeliveries.upsert({
      id: eventId,
      webhookConfigId,
      payload,
      status: 'failed',
      error: error.message,
      attemptNumber: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    });
    throw error; // trigger retry
  }
});
```

### 12.3 Inbound Webhooks

**FRD Reference**: FR-CORE-INT-002

#### 12.3.1 Webhook Deduplication

**Idempotency Guarantee**: Each webhook is processed exactly once within the deduplication window.

**Mechanism**:
- Webhook ID extracted from `X-Webhook-ID` header, `X-Request-ID` header, or `body.id`
- ID checked against Redis set `webhooks:processed:{sourceId}`
- If present: return 200 OK without re-processing (idempotent success)
- If absent: add to set with configurable TTL before processing

**Duplicate Behavior**: Return HTTP 200 with `{ received: true, deduplicated: true }`

**Idempotency Window**: 7 days default (configurable per source via `source.deduplicationTTL`)

**Retry Sources Considered**:
- Webhook provider retry (e.g., Stripe retries for 72h, GitHub for 24h)
- Network timeout/retry at load balancer level
- Client-side replay on perceived failure

```typescript
// idempotent webhook handler with deduplication
router.post('/api/v1/webhooks/inbound/:sourceId', async (req, res) => {
  const { sourceId } = req.params;
  const signature = req.headers['x-webhook-signature'];

  // verify source is registered
  const source = await db.webhookSources.findById(sourceId);
  if (!source || !source.active) {
    return res.status(404).json({ error: 'Unknown webhook source' });
  }

  // verify signature
  const expectedSignature = computeHMAC(JSON.stringify(req.body), source.secret);
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // extract webhook ID for deduplication (priority order)
  const webhookId = req.headers['x-webhook-id']
    || req.headers['x-request-id']
    || req.body.id
    || req.body.event_id;

  if (!webhookId) {
    logger.warn({ sourceId }, 'Webhook received without ID - cannot deduplicate');
    // fall through to process, but log warning
  }

  // idempotency check: has this webhook been processed?
  if (webhookId) {
    const dedupeKey = `webhooks:processed:${sourceId}:${webhookId}`;
    const alreadyProcessed = await redis.get(dedupeKey);

    if (alreadyProcessed) {
      logger.info({ sourceId, webhookId }, 'Duplicate webhook detected - returning cached response');
      return res.status(200).json({
        received: true,
        deduplicated: true,
        originalProcessedAt: alreadyProcessed,
      });
    }

    // mark as processing BEFORE triggering workflow (crash-safe)
    const ttlSeconds = source.deduplicationTTL || 7 * 24 * 60 * 60; // 7 days default
    await redis.set(dedupeKey, new Date().toISOString(), 'EX', ttlSeconds);
  }

  // map external event to internal workflow trigger
  const trigger = source.eventMappings[req.body.event];
  if (trigger) {
    await workflowEngine.triggerEvent(trigger.workflowId, trigger.event, {
      source: sourceId,
      webhookId,
      externalEvent: req.body.event,
      payload: req.body.data,
    });
  }

  // log receipt (idempotent via webhookId)
  await db.inboundWebhooks.upsert({
    id: webhookId ? `${sourceId}:${webhookId}` : generateUUID(),
    sourceId,
    webhookId,
    event: req.body.event,
    payload: req.body,
    receivedAt: new Date(),
    triggered: !!trigger,
  });

  res.status(200).json({ received: true });
});
```

---

## 13. Idempotency Summary (Cross-Cutting)

This section provides a quick reference for all idempotency patterns used across the platform.

### 13.1 Idempotency by Component

| Component | Operation | Mechanism | Duplicate Behavior | Window |
|-----------|-----------|-----------|-------------------|--------|
| **Workflow Engine** | Step execution | Inngest memoization | Return cached result | Workflow lifetime |
| **Workflow Engine** | Event trigger | Inngest event ID | Ignore duplicate | 24 hours |
| **HITL Gateway** | Approval endpoint | Request status check + race guard | Return existing decision | Request lifetime |
| **HITL Gateway** | Decision recording | requestId constraint | ON CONFLICT ignore | Permanent |
| **HITL Gateway** | Workflow signal | Gated by recordDecision result | Only signal if inserted | N/A |
| **MCP Layer** | Tool execution | idempotencyKey + Redis cache | Return cached result | 24 hours (configurable) |
| **MCP Layer** | Queued requests | BullMQ jobId | Job deduplicated | Job lifetime |
| **Audit Service** | Log append | eventId or content hash | ON CONFLICT ignore | Permanent |
| **Audit Service** | Export | Deterministic exportId | Return existing export | 1 hour |
| **Audit Service** | Retention | Date-based archive | Already-archived skipped | Daily |
| **LLM Gateway** | Usage tracking | Deterministic UUID | ON CONFLICT ignore | Permanent |
| **Notification Bus** | Critical notifications | Novu transactionId | Novu ignores duplicate | transactionId lifetime (window undocumented) |
| **Notification Bus** | Non-critical | Best-effort | May duplicate (acceptable) | N/A |
| **Inbound Webhooks** | Webhook receipt | webhookId + Redis | Return cached response | 7 days (configurable) |
| **Outbound Webhooks** | Event enqueue | BullMQ jobId (eventId) | Job deduplicated | Job lifetime |
| **Outbound Webhooks** | HTTP send | X-Webhook-ID (eventId) | Receiver deduplicates | Receiver-defined |
| **File Storage** | Metadata create | fileId or content hash | Upsert | Permanent |
| **File Storage** | Scan status | fileId | Upsert | Permanent |
| **File Storage** | Delete | S3 key | Inherently idempotent | N/A |
| **Identity Service** | Magic link send | None (safe to retry) | Sends new email | N/A |
| **Identity Service** | OAuth redirect | Inherently idempotent | User re-authenticates | N/A |
| **Identity Service** | Session validation | Read-only | No side effects | N/A |
| **LLM Gateway** | Completion request | Non-idempotent (by design) | New response each call | Inngest memoizes |
| **LLM Gateway** | Provider fallback | Non-idempotent | Different provider response | Acceptable |

### 13.2 Idempotency Key Generation Patterns

```typescript
// pattern 1: deterministic UUID from components
import { v5 as uuidv5 } from 'uuid';
const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const id = uuidv5(`${workflowId}:${stepId}:${action}`, NAMESPACE);

// pattern 2: natural key (preferred when available)
const id = `${sourceId}:${webhookId}`;

// pattern 3: content hash (for variable-length inputs)
const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
const id = `${prefix}:${hash}`;
```

### 13.3 Database Idempotency Pattern

```sql
-- standard idempotent insert
INSERT INTO table_name (id, ...)
VALUES ($1, ...)
ON CONFLICT (id) DO NOTHING;
```

```typescript
// with return value check
const result = await db.table.insert({...}).onConflict('id').ignore();
if (result.rowCount === 0) {
  // duplicate - idempotent success
  return;
}
// new record inserted
```

### 13.4 Redis Idempotency Pattern

```typescript
// check-then-set with TTL
const key = `prefix:${idempotencyKey}`;
const existing = await redis.get(key);
if (existing) {
  return JSON.parse(existing); // cached result
}

// set before processing (crash-safe)
await redis.set(key, JSON.stringify({ status: 'processing' }), 'EX', ttlSeconds);

// process...
const result = await doWork();

// update with actual result
await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds);
return result;
```

### 13.5 Retry Source Checklist

When documenting a new trust-boundary operation, consider these retry sources:

| Source | Example | Typical Multiplier |
|--------|---------|-------------------|
| User action | Double-click, refresh | 2-3x |
| Client SDK | Built-in retry on timeout | 3x |
| Load balancer | Retry on 502/503 | 2x |
| Message queue | At-least-once delivery | 2-3x |
| Workflow engine | Step retry policy | 3x |
| External provider | Webhook retry (Stripe, GitHub) | 5-10x |

**Max retry depth calculation**: Multiply all applicable sources.
Example: client 3x × LB 2x × workflow 3x = 18x potential executions.

---

## 14. Security Threat Analysis

This section applies STRIDE-based threat modeling to the platform's attack surfaces. Each surface has explicit threat enumeration, mitigations (referencing existing ADD sections), and residual risk acknowledgment.

**Methodology**: STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege). Each identified threat is mapped to a specific mitigation or classified as accepted residual risk with justification.

### 14.1 Authentication & Authorization

**Surface**: Magic link login, OAuth callback, JWT session management, RBAC role assignment.
**Source**: §8.1-8.4, API Spec `/api/v1/auth/*`

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Magic link email interception | HTTPS-only delivery, link expiry (Supabase default: 1h), single-use tokens | Email account compromise outside platform control |
| **S** | OAuth redirect URI manipulation | Supabase-managed registered redirect URIs, PKCE for public clients | Dependent on Supabase OAuth implementation |
| **T** | JWT token modification | Supabase JWKS-based RS256 signature verification (§8.2) | N/A — cryptographic guarantee |
| **T** | Session token theft (XSS) | HttpOnly, Secure, SameSite cookies (Supabase-managed); CSP headers (Coding Guidelines §4.5) | Persistent XSS via other vectors |
| **R** | Login without audit trail | Supabase logs authentication events; application-layer audit for role changes (§9.2) | Supabase-side audit retention policy unknown |
| **I** | Account enumeration via magic link | API returns identical success response regardless of email existence | Timing side-channel possible |
| **D** | Magic link email flooding | Rate limiting on magic link endpoint (API Spec 429 response); Supabase-level rate limits | Distributed attacks may exceed rate limits |
| **E** | Privilege escalation via role assignment | Single write path (§8.3), deny-by-default RBAC, role changes audited | Admin account compromise |

### 14.2 HITL Approval Gateway

**Surface**: Approval token generation/verification, decision recording, workflow signaling.
**Source**: §4.1-4.6, API Spec HITL endpoints

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Approver impersonation via stolen token | JWT tokens scoped to specific requestId, signed with HS256 (§4.2); not reusable across requests | Token intercepted from notification channel before expiry |
| **S** | HITL_SECRET compromise → forge any token | Encrypted env var storage (Runbook §4.3), 180-day rotation | Symmetric key — compromise window matches rotation period |
| **T** | Approval payload manipulation | Server-side decision validation — only approve/reject/request-changes accepted (§4.5) | N/A |
| **T** | Race condition: concurrent approvals | Database-level guard: status check within transaction, ON CONFLICT dedup (§4.5.1, §4.6.1) | N/A — database guarantees |
| **R** | Decision without audit | Deterministic audit ID, actor, timestamp recorded (§4.6.1); append-only logs (§9.3) | N/A |
| **D** | Approval endpoint flooding | BearerAuth required, rate limiting (429), Idempotency-Key prevents duplicate processing | Distributed authenticated attacks |
| **E** | Bypass HITL to execute workflow directly | Workflow signals only accepted from authenticated HITL Gateway service (§4.5.1) | Compromised HITL service |

> **Accepted Residual Risk**: HS256 symmetric signing means HITL_SECRET compromise allows forging approval tokens for any pending request. Mitigated by: encrypted storage, rotation schedule, monitoring for anomalous approval patterns. **Phase 2 consideration**: migrate to RS256/ES256 asymmetric signing where only the issuing service holds the private key.

### 14.3 PII Data Stores

**Surface**: PostgreSQL tables containing personally identifiable information across `public` and domain schemas.
**Source**: §9.1, TSD §5.2 (Data Classification)

**PII Inventory** (from TSD §5.2 Data Classification):
- `users`: email, name
- `aptivo_hr.candidates`: name, email, phone, address, salary expectations
- `aptivo_hr.contracts`: salary, compensation details
- `audit_logs`: actor metadata (may contain PII in context)
- `files`: uploaded documents (resumes, identity documents)

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Unauthorized access via stolen credentials | BearerAuth on all endpoints, deny-by-default RBAC (§8.3), domain-scoped roles | Compromised admin credentials |
| **T** | SQL injection | All database access via Drizzle ORM parameterized queries (Coding Guidelines §4.1); no raw SQL permitted | ORM bypass or misconfiguration |
| **T** | Unauthorized data modification | Single-owner write model per table (§9.1), audit logging on all mutations (§9.2) | Database admin has direct write access |
| **R** | Data modification without trail | All mutations create audit entries with deterministic IDs (§9.2-9.3); append-only enforcement | N/A |
| **I** | Bulk data exfiltration | RBAC limits access; audit export audited (§9.5); API pagination limits per-request volume | Authorized user with export access — no anomaly detection |
| **I** | PII leakage in application logs | Pino logger with field redaction (Coding Guidelines §6.1) | PII fields (email, phone) not in default redaction list |
| **I** | Cross-schema data access | Schema isolation per domain (§9.1), application-level tenant context | Shared PostgreSQL — cross-schema queries possible with connection credentials |
| **I** | Backup data exposure | Managed daily backups (Runbook §8.5), encrypted at rest (BRD §8.1) | Backup restoration to unauthorized environment |
| **D** | Database resource exhaustion | Connection pool limits, statement timeouts (§2.3.2) | Single shared instance — cross-domain contention |
| **E** | Privilege escalation via domain role | Domain roles scoped to specific domain (§8.3), admin-only role assignment | Cross-domain escalation if isolation misconfigured |

> **Accepted Residual Risk**: Pino log redaction covers `password`, `token`, `secret` but not PII fields. Configure Pino redaction paths for all TSD §5.2 PII-classified fields before production deployment.

> **Accepted Residual Risk**: No anomaly detection for bulk data access patterns. Phase 2: implement audit-based threshold alerts on large query result sets and export operations.

### 14.4 MCP Tool Execution

**Surface**: External MCP server integration via stdio/HTTP transport, tool invocation with environment secrets.
**Source**: §5.1-5.5, Sprint 0 SP-06

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Malicious MCP server impersonation | Server registry with approved servers only (§5.1); transport config per server | Compromised npm package in supply chain |
| **T** | Malformed/malicious tool responses | Zod schema validation on all tool outputs (§5.3) | Schema-valid but semantically malicious responses |
| **T** | Tool argument injection | Tool-specific argument schemas; HITL gates on critical tools (§5.1 `requiresApproval`) | LLM prompt injection → malicious arguments (see §14.5) |
| **T** | SSRF via MCP HTTP transport | MCP server URLs defined in registry (§5.1), not user-supplied | Registry misconfiguration |
| **R** | Undocumented tool calls | Idempotency keys logged (§5.1.1); LLM usage tracking (§7.2); Inngest step audit | N/A |
| **I** | Secret exfiltration via stdio MCP | SP-06 identifies risk; env sanitization planned | **UNMITIGATED until SP-06 complete** — all env vars accessible |
| **D** | MCP server resource exhaustion | Circuit breaker (§5.2): 5 failures → open, 30s half-open; timeout: 10s; BullMQ rate queueing (§5.4) | Coordinated slowloris across servers |
| **D** | Runaway MCP process | Cockatiel timeout enforcement (§5.2) | No documented memory/CPU limits |
| **E** | MCP server accesses unauthorized resources | Scoped capabilities per registry (§5.1); HITL approval gates for critical tools | Compromised server + env secrets = full credential access |

> **Accepted Residual Risk (CRITICAL — pre-production blocker)**: MCP servers spawned via `npx` inherit the full process environment including database credentials and API keys. Sprint 0 SP-06 plans environment sanitization but is not yet implemented. A compromised MCP server package could exfiltrate all platform secrets. **Must complete SP-06 env sanitization before production deployment.**

### 14.5 LLM Gateway — Prompt Injection

**Surface**: LLM prompts constructed from user-supplied and MCP-retrieved data, processed by OpenAI/Anthropic/Google.
**Source**: §7.1-7.2

LangGraph.js runs inside Inngest `step.run()` activities for AI reasoning tasks (sentiment analysis, narrative clustering, resume parsing). User-controlled data flows into prompts that influence workflow decisions.

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Input crafted to impersonate system prompt | System/user prompt separation in provider SDKs (standard practice) | Prompt injection via data embedded in system context |
| **T** | Direct prompt injection — user text manipulates LLM | HITL approval gates verify human oversight of LLM-influenced decisions (§4.1) | **UNMITIGATED at input layer** — no prompt hardening documented |
| **T** | Indirect prompt injection — MCP data contains adversarial instructions | Zod schema validation on MCP outputs (§5.3) provides structural checks | **UNMITIGATED for semantic content** — valid schema but adversarial text |
| **T** | Output manipulation → wrong HITL recommendation | Human approver verifies decision (§4.1) | Human may rubber-stamp LLM recommendation |
| **R** | LLM decisions without audit | LLM usage logged: token counts, model, provider (§7.2); Inngest step logging | Prompt/response content not logged |
| **I** | Data exfiltration via crafted prompts | LLM responses stay within workflow context, not directly user-facing in Phase 1 | Injection could encode PII in tool-call arguments reaching external MCP servers |
| **D** | Cost manipulation via token-maximizing prompts | Daily/monthly budget caps (§7.2) | Attacker staying below threshold |
| **E** | Jailbreaking → unauthorized tool calls | MCP tool calls subject to idempotency (§5.1.1) and HITL gates (§5.1 `requiresApproval`) | Sophisticated jailbreak bypassing content filters |

> **Accepted Residual Risk (Phase 1)**: Direct and indirect prompt injection are unmitigated at the input layer. Compensating controls: (1) HITL approval gates provide human verification, (2) MCP idempotency keys prevent duplicate tool calls, (3) schema validation constrains tool argument structure. **Phase 2**: add prompt injection detection, output validation guardrails, and structured output enforcement.

### 14.6 File Upload & Storage

**Surface**: Presigned URL upload, ClamAV scanning, S3/Minio storage, presigned URL download.
**Source**: §9.6-9.8, API Spec Files endpoints

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Unauthorized upload via leaked presigned URL | Presigned URLs have TTL expiry (§9.6); obtaining URL requires BearerAuth | URL shared before expiry |
| **T** | Path traversal via filename | S3 key generated server-side: `files/${fileId}/${sanitizedFilename}` (§9.6) | Filename sanitization must strip `../` and special chars |
| **T** | Content-type spoofing | Server-side content-type validation recommended | Partial — API accepts client-declared contentType |
| **T** | Malware in uploaded files | ClamAV integration with quarantine (§9.8); scan-before-download gate | Zero-day malware; decompression bombs |
| **R** | File access without audit | File access logged: actor, entityType, accessType (§9.7) | N/A |
| **I** | Unauthorized download | Access control inherited from linked entity (§9.7); download requires BearerAuth | Presigned download URL shared after generation |
| **D** | Storage exhaustion | 50MB max file size (API Spec); presigned URL scoped to declared size | No per-user upload quota or concurrent upload limit |
| **E** | Access file from another entity | Entity-link verification on download (§9.7) | IDOR if entity-link validation incorrectly implemented |

### 14.7 Webhook Security

#### 14.7.1 Inbound Webhooks

**Surface**: `POST /api/v1/webhooks/inbound/{sourceId}` — accepts payloads from external systems.
**Source**: §12.3, API Spec

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Forged webhook payload | HMAC signature verification via X-Webhook-Signature (§12.3.1) | Webhook secret compromise |
| **T** | Replay attack | X-Webhook-Timestamp freshness check; Redis dedup with 7-day TTL (§12.3.1) | Replay within clock-skew tolerance |
| **I** | Source enumeration via sourceId | Pre-registered sources; invalid sourceId returns 404 | Brute-force enumeration |
| **D** | Webhook flooding | Rate limiting (429 response); dedup prevents duplicate processing | Volume exceeding rate limit |
| **D** | Oversized payload | Body size limit at reverse proxy / application layer | Not explicitly specified in API Spec |

#### 14.7.2 Outbound Webhooks

**Surface**: HTTP POST to user-configured webhook URLs.
**Source**: §12.2, API Spec

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Receiver cannot verify sender | HMAC signature (§12.2.1); X-Webhook-Timestamp | Receiver must implement verification |
| **T** | SSRF via user-supplied webhook URL | **Not yet implemented** — must validate against private IP ranges | **Pre-production blocker** |
| **I** | Sensitive data in webhook payload | Event payloads defined per type (§12.2) | Payload content review needed |
| **D** | Overwhelming receiver | Exponential backoff retry (§12.2.2); BullMQ dedup | Receiver-side concern |

> **Accepted Residual Risk (pre-production blocker)**: Outbound webhook URL validation for SSRF is not documented. Must implement: block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8), cloud metadata endpoints (169.254.169.254), enforce HTTPS-only.

### 14.8 Inngest Webhook Endpoint

**Surface**: HTTP endpoint (`/api/inngest`) serving Inngest SDK for event ingestion and workflow execution.
**Source**: §3.1-3.3

The Inngest SDK serves an HTTP endpoint that receives events from Inngest Cloud to trigger and manage workflow executions. This endpoint is the control plane for all platform workflows.

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Unauthorized event injection | Inngest SDK validates `INNGEST_SIGNING_KEY` on all incoming requests | Signing key compromise |
| **T** | Event payload manipulation | Signing key verification ensures payload integrity | N/A |
| **D** | Event flooding | Inngest Cloud manages ingestion rate; SDK rejects unsigned requests | Inngest Cloud-level DoS (§2.3.2) |
| **E** | Trigger privileged workflow | Event-to-function matching by name (§3.2); HITL gates on privileged operations | Function triggered without HITL gate |

> **Implementation Note**: The `INNGEST_SIGNING_KEY` environment variable MUST be configured in all environments. The Inngest SDK rejects unsigned requests when this key is set. Verify during deployment that the key is present and that request validation is not bypassed by middleware.

### 14.9 Residual Risk Register

| ID | Surface | Risk | Likelihood | Impact | Status | Phase |
|----|---------|------|------------|--------|--------|-------|
| RR-1 | MCP §14.4 | Env secret exfiltration via compromised npm MCP server | Medium | Critical | **Pre-production blocker** — SP-06 | 1 |
| RR-2 | LLM §14.5 | Direct prompt injection via user-supplied data | Medium | High | Accepted — HITL compensating control | 1 |
| RR-3 | LLM §14.5 | Indirect prompt injection via MCP-retrieved data | Low | High | Accepted — schema validation | 1 |
| RR-4 | HITL §14.2 | HS256 symmetric key compromise | Low | Critical | Accepted — encrypted storage, rotation | 2 (asymmetric) |
| RR-5 | PII §14.3 | PII leakage in application logs | Medium | Medium | **Pre-production blocker** — extend Pino redaction | 1 |
| RR-6 | PII §14.3 | No bulk exfiltration detection | Low | High | Accepted — audit logging covers trail | 2 (anomaly detection) |
| RR-7 | Webhooks §14.7 | Outbound SSRF via user-supplied URL | Medium | Medium | **Pre-production blocker** — URL validation | 1 |
| RR-8 | File §14.6 | Content-type spoofing | Low | Low | Accepted | 1 |
| RR-9 | Auth §14.1 | Supabase security vulnerability | Low | Critical | Accepted — exit strategy documented (§8.1) | — |

---

## 15. References

| Document | Purpose |
|----------|---------|
| Platform Core FRD | Functional requirements this ADD implements |
| Platform Core BRD | Business requirements and constraints |
| Original ADD (HR) | Historical reference (`docs/03-architecture/add.md`) |
| Original ADD (Crypto) | Historical reference (`docs/temp/`) |
| Coding Guidelines | Development standards (`docs/05-guidelines/`) |
| OWASP Threat Modeling | [owasp.org/www-community/Threat_Modeling](https://owasp.org/www-community/Threat_Modeling) |
| OWASP Top 10 for LLM | [owasp.org/www-project-top-10-for-large-language-model-applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) |
| Microsoft STRIDE | [learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats) |

---

**END OF PLATFORM CORE ADD**
