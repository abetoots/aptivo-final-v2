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
> **Vendor Ratification (2026-03-18)**: All vendor decisions reviewed by Claude + Gemini + Codex, ratified by human partner. See decision records below.

| Decision | Selection | Rationale | Alternatives Considered | Exit Strategy | Participants |
|----------|-----------|-----------|------------------------|---------------|-------------|
| Workflow Engine | **Inngest** (Buy) | AgentKit for MCP, step.waitForEvent for HITL, durable execution | Temporal (heavier ops), Bull+Redis (no durable state) | Standard event-driven; workflows are Inngest functions | Multi-model consensus (S0), ratified by human (S15) |
| AI Reasoning | **LangGraph.js** (inside Inngest) | Runs as activity within Inngest workflow steps | LangChain (heavier), custom agent loop | Graph-based; portable to any JS agent framework | Multi-model consensus (S0), ratified by human (S15) |
| Identity | **Supabase Auth Pro** ($25/mo) | OIDC SSO + SAML + MFA for enterprise. Free tier lacks SSO. | Auth0 (free OIDC but 7K MAU, no free SAML), Keycloak (free but self-hosted ops) | Standard OIDC/JWT; exit to Keycloak documented in Auth TSD §1.2 | Claude (S9), ratified by human (S15). SAML review: when first customer requests it |
| Notifications | **Novu** (Buy) | Multi-channel, templates, quiet hours, saves 3 weeks | Knock (newer), custom build (3+ weeks) | Template-based; adapter interface enables swap | Multi-model consensus (S0), ratified by human (S15) |
| Runtime | Node.js 24 LTS + TypeScript | Async I/O, strong typing, LangGraph.js compatibility | Deno (less ecosystem), Go (no LangGraph) | Standard Node.js; no vendor lock-in | Multi-model consensus (S0), ratified by human (S15) |
| Database | **PostgreSQL 16** (Railway Managed, Patroni HA) | ACID, JSONB, full-text search. HA cluster for <30s failover. | CockroachDB (distributed but complex), PlanetScale (MySQL-based) | Standard SQL; Drizzle adapters are thin wrappers | Multi-model consensus (S0), ratified by human (S15) |
| Cache / Redis Hosting | **Upstash** (serverless Redis 7) | Per-request pricing ($0-10/mo), Railway region compat, REST API for edge | AWS ElastiCache ($15+/mo base), self-hosted Redis (ops burden) | Standard Redis protocol; swap URL + token | Claude (S10), ratified by human (S15) |
| File Storage | **Railway Volumes** (S3-compat) | Integrated with Railway platform, usage-based pricing | AWS S3 (cross-cloud networking), Cloudflare R2 (zero egress), MinIO (self-hosted) | S3 API; swap endpoint + credentials | Claude (S6), ratified by human (S15) |
| ORM | **Drizzle** | Type-safe SQL, zero runtime overhead, lightweight | Prisma (heavier Rust runtime, slower cold starts), Kysely (smaller ecosystem) | Standard SQL; adapters are thin wrappers over queries | Claude (S0), ratified by human (S15) |
| LLM Provider (Primary) | **OpenAI** (GPT-4o) | Best reasoning quality, widest model range, well-documented API | Anthropic Claude, Google Gemini | Provider interface abstraction in `@aptivo/llm-gateway` | Claude (S1), ratified by human (S15) |
| LLM Provider (Secondary) | **Anthropic** (Claude) | Fallback + cost optimization for structured tasks | Google Gemini, single-provider (simpler but no fallback) | Same provider interface as primary | Claude (S1), ratified by human (S15) |
| Email Transport | **SMTP provider** (TBD at deployment) | Generic SMTP fallback for Novu. Vendor chosen at deploy time. | SendGrid (free 100/day), AWS SES ($0.10/1K), Postmark ($15/mo best reputation) | Standard SMTP; swap host + credentials | Claude (S13), deferred to deployment by human (S15) |
| Audit | Append-only SQL | Phase 1 simplified; hash-chaining deferred to Phase 3+ | Event sourcing (complex), separate audit DB (ops overhead) | Standard SQL append-only pattern | Multi-model consensus (S0), ratified by human (S15) |

**Build (unique differentiators)**:
- MCP Integration Layer
- HITL Gateway
- LLM Gateway (BRD-mandated cost tracking)

> **Decision Record: Supabase Free → Pro Upgrade**
> - **Trigger**: FR-CORE-ID-001 requires enterprise SSO (OIDC/SAML) — free tier doesn't support OIDC providers
> - **Options evaluated**:
>   1. Supabase Pro ($25/mo) — adds OIDC providers, SAML, advanced MFA. Minimal migration from existing free tier.
>   2. Keycloak self-hosted (free) — full OIDC/SAML, but requires container hosting, config management, security patching. Significant ops burden for a small team.
>   3. Auth0 free tier — OIDC included up to 7K MAU, but no SAML on free tier, and pricing escalates past free.
> - **Decision**: Supabase Pro — minimal migration (already using Supabase), OIDC + SAML in managed service, $25/mo acceptable for enterprise feature
> - **Trade-off**: Vendor lock-in deepens (Pro features not portable). Exit strategy: Keycloak migration documented in Auth TSD §1.2.
> - **SAML status**: Contract-only stub (`SamlNotConfigured`). Review when first customer requests SAML — if no demand by Phase 3 end, re-evaluate Pro justification.
> - **Participants**: Claude (Sprint 9 planning), Gemini + Codex (Sprint 15 multi-model review), ratified by human partner (Sprint 15)

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

> **Phase 1 Reality**: Aptivo runs as a single-region monolith deployment on Railway with a shared PostgreSQL instance and a single Redis node. True failure domain isolation (separate databases per domain, multi-region DR) is a Phase 2+ capability. Phase 1 relies on logical isolation (schema separation, circuit breakers, timeout paths) and documented degradation behavior.

#### 2.3.1 Component Criticality Classification

| Tier | Definition | Recovery Priority | Components |
|------|-----------|-------------------|------------|
| **Critical** | Failure causes platform-wide outage, data corruption risk, or compliance violation | Immediate (SEV-1/SEV-2) | Workflow Engine, HITL Gateway, Identity Service, Audit Service, PostgreSQL, Redis, Railway |
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
| **Failure Domain** | File management boundary. Depends on S3-compatible object storage (Minio/Railway Volumes) for binary data and PostgreSQL for file metadata. ClamAV for malware scanning. |
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
| **Fallback Behavior** | Phase 1: Application reconnects automatically when database recovers. Restore from backup if unrecoverable (RTO < 8h manual, RPO < 24h). Phase 2+: Automatic failover to standby via connection pooler (RTO < 4h). |

> **Accepted Risk (Phase 1)**: PostgreSQL is a single point of failure. All domains share one instance. Mitigation: managed daily backups, health monitoring, and documented recovery playbook (RUNBOOK §8.5). Phase 2 upgrade path: HA-tier database with standby nodes, connection pool isolation per schema.

#### 2.3.4 Schema Isolation vs. Failure Isolation

Schema isolation (Phase 1) provides **data separation** — each domain's tables reside in separate schemas (`public`, `aptivo_hr`, `aptivo_trading`). This prevents cross-domain data access at the application layer via schema-scoped queries and ownership rules (§9.1).

Failure isolation requires **infrastructure separation** — separate database instances, separate connection pools, and independent health monitoring. Schema isolation does NOT provide failure isolation because all schemas share:

- **Connection pool**: A single pool serves all schemas. Pool exhaustion in one domain blocks all domains.
- **Disk I/O**: All schemas share the same underlying storage volume. Heavy writes in `aptivo_trading` degrade reads in `aptivo_hr`.
- **CPU and memory**: Query load from any schema consumes shared compute resources.
- **WAL (Write-Ahead Log)**: A single WAL serves all schemas. WAL pressure from one domain affects replication and recovery for all.
- **Replication lag**: If HA is enabled (Phase 2+), replication lag applies uniformly across all schemas.
- **Backup/recovery lifecycle**: Backup and restore operations are instance-wide. You cannot restore a single schema independently from a managed backup.

**Phase progression**:
| Phase | Isolation Level | Mechanism |
|-------|----------------|-----------|
| Phase 1 | Schema isolation only | Separate schemas, shared everything else |
| Phase 2+ | Connection pool per schema | Statement timeouts per domain, pool exhaustion isolation |
| Phase 3+ | Separate database instances per domain | Full failure isolation, independent scaling and recovery |

> **MCP Circuit Breaker Scope Decision**: The cockatiel circuit breaker in §5.2 is configured **per-MCP-server**, not per-tool. Rationale: (1) Most MCP servers expose a single transport endpoint — if the server is down, all tools are unavailable. (2) Per-tool circuit breakers would require N×M state tracking (N servers × M tools) with minimal benefit for Phase 1's ~13 MCP integrations. (3) Per-tool granularity is appropriate when a single server has tools with vastly different reliability characteristics. Phase 2 consideration: Add per-tool override capability for servers where specific tools have distinct failure modes (e.g., a server with both read-only and write-mutating tools).

##### HITL Blast Radius Map

| Workflow Type | HITL Dependency | Business Impact if HITL Offline | TTL Fallback |
|---|---|---|---|
| Trade execution (Crypto) | Required — gating trade action | Trades blocked until HITL recovers or TTL expires | 24h → auto-reject |
| Contract approval (HR) | Required — gating contract send | Contract signing delayed | 7d → auto-reject |
| Interview scheduling (HR) | Optional — notification only | Schedule proceeds without explicit approval | N/A |
| Security alert (Crypto) | Required — gating alert escalation | Alert notification delayed, not blocked (fallback to direct notification) | 4h → auto-escalate |

> **Accepted Risk — Novu Single Notification Path (Phase 1)**: Novu Cloud is the sole notification delivery channel. There is no fallback provider for email or Telegram delivery. If Novu is unavailable: (1) HITL approval notifications are not delivered — workflows fall back to TTL timeout path; (2) Non-critical notifications (status updates, reminders) are lost. This is accepted for Phase 1 because: Novu's uptime SLA is adequate for Phase 1 volume; implementing a fallback SMTP path adds ~1 week of development; HITL TTL timeout provides a safety net for critical approvals. Phase 2: Add direct SMTP fallback for critical HITL notifications; add in-app notification as secondary channel.

#### Resource Allocation (Phase 1)

| Component | Railway Service | vCPU | RAM | Notes |
|---|---|---|---|---|
| API Server | Web service | 1 shared vCPU | 512 MiB | Auto-scale 1–3 containers |
| Workflow Worker | Worker service | 1 shared vCPU | 512 MiB | Single container Phase 1 |
| ClamAV Scanner | Worker service | 1 shared vCPU | 2 GiB | Signature DB minimum 1.2 GiB; peak 2.4 GiB during `freshclam` updates (§6.7) |
| PostgreSQL | Railway PostgreSQL | 1 shared vCPU | 1 GiB | 25 GiB storage, 20 max connections |
| Redis | Upstash (external) | Serverless | Serverless | Per-request pricing |

> **Note**: Railway uses usage-based pricing with per-service resource allocation. Actual CPU burst behavior depends on host load. These are Phase 1 minimum allocations; auto-scaling triggers are documented in §10.

#### Graceful Shutdown Behavior

- **SIGTERM Handling**: Railway sends `SIGTERM` to containers during rolling deployments and scale-down events. The platform allows a **configurable drain period** (default: 30s on Railway) before sending `SIGKILL`.
- **API Server**: On SIGTERM, stop accepting new connections, drain in-flight HTTP requests (30s timeout), then exit. Express/Fastify built-in graceful shutdown handles this.
- **Workflow Worker**: On SIGTERM, stop polling for new Inngest events, allow in-progress workflow steps to complete (bounded by Inngest step timeout, typically ≤120s), then exit. Inngest memoization ensures incomplete workflows resume from last completed step on new container.
- **BullMQ Worker**: On SIGTERM, stop processing new jobs, allow current job to complete (bounded by job timeout), then exit. Stalled jobs are auto-retried by BullMQ's stall detection (default: 30s stall interval).
- **Implementation Note**: All containers MUST handle SIGTERM. Node.js requires explicit `process.on('SIGTERM', ...)` handler — the default behavior terminates immediately without drain.

> **Worker Health Check Model (Phase 1)**: The workflow worker runs as a separate Railway **worker** service (not a web service). Workers do not expose HTTP ports. Health is determined by: (1) Process liveness — Railway restarts workers that exit unexpectedly; (2) Inngest heartbeat — the Inngest SDK maintains a connection to Inngest Cloud; if the worker disconnects, Inngest redistributes pending work to other instances. Phase 1 runs a single worker instance. Phase 2: Add explicit health check endpoint on a diagnostic port for custom monitoring.

> **Phase 2+ PostgreSQL HA — Design Target (NOT YET OPERATIONAL)**: The following design parameters must be documented before Phase 2 go-live:
> - **Failover Trigger**: Railway PostgreSQL with Patroni HA uses automatic primary promotion on health check failure. Document: health check interval, failure threshold, promotion time (typically 15–30s for managed PostgreSQL HA). Application must handle brief connection interruption during promotion.
> - **Replication Mode**: Railway PostgreSQL with Patroni HA uses streaming replication (asynchronous by default). Document: expected replication lag under normal load, RPO during failover (potential loss of uncommitted transactions), per-schema impact assessment (`aptivo_trading` financial data vs. `aptivo_hr` operational data).
> - **Failback Procedure**: After standby promotion, the old primary becomes a new standby. Document: whether failback is automatic or manual, data verification steps post-failover, connection string update requirements (managed service typically handles transparently via connection pooler).
> - **Connection Pool Behavior**: Document: pool per schema/domain, connection string failover handling, application retry behavior during promotion window.

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

##### Railway — Critical (Infrastructure)

| Field | Value |
|-------|-------|
| **Failure Domain** | **Platform infrastructure boundary.** Single-region deployment on Railway. All containers (API, workers) run in one region. Railway uses an isolated container model — each service runs in its own container with dedicated resources. |
| **Blast Radius** | **Total platform outage** on regional failure. All API endpoints, workflow workers, and background jobs unavailable. Individual container failures are isolated to the affected service. |
| **Propagation Mode** | Sync (infrastructure failure immediately affects all hosted services) |
| **Propagation Outcome** | **Cascading** — regional outage takes down all services simultaneously. Container-level failures are isolated (Railway restarts individual containers). |
| **Impacted Components** | All services and infrastructure |
| **Isolation Mechanisms** | Health checks (liveness probes via healthcheck path) trigger container restarts for individual container failures; rolling deployment with instant rollback; auto-scaling via Railway service configuration. These mitigate container-level failures but not regional outages. |
| **Fallback Behavior** | Container failure: automatic restart via health checks. Regional outage: restore to alternate region manually (RTO < 8h per RUNBOOK §8.6). Rollback via `railway up` with previous container image or Railway dashboard rollback. Phase 2+: multi-region DR with DNS failover (RTO < 4h). |

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

#### 2.3.3 Resilience Triad Reference

Every external dependency must document timeout, retry, and circuit breaker (CB) policies. The MCP Integration Layer (§5.2) uses cockatiel for the full triad composition; other dependencies document their policies below.

| Dependency | Criticality | Timeout | Retry | Circuit Breaker | Fallback |
|------------|-------------|---------|-------|-----------------|----------|
| **MCP Servers** | Standard | 10s per attempt (cockatiel `timeout`) | 3 attempts, exponential backoff (cockatiel `retry`) | 5 consecutive failures → open, 30s half-open (cockatiel `circuitBreaker`) | Workflow error path |
| **LLM Providers** | Standard | 30s per request (connection: 5s, read: 30s) | 2 attempts on 5xx/timeout, exponential backoff (1s base); no retry on 4xx except 429 | 3 consecutive 5xx → open per provider, 60s half-open; fallback to secondary provider while open | Provider fallback (primary → secondary) |
| **Inngest Cloud** | Critical | Event send: 5s; step scheduling: managed by Inngest SDK | 2 attempts on network failure with 1s backoff; SDK handles internal retries | Not applicable — Inngest SDK manages connectivity; app monitors via health check | Workflows resume from last step on recovery |
| **Novu Cloud** | Standard | 5s per API call | 2 attempts on 5xx/timeout with 500ms backoff | 5 consecutive failures → open, 60s half-open | Phase 1: no fallback (single notification path); HITL falls back to TTL timeout |
| **Supabase Auth** | Critical | Token validation: 2s; magic link send: 5s; OAuth redirect: 10s | Token validation: 1 attempt after 100ms; magic link: no retry (safe to re-request); OAuth: no retry | Not applicable — JWKS caching (1h TTL, 24h stale-if-error) provides resilience for token validation; magic link/OAuth depend on live Supabase | JWKS cache for existing sessions (up to 24h); new logins fail with friendly error |
| **PostgreSQL** | Critical | Statement: 30s; connection acquire: 5s; idle connection: 10min | Connection acquire: 3 attempts with 500ms backoff on pool exhaustion; no retry on query timeout (application handles) | Not applicable — connection pool (max 20, Phase 1) acts as concurrency limiter; pool exhaustion returns error immediately | Application reconnects on recovery; restore from backup (RPO < 24h) |
| **Redis** | Critical | Operation: 500ms; connection: 2s | Connection: 3 attempts with 500ms backoff; operation: no retry (callers handle per fallback policy) | Not applicable — per-consumer fallback policies (§2.3.2) activate immediately on error | Per-consumer: fail-closed (idempotency), fail-open (rate limiting, dedup, sessions) |
| **File Storage (S3)** | Standard | Upload: 30s; download: 15s; presign: 2s | 3 attempts with 2s linear backoff on 5xx/timeout | 5 consecutive failures → open, 30s half-open | Workflow error path; file metadata remains accessible |
| **ClamAV** | Standard | 30s per file scan (configurable) | 2 attempts on timeout/connection error with 5s backoff | 3 consecutive failures → open, 60s half-open; files flagged `scan_pending` while open | Files quarantined as `scan_pending` until scanner recovers |

> **Coherence Note**: For the MCP layer, the cockatiel composition wraps `timeout` (innermost) inside `circuitBreaker` inside `retry` (outermost). Each attempt gets the full 10s timeout. Total retry budget: 3 × 10s + backoff ≈ 37s. This must be less than the Inngest step-level timeout (default: 120s). For other dependencies, timeout values are per-operation, not total.

##### MCP Triad Coherence Calculation

The MCP resilience triad (timeout × retry × circuit breaker) must satisfy: **total retry budget < Inngest step timeout**.

| Parameter | Value | Source |
|---|---|---|
| Per-attempt timeout | 10s | cockatiel `timeout` |
| Retry attempts | 3 | cockatiel `retry` (maxAttempts) |
| Backoff (exponential) | 1s, 2s, 4s | cockatiel `ExponentialBackoff` |
| Total retry budget | 3 × 10s + (1s + 2s + 4s) = 37s | Calculated |
| Circuit breaker threshold | 5 consecutive failures → open | cockatiel `ConsecutiveBreaker(5)` |
| Circuit breaker half-open | 30s | cockatiel `halfOpenAfter` |
| Inngest step timeout | 120s (default) | Inngest SDK |
| **Coherence check** | **37s < 120s ✓** | Total retry < step timeout |

> **Constraint**: If the MCP retry budget (37s) ever approaches the Inngest step timeout (120s), increase the Inngest step timeout or reduce MCP retry attempts. The cockatiel composition wraps: `retry(circuitBreaker(timeout(fn)))` — timeout is innermost, retry is outermost.

> **Inngest Durability Guarantees**: Inngest provides at-least-once execution with step-level memoization. Completed steps are not re-executed on workflow replay. For Inngest's SLA and durability commitments, see [Inngest Terms of Service](https://www.inngest.com/terms) and §10 SLA Commitments below.

> **Cross-Reference — TSD Resilience Values**: Concrete timeout, retry, and circuit breaker configuration values are specified in TSD `configuration.md` §7.2 (Resilience Configuration). The ADD documents the architectural patterns and policies; the TSD documents the exact numeric values used in code. If values in this document conflict with the TSD, the TSD takes precedence for implementation.

> **Phase 1 Scope**: PostgreSQL and Redis triads use managed-service defaults augmented by application-level configuration. Phase 2+ will add connection pool per schema/domain, statement timeouts per domain, and separate Redis instances for job queues vs. cache.

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

> **Updated Sprint 11**: Policy engine fully implemented with DB-persisted policies, quorum evaluation, and sequential chain runners. See [TSD §12](../04-specs/platform-core/hitl-gateway.md#12-approval-policy-engine-sprint-11) for schema and validation rules.

```typescript
// packages/hitl-gateway/src/policy/policy-types.ts — implemented in Sprint 11
interface ApprovalPolicyRecord {
  id: string;
  name: string;
  type: 'single' | 'quorum' | 'sequential';
  threshold: number | null;        // M in M-of-N (quorum only)
  approverRoles: string[];         // ordered for sequential
  maxRetries: number;              // bounded re-submissions for request_changes
  timeoutSeconds: number;          // per-approver timeout
  escalationPolicy: EscalationPolicy | null;
  createdAt: Date;
}

// quorum evaluation — packages/hitl-gateway/src/policy/quorum-engine.ts
// approved: approvalsCount >= threshold
// rejected: rejectionsCount > (totalApprovers - threshold)
// pending: otherwise

// sequential chain — packages/hitl-gateway/src/policy/sequential-chain.ts
// walks approverRoles[] in order; rejection short-circuits; request_changes pauses
```

**Implementations**:
- Policy schema: `packages/database/src/schema/approval-policies.ts`
- Quorum engine: `packages/hitl-gateway/src/policy/quorum-engine.ts`
- Sequential chain: `packages/hitl-gateway/src/policy/sequential-chain.ts`
- Multi-request creation: `packages/hitl-gateway/src/request/multi-request-service.ts`
- Multi-decision service: `packages/hitl-gateway/src/decision/multi-decision-service.ts`

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

#### HITL TTL Cascade Behavior

When a HITL request's TTL expires:

1. The `step.waitForEvent()` call in the parent workflow returns `null` (no event received within timeout).
2. The workflow follows its **TIMEOUT error path** — typically: log timeout, mark workflow as `timed_out`, notify admin.
3. **Dependent workflows**: If the timed-out workflow was itself a step in a parent workflow (nested execution), the parent receives the timeout result and follows its own error path.
4. **Cascade depth**: Sprint 11 adds parent/child workflow orchestration (§4.8). A HITL timeout in a child workflow propagates as a `timed_out` child result to the parent; the parent decides whether to abort or continue with partial results.
5. **Data impact**: No data is modified on HITL timeout. The workflow step that was gated by approval is simply skipped (or the workflow is marked as failed, depending on the error path design).
6. **Notification**: On HITL timeout, a notification is sent to the workflow owner and the approver(s) indicating the approval request expired without a decision.

### 4.7 Multi-Approver Token Security Model (Sprint 11)

**FRD Reference**: FR-CORE-HITL-002, FR-CORE-HITL-004

**TSD Reference**: [hitl-gateway.md §15](../04-specs/platform-core/hitl-gateway.md#15-multi-approver-request-flow-sprint-11)

#### 4.7.1 Per-Approver JWT Tokens

In the single-approver model (Sprint 2), one JWT token is issued per request. The multi-approver model (Sprint 11) issues a unique JWT per approver, each with the `approverId` embedded as a claim:

```typescript
// token payload includes approverId binding
const token = await generateToken({
  requestId,
  approverId,       // unique per approver — prevents cross-approver impersonation
  action: 'decide',
  ttlSeconds,
});
```

#### 4.7.2 Token Hash Join Table

Per-approver token hashes are stored in the `hitl_request_tokens` join table rather than inline on the request record:

```
hitl_request_tokens
├── id             (uuid PK)
├── request_id     (FK → hitl_requests.id, cascade delete)
├── approver_id    (FK → users.id)
├── token_hash     (varchar 64) — SHA-256 hex, raw JWT never stored
└── token_expires_at (timestamptz)

UNIQUE INDEX (request_id, approver_id) — one token per approver per request
```

**Implementation**: `packages/database/src/schema/hitl-request-tokens.ts`

#### 4.7.3 Cross-Approver Impersonation Prevention

The multi-decision service verifies that the submitted token's hash matches the record for the specific approver:

1. Look up `hitl_request_tokens` for the `(requestId, approverId)` pair
2. If no record exists → reject with `TokenVerificationError`
3. Verify the submitted token against the stored hash
4. If hash mismatch → reject (approver B cannot use approver A's token)

This prevents an approver who received their own valid token from submitting decisions on behalf of another approver.

#### 4.7.4 Token Refresh on Resubmit

When a `request_changes` decision triggers a resubmission cycle (§17 in TSD):

1. Old tokens for the request are invalidated by the new status transition
2. New tokens are minted for the current approver(s) on resubmit
3. The `hitl_request_tokens` records are updated with fresh hashes and expiry times
4. Retry count is incremented and checked against `maxRetries` from the policy

### 4.8 Parent/Child Workflow Orchestration (Sprint 11, WFE-007)

**FRD Reference**: FR-CORE-WFE-007

**TSD Reference**: [hitl-gateway.md §18](../04-specs/platform-core/hitl-gateway.md#18-parentchild-workflow-orchestration-sprint-11)

#### 4.8.1 Overview

Parent workflows can spawn child workflows and wait for their completion using Inngest event correlation. The orchestrator is fully decoupled from Inngest internals via abstract `EventSender` and `WorkflowStep` interfaces.

**Implementation**: `packages/hitl-gateway/src/workflow/orchestrator.ts`

#### 4.8.2 Event Correlation Pattern

Correlation uses `parentWorkflowId` in event data. The parent emits a spawn event, and the child emits a completion event when done:

```
Parent Workflow                          Child Workflow
──────────────                          ──────────────
spawnChild(parentId, childId, ...)
  → emit childEventName                 ← triggered by childEventName
  │   { parentWorkflowId, childWorkflowId }
  │                                       │ ... child steps ...
  │                                       │
waitForChildren(step, config, [childId]) completeChild(parentId, childId, result)
  │ step.waitForEvent(                    → emit 'workflow/child.completed'
  │   'workflow/child.completed',           { parentWorkflowId, childWorkflowId, result }
  │   if: parentId && childId match
  │ )
  ↓ resumed with child result
```

#### 4.8.3 Event Names

| Event | Direction | Purpose |
|-------|-----------|---------|
| `workflow/child.spawned` | Parent → system | child workflow trigger (informational) |
| `workflow/child.completed` | Child → parent | child signals completion with result |

#### 4.8.4 Serial Child Waiting (Known Limitation)

In Sprint 11, `waitForChildren` iterates over expected children sequentially:

```typescript
for (const childId of expectedChildren) {
  const event = await step.waitForEvent(...);
  // blocks until this child completes or times out before moving to next
}
```

This means child B's timeout clock does not start until child A completes or times out. **Sprint 13** is planned to add parallel fan-out using `Promise.all` over concurrent `step.waitForEvent` calls.

#### 4.8.5 Timeout Handling with Partial Results

If a child times out, the orchestrator records `{ status: 'timed_out' }` for that child and continues waiting for remaining children. The aggregate result includes both `completedCount` and `timedOutCount`, allowing the parent workflow to decide whether partial results are acceptable.

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
  supportsIdempotency?: boolean; // server supports Idempotency-Key header (IETF standard)
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

#### 5.3.1 MCP Response Size Limits

- **Maximum response payload**: 1 MiB per tool call response. Responses exceeding this limit are truncated and the tool call returns a `RESPONSE_TOO_LARGE` error.
- **Memory budget**: MCP tool responses are buffered in memory during schema validation. The 1 MiB limit prevents OOM from unbounded responses.
- **Truncation behavior**: For streaming responses, the client stops reading after 1 MiB. For non-streaming, the response is rejected if `Content-Length` exceeds the limit.
- **Configuration**: Per-server override available via `MCPServerConfig.maxResponseSize` (default: 1 MiB, max: 10 MiB).
- **Rationale**: Protects against denial-of-service from MCP servers returning unbounded data (e.g., paginating an entire database into a single response).

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

**Cache Key Strategy**: `mcp:cache:{serverId}:{toolName}:{argsHash}` where `argsHash` is SHA-256 of canonical JSON args (first 16 hex chars).

**Stale-Read Behavior** (per data type):

| Data Type | On Cache Miss | On MCP Server Unavailable (CB Open) | Rationale |
|-----------|---------------|--------------------------------------|-----------|
| Price data | Fetch from source | **Return error** (do not serve stale price) | Financial decisions require fresh data |
| Transactions | Fetch from source | **Return error** (do not serve stale tx state) | Transaction status must be current |
| Social posts | Fetch from source | **Serve stale** with `X-Cache-Stale: true` header | Engagement data tolerates staleness |
| Security scans | Fetch from source | **Serve stale** (contract code is immutable) | Static analysis results don't change |
| Calendar availability | Fetch from source | **Return error** (scheduling requires fresh data) | Double-booking risk |

> **Freshness SLO**: Data served from cache is guaranteed to be no older than the TTL value. During normal operation, event-driven invalidation may refresh data sooner. When stale-read returns error, the workflow step follows its error path.

> **Cross-Reference — Cache Invalidation Patterns**: For the standard cache-aside pattern with TTL used across the platform, see `docs/04-specs/common-patterns.md` §6.2 (Cache Patterns). The ADD §5.6 documents cache-specific policies (TTLs, freshness SLOs, invalidation rationale); common-patterns documents the generic implementation pattern.

#### 5.6.1 Cache Freshness SLO

| Cache Type | TTL | Freshness SLO | Rationale |
|---|---|---|---|
| MCP tool responses (price data) | 60s | ≤60s stale | Financial decisions require near-real-time data |
| MCP tool responses (social) | 15min | ≤15min stale | Engagement data tolerates moderate staleness |
| Permission/RBAC cache | 5min | ≤5min stale | Accepted risk: revoked permissions active for up to 5 minutes (see §8.3) |
| Session cache | JWT lifetime | ≤JWT expiry | Session validity bounded by JWT expiration |
| Workflow definition cache | N/A (not cached) | Always fresh | Read from PostgreSQL on each trigger |

> **SLO Statement**: Data served from platform caches is guaranteed to be no older than the configured TTL. The permission cache has an accepted risk window of up to 5 minutes where revoked permissions remain active (documented in §8.3). No event-driven cache invalidation exists in Phase 1 — all caches rely on TTL expiry only (see §5.6.3 rationale).

#### 5.6.2 Session Cache Invalidation

- **Phase 1 Decision**: TTL-only invalidation. No event-driven session cache invalidation.
- **Rationale**: Supabase Auth manages sessions externally. The platform validates JWTs on each request using cached JWKS public keys (1h TTL, 24h stale-if-error). Session revocation is handled by Supabase — when a session is revoked, the JWT becomes invalid at its next natural expiry. The gap between revocation and JWT expiry is bounded by the access token lifetime (configured in §8.4).
- **Implication**: A revoked session may remain "valid" for up to the access token TTL (e.g., 15 minutes if `accessTokenLifetime = 15min`). This is an accepted risk for Phase 1.
- **Phase 2**: If tighter revocation is required, add a Redis-based token blacklist checked on each request.

#### 5.6.3 Cache Cold Start Expectations

- **First-request latency**: On container startup or after cache flush, all cache entries are empty. First requests for cached data experience full round-trip latency to the data source (PostgreSQL, MCP servers, Supabase).
- **Expected cold start penalties**:

  | Cache Type | Cold Start Latency | Warm Latency |
  |---|---|---|
  | JWKS keys | ~200ms (Supabase JWKS endpoint) | <1ms (memory) |
  | Permission/RBAC | ~10ms (PostgreSQL query) | <1ms (Redis) |
  | MCP tool responses | 1-30s (depending on external API) | <1ms (Redis) |

- **Warm-up strategy**: Phase 1 uses lazy cache population (on-demand). No pre-warming on startup. This is acceptable because: (1) Rolling deployments ensure at least one warm container serves traffic; (2) Cold start penalty is bounded and transient; (3) Pre-warming adds startup complexity for minimal benefit at Phase 1 scale.
- **Phase 2**: Consider pre-warming critical caches (JWKS, permission) on container startup to eliminate first-request penalty.

#### 5.6.4 TTL-Only Invalidation Rationale

> **Design Decision — TTL-Only Cache Invalidation (Phase 1)**: All platform caches use time-based expiry (TTL) without event-driven invalidation (no Redis pub/sub, no cache-aside pattern with invalidation events). Rationale: (1) Phase 1 has a single API container (1–3 instances) — cache coherence across instances is trivially managed by TTL since all instances share the same Redis. (2) Event-driven invalidation requires: defining invalidation events for each cache entry, subscribing to PostgreSQL LISTEN/NOTIFY or Redis pub/sub, handling missed invalidation events, and testing invalidation race conditions. This adds ~2 weeks of development for marginal freshness improvement at Phase 1 scale. (3) The accepted staleness windows (5min for permissions, 60s for prices) are within business tolerance. (4) Phase 2 trigger: If the platform scales beyond 3 containers or if permission staleness causes user-visible issues, implement event-driven invalidation for the permission cache first (highest business impact).

### 5.7 PostgreSQL Projection Divergence Reconciliation

- **Context**: Workflow execution state is authoritatively owned by Inngest (§3.5). The `workflow_executions` table in PostgreSQL is a read-optimized projection updated by Inngest lifecycle events.
- **Divergence scenario**: If an Inngest lifecycle event is lost (network partition, event delivery failure), the PostgreSQL projection may diverge from Inngest's authoritative state (e.g., workflow shows `running` in PostgreSQL but is actually `completed` in Inngest).
- **Detection**: Scheduled reconciliation job (daily, Inngest-triggered) compares PostgreSQL `workflow_executions` status with Inngest API for all workflows in `running` or `suspended` state longer than their expected TTL.
- **Resolution**: On divergence detection, update PostgreSQL projection to match Inngest state. Log reconciliation as audit event. Alert if divergence count exceeds threshold (>5 per reconciliation run).
- **Phase 1 scope**: Manual reconciliation via admin API endpoint. Scheduled daily reconciliation via Inngest cron function.
- **Phase 2**: Real-time reconciliation via Inngest webhook events for state changes.

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

#### 6.4.1 Novu Client Wiring (Phase 1.5 Implementation)

> **As-Built (P1.5-03)**: The composition root uses env-gated Novu initialization. When `NOVU_API_KEY` is set, the real `@novu/node` SDK is loaded via dynamic `require()` and wrapped in `createNovuSdkClient()`. When the SDK is unavailable or the key is missing, `createNovuStubClient()` provides a no-op fallback that returns `{ acknowledged: true }`. Both implement the `NovuSdkInstance` interface defined in `apps/web/src/lib/novu-client.ts`. The client is wrapped in `NovuNotificationAdapter` from `@aptivo/notifications` which handles template resolution, subscriber sync, and transactionId generation. Workflow ID defaults to `'generic-notification'` unless overridden via `NOVU_WORKFLOW_ID` env var.

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
const MONTHLY_BUDGET_USD = 1_000; // per domain (P1.5 as-built, reconciled from §7.2.2)

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

#### 7.2.2 Production Store Implementation (Phase 1.5)

> **As-Built (P1.5-02)**: The composition root wires real Drizzle-backed stores for budget enforcement and usage logging. `createDrizzleBudgetStore(db)` implements `BudgetStore` (getConfig, getDailySpend, getMonthlySpend) against the `llmBudgetConfigs` and `llmUsageLogs` tables — string numeric columns (PostgreSQL `numeric`) are parsed to `number` on read. `createDrizzleUsageLogStore(db)` implements `UsageLogStore.insert()` with `costUsd` stored as string-encoded decimal for precision. Both are injected into `BudgetService` and `UsageLogger` respectively within `getLlmGateway()`. Provider initialization is env-gated: OpenAI loads when `OPENAI_API_KEY` is set (models: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo), Anthropic loads when `ANTHROPIC_API_KEY` is set (models: claude-3-opus, claude-3-5-sonnet, claude-3-5-haiku). Both use dynamic `require()` with try/catch for graceful degradation when SDKs are not installed. Daily limit: $50/domain, monthly limit: $1,000/domain (configurable via `llmBudgetConfigs` table).

### 7.3 LLM Output Validation Strategy

- **Threat**: LLM responses are **untrusted external input**. They may contain: injection attempts (HTML/JS for display contexts), hallucinated data that could corrupt downstream records, PII from training data leakage, or adversarial content designed to influence HITL approvers.
- **Phase 1 Validation Pipeline**:
  1. **Structural validation**: All LLM responses are parsed as JSON and validated against Zod schemas (§14.5.1). Invalid responses trigger provider fallback or workflow error path.
  2. **Content sanitization before storage**: LLM-generated text stored in PostgreSQL (e.g., workflow step results, HITL summaries) is sanitized: HTML tags stripped, script injection patterns removed, maximum field lengths enforced.
  3. **Content sanitization before display**: LLM-generated text displayed in HITL approval screens is HTML-escaped. No `innerHTML` or `dangerouslySetInnerHTML` — use text content only.
  4. **No direct database writes**: LLM output never directly populates SQL queries. All LLM-derived data flows through typed interfaces and parameterized queries (Drizzle ORM).
- **Phase 2**: Add content filtering classifier for harmful/inappropriate content; hallucination detection against ground truth; output token scanning for PII patterns.

### 7.4 LLM Retry Cost Management

- **Problem**: LLM retries (on timeout, 5xx, or provider fallback) incur duplicate token costs. Unlike MCP tool calls, LLM completions are non-idempotent — each retry generates a new response and is billed separately.
- **Cost protection mechanisms**:
  1. **Retry budget cap**: Maximum 2 retry attempts per LLM request (§2.3.3). Total cost exposure: 3× single request cost.
  2. **Provider fallback cost awareness**: Fallback provider may have different per-token pricing. The LLM Gateway logs cost for both primary and fallback attempts.
  3. **Inngest memoization**: At the workflow level, `step.run()` memoization prevents re-executing LLM steps on workflow replay. Only the first execution (and its retries) incur cost.
  4. **Budget enforcement**: Daily ($50) and monthly ($1,000) caps (§7.2) are checked before each attempt, including retries. A retry that would exceed the budget is blocked.
  5. **Exponential backoff on 429**: Rate limit responses (429) trigger backoff rather than immediate fallback, reducing unnecessary cost from hitting the secondary provider.
- **Worst-case cost per request**: 3 attempts × max_tokens (4096) × highest provider rate = ~$0.50. With daily cap of $50, maximum ~100 worst-case requests per day.

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

#### 8.3.1 Access Control Matrix

Mapping of API operations to required roles. `*` = any authenticated user. Deny-by-default: unlisted operations require `admin`.

| Resource | Operation | Roles | Notes |
|----------|-----------|-------|-------|
| Health checks | GET /health/* | public | No auth required |
| Auth | POST /auth/magic-link, /auth/callback | public | No auth required |
| Workflows | list, get, create, update, delete | admin, user | Viewers excluded |
| Workflows | validate | admin, user | Pre-deployment check |
| Workflows | export | admin, user | Interop export |
| HITL requests | list, get | * | Filtered by involvement |
| HITL decisions | approve, reject, request-changes | * | Must hold valid HITL action token |
| Audit logs | list, get | admin | Compliance access |
| Audit exports | create, list, get, download | admin | Creates audit trail entry |
| Files | upload-url, get, download-url, delete | * | Access inherited from linked entity (§9.7) |
| Users | list | admin | User management |
| User roles | assign | admin | Audited role changes |
| Webhooks | list, create, update, delete, test | admin | Webhook configuration |
| Inbound webhooks | receive | public | HMAC signature auth, not JWT |
| Domain roles | list, create, update, delete | admin | Domain role management |

> **Phase 1 Note**: Service-to-service auth is not applicable — Phase 1 is a monolith deployment. The Inngest Cloud → app boundary is secured via INNGEST_SIGNING_KEY (§14.8). Inbound webhooks use HMAC signature verification (§12.3). Phase 2: add internal API key scheme when services are split.

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

> **Secrets Management (Phase 1)**: Secrets are stored as encrypted environment variables on Railway (see RUNBOOK §4.3 for the full inventory). The BRD's reference to "HashiCorp Vault or equivalent" (BRD §8.1) describes the target architecture; Phase 1 uses Railway's encrypted env var storage as an interim solution. Migration to a dedicated secrets manager is a Phase 2+ consideration triggered by: >20 secrets, need for dynamic secret rotation, or multi-cloud deployment.

### 8.6 MFA Step-Up Flow

- **FRD Requirement**: FRD references MFA enforcement for sensitive operations.
- **Phase 1 Design**: Supabase Auth supports TOTP-based MFA (Time-based One-Time Password). The platform implements a **step-up authentication** pattern:
  1. **Standard login**: Magic link or OAuth → session with `aal1` (Authenticator Assurance Level 1).
  2. **MFA enrollment**: Users optionally enroll TOTP via Supabase MFA API. After enrollment, login produces `aal2`.
  3. **Step-up trigger**: Sensitive operations require `aal2`. If current session is `aal1` and user has MFA enrolled, API returns `403` with `mfa_required` error code. Client prompts for TOTP verification.
  4. **Sensitive operations requiring step-up**: Role assignment changes, webhook secret rotation, audit export, domain admin actions.
- **Supabase MFA Integration**:
  ```typescript
  // check assurance level
  const { data: { currentLevel } } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (currentLevel === 'aal1' && requiredLevel === 'aal2') {
    return res.status(403).json({ error: 'MFA_REQUIRED', message: 'This action requires MFA verification' });
  }
  ```
- **Phase 1 scope**: MFA is **optional enrollment**, not mandatory. Step-up is required only for the operations listed above. Phase 2: Evaluate mandatory MFA for admin roles.

### 8.7 Supabase Session Configuration

| Parameter | Value | Rationale |
|---|---|---|
| `jwt.exp` (access token lifetime) | 900s (15 min) | Short-lived access tokens limit exposure window |
| Refresh token rotation | Enabled (one-time use) | Each refresh produces new access + refresh token pair |
| Refresh token reuse interval | 10s | Grace period for concurrent requests using same refresh token |
| Refresh token lifetime | 7 days (604,800s) | Balance between UX (stay logged in) and security |
| Session idle timeout | None (Supabase default) | Idle timeout managed by refresh token expiry |
| Max sessions per user | Admin: 1, User: 3 (configurable) | Per-role concurrent session limits enforced server-side |

> **Configuration Location**: These values are configured in Supabase Dashboard → Authentication → Settings → Session. They are NOT managed in application code. Changes require Supabase dashboard access (admin only).

> **Phase 2**: Session limits enforced by `SessionLimitService` (Redis-backed). See `apps/web/src/lib/auth/session-limit-service.ts`.

> **JWT Lifetime Summary**: Access tokens expire after 15 minutes. Refresh tokens expire after 7 days with one-time-use rotation. HITL approval tokens have per-policy TTLs (24h–7d, see §4.1). JWKS public keys are cached for 1 hour with 24h stale-if-error (see §2.3.2 Identity Service).

> **Rotation Cadence SSOT**: Secret rotation cadences are authoritatively documented in RUNBOOK §4.3. The ADD references rotation requirements but defers to the Runbook for specific cadences, procedures, and rollback steps. See also `docs/04-specs/configuration.md` §4 for environment variable naming conventions.

### 8.8 Secret Rotation Cadences

| Secret | Env Variable | Rotation Cadence | Procedure |
|---|---|---|---|
| Supabase JWT Secret | `SUPABASE_JWT_SECRET` | 90 days | Supabase Dashboard → Settings → JWT |
| S3 Storage Access Key | `S3_ACCESS_KEY`, `S3_SECRET_KEY` | 180 days | Railway Dashboard → Variables |
| Novu API Key | `NOVU_API_KEY` | 180 days | Novu Dashboard → Settings → API Keys |
| Inngest Signing Key | `INNGEST_SIGNING_KEY` | 180 days | Inngest Dashboard → Manage → Signing Key |
| Inngest Event Key | `INNGEST_EVENT_KEY` | 180 days | Inngest Dashboard → Manage → Event Key |
| HITL Signing Secret | `HITL_SECRET` | 180 days | Generate new HS256 key, deploy, invalidate old tokens |
| Webhook HMAC Secrets | `WEBHOOK_SECRET_*` | 180 days | Regenerate per-source, notify webhook providers |
| LLM Provider API Keys | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. | 90 days | Provider dashboard → API Keys |
| Database URL | `DATABASE_URL` | On compromise only | Railway Dashboard → PostgreSQL → Reset |
| Redis URL | `REDIS_URL` | On compromise only | Upstash Dashboard → Reset Password |

> **SSOT**: This table is the authoritative source for rotation cadences. The Runbook §4.3 contains step-by-step rotation procedures and rollback steps for each secret. See also `docs/04-specs/configuration.md` §4 for the complete environment variable inventory.

### 8.9 Per-Secret Access Control

| Secret | Accessed By | Access Method | Notes |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | API Server | Env var (process.env) | Public key — safe to expose to client |
| `SUPABASE_SERVICE_ROLE_KEY` | API Server | Env var (process.env) | Admin access — NEVER expose to client |
| `SUPABASE_JWT_SECRET` | API Server | Env var (process.env) | JWT verification |
| `DATABASE_URL` | API Server, Workflow Worker | Env var (process.env) | Connection string with credentials |
| `REDIS_URL` | API Server, Workflow Worker | Env var (process.env) | Connection string with credentials |
| `S3_ACCESS_KEY/SECRET_KEY` | API Server | Env var (process.env) | File storage access |
| `NOVU_API_KEY` | API Server | Env var (process.env) | Notification delivery |
| `INNGEST_SIGNING_KEY` | API Server | Env var (process.env) | Inngest webhook verification |
| `INNGEST_EVENT_KEY` | API Server, Workflow Worker | Env var (process.env) | Inngest event sending |
| `HITL_SECRET` | API Server | Env var (process.env) | HITL token signing |
| `WEBHOOK_SECRET_*` | API Server | Env var (process.env) | Per-source webhook HMAC |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | API Server (LLM Gateway) | Env var (process.env) | LLM provider access |

> **Phase 1 Limitation**: All env vars are accessible to all processes on the same container. No per-component secret scoping exists. Phase 2: Consider Railway per-service variable scoping or a secrets manager with per-service access policies.

### 8.10 Auth Context in Durable Execution (AB-1)

> **Closes**: Tier 2 finding AB-1 — async auth propagation through Inngest

Workflow steps executed via Inngest `step.run()` do **not** have access to the original HTTP request context. Auth identity must be explicitly serialized into the event payload and deserialized in each step.

#### 8.10.1 Pattern: Serialize Auth Context into Event Payload

```typescript
// at workflow trigger time — serialize auth context
const authContext = {
  userId: extractedUser.userId,
  email: extractedUser.email,
  roles: extractedUser.federatedRoles ?? [],
  permissions: [...resolvedPermissions],
  capturedAt: Date.now(), // for freshness validation
};

await inngest.send({
  name: 'workflow/started',
  data: { ...workflowInput, authContext },
});
```

#### 8.10.2 Pattern: Deserialize and Validate in Step Functions

```typescript
const workflow = inngest.createFunction(
  { id: 'example-workflow' },
  { event: 'workflow/started' },
  async ({ event, step }) => {
    const { authContext } = event.data;

    await step.run('authorized-operation', async () => {
      // validate auth context freshness (reject if >1h stale)
      const ageMs = Date.now() - authContext.capturedAt;
      if (ageMs > 3_600_000) {
        return Result.err({ _tag: 'AuthorizationError', reason: 'stale auth context' });
      }

      // use serialized identity for authorization checks
      const hasPermission = authContext.permissions.includes('required/permission');
      if (!hasPermission) {
        return Result.err({ _tag: 'AuthorizationError', reason: 'insufficient permission' });
      }

      // proceed with authorized operation
      return performAction(authContext.userId);
    });
  },
);
```

#### 8.10.3 Anti-Pattern: Request-Scoped Auth in Background Steps

```typescript
// ❌ WRONG — request is not available in Inngest step context
await step.run('bad-pattern', async () => {
  const user = await extractUser(request); // request is undefined here
});

// ✅ CORRECT — use serialized auth from event payload
await step.run('good-pattern', async () => {
  const { authContext } = event.data;
  // use authContext.userId, authContext.roles
});
```

#### 8.10.4 Edge Case: Role Change Between Steps

If a user's roles change between workflow start and a later step execution:

1. **Default behavior**: The step uses the roles captured at workflow start (eventual consistency)
2. **Strict mode** (for sensitive operations): Re-resolve permissions from DB within the step:

```typescript
await step.run('sensitive-operation', async () => {
  const freshPerms = await resolvePermissions(event.data.authContext.userId, db);
  // use freshPerms instead of cached authContext.permissions
});
```

The `capturedAt` timestamp enables consumers to decide whether to use cached or fresh permissions based on their sensitivity requirements.

### 8.11 Secret Rotation Procedure (SM-1)

> **Closes**: Tier 2 finding SM-1 — dual-secret rotation mechanism

Secret rotation must be zero-downtime. The application validates both old and new secrets during a configurable rotation window (default: 24h), ensuring no requests fail during the transition.

#### 8.11.1 Secrets Requiring Rotation

| Secret | Purpose | Rotation Frequency | Impact of Leak |
|--------|---------|-------------------|----------------|
| `HITL_SIGNING_SECRET` | JWT signing for HITL approval tokens | 90 days | Unauthorized approvals |
| `MCP_SIGNING_KEY` | HMAC signing for MCP tool calls | 90 days | Tool call forgery |
| Webhook HMAC keys | Verify inbound webhook authenticity | On compromise | Webhook injection |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase access | On compromise | Unauthorized API access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase admin access | On compromise | Full data access |

#### 8.11.2 Dual-Key Validation Pattern

During a rotation window, the application accepts both the old and new secret:

```typescript
// dual-key validation for zero-downtime rotation
function verifyWithRotation(
  payload: string,
  signature: string,
  secrets: { current: string; previous?: string },
): boolean {
  // try current secret first
  if (verifyHmac(payload, signature, secrets.current)) return true;

  // fall back to previous secret during rotation window
  if (secrets.previous && verifyHmac(payload, signature, secrets.previous)) {
    console.warn('request validated with previous secret — rotation in progress');
    return true;
  }

  return false;
}
```

#### 8.11.3 Rotation Procedure

1. **Generate new secret**: Create cryptographically random replacement
2. **Set `_PREVIOUS` env var**: Copy current secret to `{SECRET_NAME}_PREVIOUS`
3. **Update current secret**: Set `{SECRET_NAME}` to the new value
4. **Deploy**: Application now validates both keys
5. **Monitor**: Watch for `previous secret` log warnings — indicates old tokens still in circulation
6. **Remove previous**: After rotation window (24h default), remove `{SECRET_NAME}_PREVIOUS`
7. **Verify**: Confirm no `previous secret` warnings in logs

#### 8.11.4 Environment Variable Convention

```bash
# normal operation (single key)
HITL_SIGNING_SECRET=current-secret-value

# during rotation (dual-key window)
HITL_SIGNING_SECRET=new-secret-value
HITL_SIGNING_SECRET_PREVIOUS=old-secret-value
```

The `_PREVIOUS` suffix is the convention for all rotatable secrets. Application code checks for `{name}_PREVIOUS` and, if present, enables dual-key validation.

#### 8.11.5 Monitoring During Rotation

| Log Pattern | Meaning | Action |
|-------------|---------|--------|
| `previous secret` warning | Old secret still in use | Normal during rotation window |
| No warnings after 24h | All clients using new secret | Safe to remove `_PREVIOUS` |
| Validation failures spike | Rotation misconfigured | Rollback: restore old secret as current |

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

#### 9.4.2 PII Data Retention and Lifecycle

**FRD Reference**: BRD §2.2 (data retention framework), BRD §8.2 (Philippine DPA, DOLE, BIR)

The platform provides a data lifecycle framework for all PII data types. Domain addendums may override with domain-specific policies (e.g., HR domain addendum §3.3).

**Retention Periods by Data Type**:

| Data Type | Classification | Retention Period | Legal Basis | Regulation |
|-----------|---------------|-----------------|-------------|------------|
| User account (email, name) | PII | Active account + 30 days post-closure | Contractual necessity | DPA RA 10173 |
| Candidate profile (email, phone, address) | PII | Per domain policy (HR: consent withdrawal + 30 days) | Consent | DPA RA 10173 |
| Salary/compensation data | Financial | 7 years from contract end | Legal obligation | BIR, DOLE |
| Employment contracts | Financial | 7 years from contract end | Legal obligation | BIR, DOLE |
| Trade execution records | Financial | 10 years | Legal obligation | Financial regulations |
| Uploaded files (resumes, identity docs) | PII | Linked entity retention + 90 days | Same as linked entity | DPA RA 10173 |
| Uploaded files (contracts, financial) | Financial | 7 years from upload | Legal obligation | BIR, DOLE |
| HITL request/decision metadata | May contain PII | 7 years (inherits audit retention) | Legitimate interest | Compliance audit |
| Session data | Quasi-PII | 24 hours after expiry | Contractual necessity | DPA RA 10173 |
| Notification logs | May contain PII | 90 days | Legitimate interest | Operational |
| LLM usage logs | Non-PII | 2 years | Legitimate interest | Cost tracking |
| Audit logs | Contains anonymized PII | 7 years (default), domain overrides | Legal obligation | DPA, BIR, DOLE |
| Application logs | May contain PII (redacted) | 30d hot / 90d warm / 1yr cold | Legitimate interest | Operational |
| Analytics/aggregated data | Non-PII (anonymized) | Indefinite (must be fully anonymized, no PII) | Legitimate interest | N/A |

> **BRD §2.2 clarification**: "Longer/indefinite retention for analytics data" applies ONLY to fully anonymized, aggregated data that cannot be re-identified. Any data containing PII or that could be linked to individuals must follow the PII retention periods above.

**Deletion and Anonymization Procedures**:

```typescript
interface DataDeletionRequest {
  subjectId: string;           // user or candidate ID
  requestType: 'erasure' | 'account_closure';
  requestedAt: Date;
  completionDeadline: Date;    // 30 days from request (DPA requirement)
}

// deletion cascade across all storage locations
async function executeDataDeletion(request: DataDeletionRequest): Promise<DeletionReport> {
  const report: DeletionReport = { subjectId: request.subjectId, actions: [] };

  // 1. Primary database: anonymize or delete PII fields
  await db.users.anonymize(request.subjectId);           // email → hash, name → '[deleted]'
  await db.candidates?.anonymize(request.subjectId);     // domain-specific
  report.actions.push({ target: 'postgresql', status: 'anonymized' });

  // 2. File storage: delete uploaded files linked to subject
  const files = await db.files.findByOwner(request.subjectId);
  for (const file of files) {
    await s3.deleteObject(file.storagePath);
    await db.files.delete(file.id);
  }
  report.actions.push({ target: 's3_files', status: 'deleted', count: files.length });

  // 3. Redis cache: invalidate all cached data for subject
  await redis.del(`user:${request.subjectId}:*`);
  report.actions.push({ target: 'redis_cache', status: 'invalidated' });

  // 4. Audit logs: anonymize actor_id references (do NOT delete — compliance requirement)
  await db.auditLogs.anonymizeActor(request.subjectId);  // actor_id → null, metadata PII masked
  report.actions.push({ target: 'audit_logs', status: 'anonymized' });

  // 5. Notification logs: delete or anonymize
  await db.notificationLogs.deleteByRecipient(request.subjectId);
  report.actions.push({ target: 'notification_logs', status: 'deleted' });

  // 6. Third-party systems: request deletion
  //    - Sentry: user feedback deletion API
  //    - Novu: subscriber deletion API
  report.actions.push({ target: 'third_party', status: 'deletion_requested' });

  // 7. Application logs: cannot selectively delete from log aggregators
  //    Mitigation: PII redaction at source (§14.3.1) prevents PII in logs
  report.actions.push({ target: 'application_logs', status: 'pii_redacted_at_source' });

  // audit the deletion itself
  await auditService.log({
    action: 'DATA_DELETION_EXECUTED',
    resourceType: 'data_subject',
    metadata: { report, requestType: request.requestType },
  });

  return report;
}
```

**DSAR (Data Subject Access Request) Process**:
1. Subject requests data export via admin API or direct request
2. System collects all data linked to subject across: users, candidates, files, audit logs, notification logs
3. PII exported in JSON format with field descriptions
4. Export audited (§9.5 pattern)
5. Completion within 30 days (DPA requirement)

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
      checksumSha256: existing.checksumSha256,
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

  // compute checksum for integrity verification (FRD FR-CORE-AUD-002)
  const checksumSha256 = computeSHA256(content);

  // store export metadata (idempotent via exportId)
  await db.auditExports.upsert({
    id: exportId,
    requestedBy,
    requestedAt: new Date(),
    params,
    recordCount: logs.length,
    checksumSha256,
    status: 'completed',
    expiresAt: addDays(new Date(), 7),
  });

  return {
    downloadUrl: generatePresignedUrl(`exports/${exportId}.${params.format}`),
    checksumSha256,
    recordCount: logs.length,
  };
}
```

**Checkpoint and Recovery**: The audit export process has implicit checkpoints via idempotent operations:

| Checkpoint | State After | Recovery on Crash |
|-----------|-------------|-------------------|
| Export ID generated | `audit_exports` row does not exist yet | Re-request generates same ID (deterministic); no side effects |
| Audit action logged | Audit entry exists; export not started | Re-request finds no completed export; re-generates (audit log is idempotent via deterministic ID) |
| Logs queried + content generated | In-memory only; not persisted | Lost on crash; re-request re-queries and re-generates |
| Export upserted as `completed` | `audit_exports` row with checksum and metadata | Re-request finds completed export; returns cached result (idempotent) |

**Recovery trigger**: Exports are user-initiated (API request). A crashed export leaves no `completed` row, so the next identical request within the 1-hour bucket regenerates it. No automatic retry or monitoring required — the user simply re-requests the export.

**Data at risk**: Between log query and upsert, the generated content exists only in memory. On crash, the work is lost but can be safely re-executed (all operations are read-only or idempotent).

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

**Deployment Model**: Separate container service (not sidecar -- incompatible with Railway container model)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Container image | `ajilach/clamav-rest` or `benzino77/clamav-rest-api` | Two-in-one: daemon + REST API |
| Minimum RAM | 1.2 GiB | Signature database loading |
| Peak RAM (updates) | 2.4 GiB | During daily `freshclam` updates |
| API protocol | HTTP POST (multipart/form-data) | Scan file via `POST /api/v1/scan` |
| ClamAV port | 3310 (TCP) | Direct `clamd` connection (internal only) |
| Timeout | 30s per file (configurable) | Large files may need longer |
| Phase 1 deployment | Docker Compose service | Runs alongside API container |
| Production deployment | Railway worker service or external service | Evaluate cost vs. managed alternatives |

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

### 9.9 Access Log PII Policy

- **Platform access logs** (Railway load balancer) contain: client IP addresses, request URLs (may contain UUIDs/IDs), User-Agent strings, and response codes.
- **PII fields in access logs**:

  | Field | PII Risk | Mitigation |
  |---|---|---|
  | Client IP | Yes (quasi-PII) | Phase 1: stored by DO LB, outside app control. Phase 2: evaluate IP anonymization |
  | Request URL | Low (UUIDs only, no PII in query params by design) | API design ensures no PII in URL paths or query parameters |
  | User-Agent | Low (browser fingerprinting risk) | Truncated in audit logs (§14.3.1) |
  | Request/Response body | Not logged at LB level | Application logs redact PII (§14.3.1) |

- **Policy**: Application-level access logging (Pino HTTP request logs) applies the PII redaction rules in §14.3.1. Infrastructure-level access logs (DO LB) are retained per DO's data retention policy and are outside application control.
- **Phase 2**: Evaluate DO log forwarding with IP anonymization or request DO to implement GDPR-compliant log redaction.

### 9.10 Log Retention Alignment

| Log Type | Retention | Source of Truth | Notes |
|---|---|---|---|
| Application logs (Pino) | 30d hot / 90d warm / 1yr cold | Observability doc §3.4 | PII redacted at source |
| Audit logs (PostgreSQL) | 7 years (default), domain overrides | ADD §9.4 | Append-only, anonymizable |
| Infrastructure access logs (DO LB) | Per DO policy (~30 days) | DO platform default | Outside app control |
| Inngest execution logs | Per Inngest retention policy | Inngest Cloud | Workflow step data |
| Novu notification logs | Per Novu retention policy | Novu Cloud | Notification delivery records |
| Error tracking (Sentry) | 90 days | Sentry plan default | PII stripped by beforeSend hook |

> **Alignment Rule**: Application log retention (30d/90d/1yr) MUST NOT exceed audit log retention (7yr) for the same data. PII data in application logs is redacted at source (§14.3.1), making log retention a storage cost concern rather than a compliance concern. The Observability doc (`docs/05-guidelines/05d-Observability.md` §3.4) is the SSOT for application log retention tiers.

### 9.11 Legal Basis per Data Type (GDPR Art. 6 / DPA RA 10173)

| Data Type | Legal Basis | GDPR Article | DPA RA 10173 Basis | Notes |
|---|---|---|---|---|
| User account (email, name) | Contractual necessity | Art. 6(1)(b) | §12(a) — contract performance | Required for platform access |
| Candidate PII (phone, address) | Consent | Art. 6(1)(a) | §12(a) — consent | Explicit consent at data collection |
| Salary/compensation | Legal obligation | Art. 6(1)(c) | §12(c) — legal obligation | BIR/DOLE record-keeping requirements |
| Employment contracts | Legal obligation | Art. 6(1)(c) | §12(c) — legal obligation | Labor law compliance |
| Trade execution records | Legal obligation | Art. 6(1)(c) | §12(c) — legal obligation | Financial regulation |
| Audit logs (anonymized) | Legitimate interest | Art. 6(1)(f) | §12(e) — legitimate interest | Compliance and security monitoring |
| Session data | Contractual necessity | Art. 6(1)(b) | §12(a) — contract performance | Required for authentication |
| LLM usage logs | Legitimate interest | Art. 6(1)(f) | §12(e) — legitimate interest | Cost tracking and budget enforcement |
| Notification logs | Legitimate interest | Art. 6(1)(f) | §12(e) — legitimate interest | Delivery verification |
| Analytics (anonymized) | Legitimate interest | Art. 6(1)(f) | §12(e) — legitimate interest | Must be fully anonymized |

### 9.12 Consent Management

- **Consent collection**: Consent is captured at the point of data collection via explicit UI consent checkboxes (not pre-checked). Each consent action records: subject ID, consent type (e.g., `candidate_data_processing`), timestamp, IP address (anonymized), and consent text version.
- **Consent storage**: Consent records stored in PostgreSQL `public.consent_records` table. Consent is never inferred — always explicitly captured.
- **Consent withdrawal**: Subjects can withdraw consent via: (1) Self-service UI (Phase 2), or (2) Admin-assisted DSAR request (Phase 1). Withdrawal triggers the data deletion cascade (§9.4.2) within 30 days.
- **Consent granularity**: Consent is collected per-purpose (e.g., "process my application data", "send me notifications"), not blanket consent. Each purpose maps to specific data types and processing activities.
- **Audit trail**: Consent grants and withdrawals are recorded as audit events (§9.2) with deterministic IDs for idempotency.

### 9.13 Deletion Cascade Map

When a data subject requests erasure (§9.4.2), deletions must cascade across all storage systems:

| Storage System | Data Affected | Deletion Method | Verification |
|---|---|---|---|
| PostgreSQL (`public`) | `users` (email, name) | Anonymize: email → hash, name → '[deleted]' | Query returns anonymized data |
| PostgreSQL (domain) | `candidates`, `contracts` | Anonymize or delete per domain policy | Domain-specific verification |
| S3 Storage (Railway Volumes) | Uploaded files (resumes, docs) | `DeleteObject` API call | HEAD returns 404 |
| Redis | Session cache, user preferences | `DEL` with pattern `user:{id}:*` | Key scan returns empty |
| Novu | Subscriber profile | Novu subscriber delete API | Subscriber lookup returns 404 |
| Inngest | Workflow metadata referencing user | No direct deletion — data ephemeral in execution context | Event data auto-expires per Inngest retention |
| Audit logs | Actor references | Anonymize `actor_id` (do NOT delete — compliance requirement) | actor_id is null/anonymized |
| Application logs | PII-redacted at source | No action needed — PII not present in logs | Confirm via log search |
| Sentry | Error context | `DELETE /api/0/issues/{id}/` or auto-expire (90d) | Issue lookup returns 404 |

> **Cascade order**: PostgreSQL first (authoritative), then object storage, then cache, then third-party systems. Each step is logged as a checkpoint in the deletion workflow (Inngest function). Partial failures are retried individually — the workflow does not fail atomically.

### 9.14 Infrastructure Budget Caps

| Resource | Provider | Phase 1 Budget Cap | Free Tier Included | Exceed Behavior |
|---|---|---|---|---|
| Compute (Railway) | Railway | $50/mo | $5 free trial credit | Auto-scale stopped at 3 containers; alert at 80% |
| PostgreSQL (Railway) | Railway | $15/mo | Usage-based | No auto-upgrade; manual plan change required |
| Redis (Upstash) | Upstash | $10/mo | Free tier 10K cmds/day | Per-request pricing scales with usage |
| Object Storage (Railway Volumes) | Railway | $5/mo | Usage-based | Usage-based pricing |
| LLM API calls | OpenAI, Anthropic, Google | $50/day, $1,000/mo per domain | Varies by provider | Budget enforcement blocks requests (§7.2) |
| Notifications (Novu) | Novu Cloud | $0/mo | 10K events/mo | See §9.15 |
| Workflow execution (Inngest) | Inngest Cloud | $0/mo | 50K steps/mo | See §9.15 |
| Error tracking (Sentry) | Sentry | $0/mo | 5K errors/mo | Events dropped after quota |

> **Total Phase 1 infrastructure budget target**: ~$85-100/mo (excluding LLM API costs). LLM costs are domain-budgeted separately.

### 9.15 SaaS Free-Tier Exceed Behavior

| SaaS | Free Tier Limit | Exceed Behavior | Monitoring | Mitigation |
|---|---|---|---|---|
| **Novu Cloud** | 10,000 events/mo | Notifications silently dropped (no error returned) | Novu dashboard usage metrics; application-level delivery rate monitoring | Phase 2: self-host Novu ($20/mo) |
| **Inngest Cloud** | 50,000 steps/mo | New function invocations rejected; in-flight workflows complete | Inngest dashboard usage; application health check monitors step failures | Upgrade to Pro tier ($20/mo) or self-host |
| **Supabase Auth** | 50,000 MAU | New signups rejected; existing sessions continue | Supabase dashboard MAU counter | Well above Phase 1 needs (~10-50 users) |
| **Sentry** | 5,000 errors/mo | New error events dropped; existing data retained | Sentry quota usage dashboard | Increase sample rate; evaluate Sentry alternatives |

> **Critical risk**: Novu's silent-drop behavior means the platform has no signal when notifications are not delivered. Application-level monitoring must track expected vs. actual notification delivery rates.

### 9.16 Non-LLM Cost Attribution Model

- **Problem**: LLM costs are tracked per-domain via `llm_usage_logs` (§7.2). Infrastructure costs (compute, database, storage) are shared across domains and lack per-tenant attribution.
- **Phase 1 approach**: Static allocation based on expected usage split:

  | Resource | Crypto Domain % | HR Domain % | Platform Core % | Basis |
  |---|---|---|---|---|
  | Compute (API) | 40% | 40% | 20% | Estimated request volume |
  | PostgreSQL | 30% | 40% | 30% | Estimated data volume |
  | Redis | 50% | 20% | 30% | MCP idempotency keys (crypto-heavy) |
  | Object Storage | 10% | 70% | 20% | HR document uploads dominate |
  | Novu notifications | 30% | 50% | 20% | HR has more notification types |

- **Phase 2**: Dynamic cost attribution via per-domain resource tagging: PostgreSQL query tagging (`SET application_name`), Redis key prefix accounting, S3 bucket-per-domain, compute request routing metrics.

---

## 10. Deployment Architecture

### 10.1 Environment Topology

| Environment | Purpose | Infrastructure |
|-------------|---------|----------------|
| Development | Local dev | Docker Compose |
| Staging | Integration testing | Railway (staging environment) |
| Production | Live system | Railway (production environment) |

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

> **Multi-Model Consensus (2026-02-03)**: PaaS over Kubernetes. Unanimous decision by Claude Opus 4.5, OpenAI Codex, Gemini 3 Pro.
> **Vendor Migration (2026-03-18)**: Migrated from DigitalOcean App Platform to Railway via multi-model consensus after DO account lock. Railway provides equivalent PaaS capabilities with container-based deployment, usage-based pricing, and native PostgreSQL support with Patroni HA.

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
- **Date**: 2026-03-18
- **Decision**: Use Railway (migrated from DigitalOcean App Platform)
- **Status**: Active
- **Review Trigger**: Any K8s upgrade trigger met, or quarterly review

### 10.4 SLA Commitments and Measurement

#### 10.4.1 HITL Latency Measurement Point

- **BRD SLO**: "HITL delivery latency <10s P95"
- **Measurement point**: From the moment `step.waitForEvent()` is called (HITL request created) to the moment the approval notification is **delivered to the notification channel** (Novu delivery confirmation or Telegram/email send confirmation).
- **What is NOT measured**: Approver response time (human latency), notification transport delay (email delivery time from provider to inbox), client-side rendering.
- **Instrumentation**: OpenTelemetry span from `hitl.request.created` event to `notification.delivered` event. Span attributes: `hitl.request_id`, `notification.channel`, `notification.delivery_status`.

#### 10.4.2 Audit Integrity — Phase 1 Scope

> **Audit Integrity (Phase 1)**: The Phase 1 audit system guarantees **completeness** (every auditable action produces an audit entry), NOT **tamper-proofness** (cryptographic proof that entries have not been modified). Completeness is enforced by: deterministic audit IDs preventing missed entries on retry (§9.3), `REVOKE UPDATE, DELETE` on `audit_logs` table preventing application-level modification, and append-only insert pattern. Tamper-proofness (hash-chaining, external anchoring) is deferred to Phase 3+ when regulatory compliance demands it (§9.3 "Phase 3+: Cryptographic Hash-Chaining"). The `audit_integrity > 99.9%` SLO in BRD §5 measures completeness: ratio of expected audit events (derived from auditable actions) to actual audit entries.

#### 10.4.3 PostgreSQL SPOF — Error Budget Allowance

> **Accepted Risk — PostgreSQL Single Point of Failure**: PostgreSQL is a single shared instance in Phase 1 (§2.3.2). This is a known SPOF that can cause total platform outage. This risk is accepted within the error budget because: (1) BRD SLO targets >99% monthly uptime (~7.3h allowed downtime/month). Railway Managed PostgreSQL provides 99.95% uptime, which is within budget. (2) RPO <24h is met by automated daily backups. (3) RTO <8h is documented in RUNBOOK §8.5 (database recovery; updated from <4h per SA-1 re-evaluation). (4) Phase 2 mitigation: upgrade to HA-tier managed database ($30/mo → $60/mo) for automatic failover, reducing SPOF to a multi-region failure scenario. The error budget allows this tradeoff because Phase 1 is pre-production/early production with low user volume.

#### 10.4.4 Novu Single-Path Acceptance

> **Accepted Risk — Single Notification Provider**: Novu Cloud is the sole notification delivery path (§2.3.2 Notification Bus). No fallback SMTP, no backup Telegram bot. Acceptance rationale: (1) HITL TTL timeout path provides a safety net — workflows do not permanently stall if notifications fail. (2) Adding a fallback notification path adds ~1 week of development with marginal reliability improvement. (3) Novu Cloud availability has been adequate for similar-scale projects. Phase 2: If Novu reliability becomes an issue, add direct SMTP fallback for critical HITL notifications.

#### 10.4.5 Database Connection Pool Calculation

| Parameter | Value | Notes |
|---|---|---|
| Railway PostgreSQL max connections | 25 (starter plan) | Plan-determined limit |
| Reserved for superuser/maintenance | 3 | DO reserves for replication and monitoring |
| Available for application | 22 | 25 - 3 |
| API server pool size | 10 | Per container |
| Workflow worker pool size | 5 | Per container |
| API server containers (max) | 3 | Auto-scale limit |
| Workflow worker containers | 1 | Single worker Phase 1 |
| **Maximum application connections** | **3 × 10 + 1 × 5 = 35** | **Exceeds available (22)** |

> **CRITICAL**: Maximum scaled connections (35) exceed available connections (22). Mitigation: (1) API pool size should be set to `Math.floor(22 / (maxContainers + workers))` = `Math.floor(22/4)` = 5 per container. (2) Or use a connection pooler (PgBouncer on DO) to multiplex. (3) Phase 1 with 1 API + 1 worker = 15 connections, which is within budget. **Action**: Set pool size to 5 per container to stay safe at max scale.

#### 10.4.6 Redis Memory Budget

| Consumer | Key Pattern | Estimated Keys | Estimated Memory | TTL |
|---|---|---|---|---|
| MCP idempotency | `mcp:idempotency:*` | ~1,000 active | ~2 MiB | 24h |
| MCP cache | `mcp:cache:*` | ~500 active | ~10 MiB | 60s–24h |
| Webhook dedup | `webhooks:processed:*` | ~5,000 active | ~1 MiB | 7d |
| Session cache | `sess:*` | ~100 active | ~0.5 MiB | JWT lifetime |
| BullMQ jobs | `bull:*` | ~200 active | ~5 MiB | Job lifetime |
| Rate limit counters | `rl:*` | ~50 active | ~0.1 MiB | Window duration |
| **Total estimated** | | **~6,850** | **~19 MiB** | |

- **Available memory**: 1 GiB (db-s-1vcpu-1gb plan). Actual usable: ~800 MiB after Redis overhead.
- **Eviction policy**: `allkeys-lru` — when memory is full, evict least-recently-used keys across all consumers.
- **Alert threshold**: Alert at 70% memory usage (560 MiB). Investigate at 80%.
- **OOM prevention**: BullMQ job accumulation is the highest risk for OOM (unbounded job data). Mitigation: configure `maxStalledCount` and `removeOnComplete`/`removeOnFail` with age limit (7 days).

#### 10.4.7 Auto-Scaling Triggers

| Metric | Scale-Up Trigger | Scale-Down Trigger | Cooldown |
|---|---|---|---|
| CPU usage (per container) | >70% sustained for 5 min | <30% sustained for 15 min | 5 min between scale events |
| Memory usage (per container) | >80% sustained for 5 min | <40% sustained for 15 min | 5 min |
| HTTP request queue depth | >50 pending requests | <10 pending requests | 3 min |
| Response latency (P95) | >2s sustained for 5 min | <500ms sustained for 15 min | 5 min |

- **Scale range**: 1–3 API server containers (Railway service scaling).
- **Worker scaling**: Workflow worker does NOT auto-scale in Phase 1 (single instance). Phase 2: Add Inngest-based scaling signals.
- **Configuration**: Railway auto-scaling is configured via `railway.json` and Railway dashboard service settings.

#### 10.4.8 SLO-Alert Mapping

| SLO (BRD §5) | Target | Alert Rule | Severity | Runbook |
|---|---|---|---|---|
| Workflow success rate | >99% monthly | `workflow_success_rate < 0.99` over 1h window | SEV-2 | RUNBOOK §8.1 |
| HITL delivery latency | <10s P95 | `hitl_delivery_p95 > 10s` over 15min window | SEV-2 | RUNBOOK §8.2 |
| API availability | >99.5% monthly | `api_5xx_rate > 0.5%` over 5min window | SEV-1 | RUNBOOK §8.3 |
| MCP tool success rate | >99.5% (BRD: >99%) | `mcp_tool_error_rate > 0.5%` over 5min window | SEV-2 | RUNBOOK §8.4 |
| Audit integrity | >99.9% | `audit_missing_events > 0` daily check | SEV-1 | RUNBOOK §8.7 |
| LLM budget compliance | 100% enforcement | `llm_daily_spend > $45` (90% threshold) | SEV-3 | RUNBOOK §8.8 |

> **Implementation Note**: Alert rules are implemented via Grafana Cloud alerting (see Observability doc §4). Phase 1 uses threshold-based alerting. Phase 2: Add burn-rate alerting for multi-window SLO tracking.

---

## 11. Cross-Cutting Concerns

### 11.1 Error Handling Pattern

```typescript
// result type for all fallible operations — see @aptivo/types
import { Result } from '@aptivo/types';

// factory function pattern for application/orchestration layer (explicit dependencies)
// see: docs/05-guidelines/05a-Coding-Guidelines.md §4.2

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

#### 12.2.3 Outbound Webhook Event Payload Schema

All outbound webhook payloads follow a standard envelope. Consumers MUST use the envelope structure for integration; the `data` field varies by event type.

**Standard Envelope**:
```typescript
interface WebhookEventPayload<T = Record<string, unknown>> {
  id: string;              // unique event ID (for deduplication via X-Webhook-ID)
  event: string;           // event type (e.g., 'workflow.completed')
  timestamp: string;       // ISO 8601 event timestamp
  workflowId: string;      // originating workflow ID
  data: T;                 // event-specific payload (see below)
}
```

**Event Types and Payload Schemas**:

| Event Type | Trigger | `data` Fields |
|------------|---------|---------------|
| `workflow.completed` | Workflow reaches terminal state | `{ instanceId, status: 'completed' \| 'failed', result?, error?, duration }` |
| `workflow.failed` | Workflow exhausts retries | `{ instanceId, status: 'failed', error, failedStep, attemptCount }` |
| `hitl.requested` | HITL approval gate reached | `{ requestId, requestType, summary, expiresAt, approvalUrl }` |
| `hitl.approved` | HITL decision made (approved) | `{ requestId, decision: 'approved', decidedBy, decidedAt, comment? }` |
| `hitl.rejected` | HITL decision made (rejected) | `{ requestId, decision: 'rejected', decidedBy, decidedAt, comment? }` |
| `entity.created` | Domain entity created by workflow | `{ entityType, entityId, domain, createdBy }` |
| `entity.updated` | Domain entity updated by workflow | `{ entityType, entityId, domain, changes: string[], updatedBy }` |

**Schema Compatibility**: Outbound webhook event payloads follow the same backward-compatible evolution rules as internal events (see common-patterns.md §5.3). New optional fields may be added to `data` without version change. Breaking changes (field removal, type change) require a new event type name.

**Consumer Contract**: Consumers MUST ignore unknown fields in the `data` payload (forward compatibility). Consumers SHOULD validate against the documented schema but MUST NOT fail on additional fields.

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

### 12.4 Event Dead-Letter Queue (DLQ) Strategy

- **Scope**: Events that fail schema validation, exceed retry limits, or encounter permanent processing errors are routed to a dead-letter queue for inspection and manual replay.
- **DLQ routing**:

  | Event Source | Failure Type | DLQ Mechanism | Retention |
  |---|---|---|---|
  | Inngest events | Schema validation failure | Inngest `system.event.dlq` function | 30 days |
  | Inngest events | Step retry exhaustion | Inngest built-in failure handling | Per Inngest retention |
  | BullMQ jobs | Max attempts exceeded | BullMQ `failedReason` + move to failed set | 7 days |
  | Inbound webhooks | Signature verification failure | Logged and rejected (HTTP 401) | Application logs (30d) |
  | Inbound webhooks | Processing error after dedup | Retry up to 3x, then log as failed delivery | 7 days |

- **DLQ inspection**: Phase 1: Admin API endpoint to list and inspect DLQ entries. Phase 2: Grafana dashboard for DLQ monitoring.
- **Manual replay**: Admin can replay a DLQ event via API endpoint. Replay uses the original event ID for idempotency — already-processed events are safely deduplicated.
- **Alerting**: Alert when DLQ depth exceeds 10 events in 1 hour (indicates systematic failure).

### 12.5 Event Schema Rollout Policy (S3-W10)

> **Closes**: WARNING S3-W10 — event schema rollout policy

Inngest event schemas are defined using Zod v3 and registered at startup. Breaking schema changes require a phased rollout to prevent consumer failures.

#### 12.5.1 Change Classification

| Change Type | Breaking? | Procedure |
|-------------|-----------|-----------|
| Add optional field | No | Deploy directly; Zod `.optional()` is backward-compatible |
| Add required field | **Yes** | Phased rollout (see below) |
| Remove field | **Yes** | Phased rollout |
| Rename field | **Yes** | Treat as add-new + remove-old |
| Change field type | **Yes** | Phased rollout |

#### 12.5.2 Phased Rollout Procedure

For breaking changes, follow this 4-step deployment sequence:

**Step 1 — Add new field as optional** (backward-compatible):
```typescript
// v1: existing schema
const EventV1 = z.object({
  userId: z.string(),
  action: z.string(),
});

// v1.1: add new field as optional
const EventV1_1 = z.object({
  userId: z.string(),
  action: z.string(),
  actionType: z.string().optional(), // new field, optional for now
});
```

**Step 2 — Deploy producers**: Update event emitters to include the new field. Old consumers still work (field is optional).

**Step 3 — Deploy consumers**: Update event handlers to use the new field. Validate both old and new shapes:
```typescript
async ({ event }) => {
  // handle both shapes during rollout
  const actionType = event.data.actionType ?? event.data.action;
  // ...
}
```

**Step 4 — Make required and remove old**: Once all producers and consumers are updated:
```typescript
const EventV2 = z.object({
  userId: z.string(),
  actionType: z.string(), // now required
  // action field removed
});
```

#### 12.5.3 Versioning Convention

- **Additive changes**: No version suffix needed (backward-compatible)
- **Breaking changes**: Use `event/v2` naming convention:
  ```typescript
  // original
  { name: 'workflow/started', ... }
  // breaking change version
  { name: 'workflow/started.v2', ... }
  ```
- Both versions coexist during rollout; old version deprecated after migration

#### 12.5.4 Zod Coercion Strategy

When migrating optional → required, use `.default()` during the transition period:

```typescript
// transitional schema: accepts old events without the field
const TransitionalSchema = z.object({
  userId: z.string(),
  actionType: z.string().default('unknown'), // coerce missing to default
});
```

After all producers emit the field, remove `.default()` to make it strictly required.

#### 12.5.5 Testing Schema Changes

Before deploying schema changes:
1. Run existing tests against the new schema (must pass — backward compatibility)
2. Add tests for the new field/shape
3. Verify Inngest Dev Server accepts both old and new event shapes

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

### 13.6 Workflow POST Idempotency

- **Problem**: `POST /api/v1/workflows` creates a new workflow definition. Without idempotency, client retries on network timeout could create duplicate definitions.
- **Strategy**: Client-generated `Idempotency-Key` header (IETF draft standard).
- **Mechanism**:
  1. Client generates a UUID v4 and sends as `Idempotency-Key` header.
  2. Server checks Redis for existing key → if found, return cached response (201 or original error).
  3. If not found, process request, cache response in Redis with 24h TTL, return 201.
  4. If `Idempotency-Key` is absent, request is processed normally (no dedup).
- **Response caching**: Both success (201) and client error (4xx) responses are cached. Server errors (5xx) are NOT cached (allow retry).
- **Window**: 24 hours (Redis TTL on idempotency key).

### 13.7 Role Assignment Idempotency

- **Endpoint**: `PUT /api/v1/users/:userId/roles` (assign roles to user).
- **Semantics**: PUT with full replacement — the request body contains the complete list of roles. The server replaces existing roles with the provided set.
- **Idempotency**: Inherently idempotent via PUT semantics. Sending the same role set twice produces the same result. No `Idempotency-Key` needed.
- **Upsert behavior**: `DELETE FROM user_roles WHERE user_id = $1; INSERT INTO user_roles (user_id, role) VALUES ...` within a transaction.
- **Audit**: Each role change (add or remove) generates an audit event with the previous and new role sets.

### 13.8 API Deprecation and Sunset Policy

- **Current version**: `v1` (all endpoints under `/api/v1/`).
- **v1 support commitment**: v1 will be supported for a minimum of **12 months** after v2 general availability. During the overlap period, both v1 and v2 endpoints are operational.
- **Sunset signaling**: When v2 is released, v1 responses include `Sunset` header (RFC 8594) with the EOL date, and `Deprecation` header (RFC 9745) with the deprecation date.
- **Breaking change definition**: See §13.9.
- **Migration support**: v1 → v2 migration guide published at v2 GA. Automated migration tooling provided where feasible.
- **Timeline** (projected):

  | Phase | API Version | Status |
  |---|---|---|
  | Phase 1 | v1 | Active (current) |
  | Phase 2 | v1 | Active |
  | Phase 3 | v1 + v2 | v1 deprecated, v2 active |
  | Phase 3 + 12mo | v2 | v1 sunset |

### 13.9 Backward Compatibility Rules

**Non-breaking changes** (allowed in minor versions, no version bump):
- Adding new optional fields to response bodies
- Adding new optional query parameters
- Adding new endpoints
- Adding new enum values to response fields (consumers MUST handle unknown values)
- Adding new webhook event types
- Relaxing validation constraints (accepting wider input)

**Breaking changes** (require major version bump, v1 → v2):
- Removing or renaming existing response fields
- Changing field types (string → number, etc.)
- Removing or renaming endpoints
- Adding required fields to request bodies
- Changing error response structure
- Tightening validation constraints (rejecting previously-valid input)
- Changing pagination strategy (cursor format, default limits)
- Removing enum values from response fields

> **Consumer contract**: API consumers MUST ignore unknown fields in response bodies (forward compatibility). Consumers SHOULD NOT depend on field ordering. Consumers MUST handle new enum values gracefully (log and skip, not crash).

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
| **I** | PII leakage in application logs | Pino logger with comprehensive PII redaction (see §14.3.1) | Unstructured PII in free-text error messages |
| **I** | Cross-schema data access | Schema isolation per domain (§9.1), application-level tenant context | Shared PostgreSQL — cross-schema queries possible with connection credentials |
| **I** | Backup data exposure | Managed daily backups (Runbook §8.5), encrypted at rest (BRD §8.1) | Backup restoration to unauthorized environment |
| **D** | Database resource exhaustion | Connection pool limits, statement timeouts (§2.3.2) | Single shared instance — cross-domain contention |
| **E** | Privilege escalation via domain role | Domain roles scoped to specific domain (§8.3), admin-only role assignment | Cross-domain escalation if isolation misconfigured |

#### 14.3.1 PII Handling in Logs and Telemetry

**Application Log Redaction (Pino)**:
Pino logger redaction paths cover both credentials AND PII fields:
```typescript
const redactPaths = [
  // credentials (existing)
  'password', 'token', 'secret', 'authorization', 'cookie', 'apiKey',
  // PII fields (TSD §5.2 classification)
  '*.email', '*.name', '*.firstName', '*.lastName', '*.phone',
  '*.address', '*.ssn', '*.creditCard',
  // nested request context
  'req.headers.authorization', 'req.headers.cookie',
  'input.email', 'input.name', 'input.phone', 'input.address',
];
```

**Audit Log PII Handling**:
- `ip_address`: Stored with last octet zeroed for anonymization (e.g., `192.168.1.0/24`). Full IP retained only for the first 24 hours in a separate `ip_address_full` column for abuse detection, then automatically nulled by a scheduled job.
- `user_agent`: Truncated to browser family and major version (e.g., `Chrome/120`) — no full fingerprint stored.
- `metadata` (JSONB): PII fields within metadata are automatically masked before storage using the same redaction allowlist. FRD FR-CORE-AUD-001: "Sensitive PII in metadata is automatically masked or hashed based on configuration."

**Third-Party Export Filtering**:
- OTLP export pipeline (Grafana Cloud/Honeycomb): Application-level Pino redaction applies before log emission. No raw PII reaches the OTLP collector.
- Sentry: `sanitizeForLogging()` function strips PII fields (email, name, phone, address) from error context before `captureException()`. Sentry SDK `beforeSend` hook provides secondary redaction.
- Access logs (Railway LB): IP addresses in infrastructure access logs are outside application control. Phase 2: evaluate Railway log forwarding with IP anonymization.

> **Residual Risk**: Unstructured PII in free-text error messages cannot be caught by field-level redaction. Developers must follow Observability guideline §11.1 (PII should "Never" be logged). Phase 2: add regex-based PII scanning in the OTLP pipeline.

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

> **Resolved (P1.5-06)**: MCP servers spawned via `npx` previously inherited the full process environment. `sanitizeEnvForMcp()` (from `@aptivo/mcp-layer`) now strips all env vars except those on the DB-backed allowlist before spawning child processes. The AgentKit transport adapter accepts an `envAllowlist` parameter populated from the MCP registry at initialization time — see composition root `getMcpWrapper()` in `apps/web/src/lib/services.ts`. Per-server allowlists are configured in the `mcpServers.allowedEnv` column.

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

#### 14.5.1 LLM Safety Envelope

**Prompt-Injection Defenses (Phase 1)**:
- **System/user message separation**: All LLM requests use provider SDK message arrays with distinct `system` and `user` roles. User-supplied data is NEVER concatenated into system prompts.
- **Input boundary markers**: System prompts use delimiter tokens (`<<<USER_DATA>>>...<<<END_USER_DATA>>>`) to structurally separate trusted instructions from untrusted input.
- **MCP data isolation**: Data retrieved from MCP tools is placed in `user` role messages, not `system` role, preventing indirect prompt injection from overriding system instructions.
- **Compensating controls**: HITL approval gates verify human oversight of all LLM-influenced decisions (§4.1); MCP idempotency keys prevent duplicate tool calls (§5.1.1); Zod schema validation constrains tool argument structure (§5.3).
- **Phase 2**: Add regex-based injection pattern scanning, prompt injection detection classifier, and anomaly monitoring for unusual prompt patterns.

**Output Validation (Phase 1)**:
- **Structured output enforcement**: All LLM completion requests specify JSON response format via provider SDK `response_format` parameter. Responses are parsed and validated against Zod schemas before use in workflow logic.
- **Schema-invalid rejection**: Responses that fail Zod validation are treated as LLM errors, triggering provider fallback (§7.1) or workflow error path.
- **No direct user display**: LLM responses in Phase 1 flow into workflow context and HITL approval screens, not directly to end users. Human approvers verify LLM recommendations before action.
- **Phase 2**: Add content filtering for harmful/inappropriate content, hallucination detection against ground truth data, and output sanitization for any user-facing LLM responses.

**Fallback Strategy**: Provider fallback on 429/5xx errors (§7.1). Budget exceeded returns explicit `Result.err` that workflows handle gracefully.

**Token/Cost Limits**:
- Per-domain daily ($50) and monthly ($1,000) budget caps with enforcement (§7.2)
- Per-request: `max_tokens` parameter set per workflow step (default: 4096 output tokens)
- Per-user rate limits: Deferred to Phase 2 (Phase 1 workflows are system-initiated, not user-triggered in real-time)
- Provider-side rate limits: Handled via retry with exponential backoff and provider fallback

> **Residual Risk (Phase 1)**: Prompt injection defenses rely on structural separation (system/user messages, delimiter tokens) and compensating controls (HITL). No active injection detection or content-based filtering exists. Phase 2 adds detection classifiers and output guardrails.

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
| RR-1 | MCP §14.4 | Env secret exfiltration via compromised npm MCP server | Medium | Critical | **Resolved** — `sanitizeEnvForMcp()` enforced in AgentKit adapter (P1.5-06) | 1 |
| RR-2 | LLM §14.5 | Direct prompt injection via user-supplied data | Medium | High | Mitigated — structural separation + HITL (§14.5.1); no active detection | 2 (injection classifier) |
| RR-3 | LLM §14.5 | Indirect prompt injection via MCP-retrieved data | Low | High | Mitigated — MCP data in user role + schema validation (§14.5.1) | 2 (content filtering) |
| RR-4 | HITL §14.2 | HS256 symmetric key compromise | Low | Critical | Accepted — encrypted storage, rotation | 2 (asymmetric) |
| RR-5 | PII §14.3 | PII leakage in application logs | Low | Medium | Mitigated — comprehensive Pino redaction (§14.3.1); residual risk: unstructured free-text PII | 2 (regex PII scanning) |
| RR-6 | PII §14.3 | No bulk exfiltration detection | Low | High | Accepted — audit logging covers trail | 2 (anomaly detection) |
| RR-7 | Webhooks §14.7 | Outbound SSRF via user-supplied URL | Medium | Medium | **Partially resolved** — `safeFetch()` created with SSRF validation (P1.5-06); wire on first outbound webhook path | 1 |
| RR-8 | File §14.6 | Content-type spoofing | Low | Low | Accepted | 1 |
| RR-9 | Auth §14.1 | Supabase security vulnerability | Low | Critical | Accepted — exit strategy documented (§8.1) | — |

### 14.10 Implemented Security Middleware Stack

> **Added (P2-DOC-05, 2026-03-12)**: Documents the runtime security enforcement stack built across Sprints 5-7 and Phase 1.5.

The following middleware components are implemented in `apps/web/src/lib/security/`:

| Layer | File | Function | Enforcement |
|-------|------|----------|-------------|
| **RBAC** | `rbac-middleware.ts` | `checkPermission(permission)` | Returns `(Request) → Response \| null`. Production: Supabase JWT → user → DB permission lookup. Dev: `x-user-role` header → DB role lookup → stub fallback. Per-request caching via `WeakMap<Request, Set<string>>`. |
| **RBAC Resolver** | `rbac-resolver.ts` | `extractUser(request)`, `resolvePermissions(userId, db)` | JWT extraction (production) or header extraction (dev). JOINs `user_roles` + `role_permissions` WHERE `revokedAt IS NULL`. |
| **SSRF Validator** | `ssrf-validator.ts` | `validateWebhookUrl(url)` | Blocks private IPs (10.x, 172.16-31.x, 192.168.x), localhost, link-local (169.254.x), metadata endpoints (169.254.169.254). Returns `Result<URL, SecurityError>`. |
| **Safe Fetch** | `safe-fetch.ts` | `safeFetch(url, init?)` | Wraps `fetch()` with `validateWebhookUrl()` pre-check. Returns `Result<Response, SafeFetchError>`. Wire on first outbound webhook path (RR-7). |
| **Body Limits** | `body-limits.ts` | `withBodyLimits(handler)` | HOF wrapper. Webhook body: 256KB. API JSON: 1MB. JSON nesting: max 10 levels. Returns `413` or `400` on violation. |
| **Logging Sanitization** | `sanitize-logging.ts` | `sanitizeForLogging(obj)`, `hashQueryParam(param)` | Redacts PII fields (email, name, phone, address, SSN) before logging. Hashes URL query params in access logs. Used in Sentry `beforeSend` hook. |

**Request flow**: RBAC middleware runs first (route-level), body limits run at middleware level (for POST/PUT routes), SSRF validation runs before outbound HTTP calls, logging sanitization runs before all log output.

### 14.11 Admin Dashboard APIs

> **Added (Tier 1 re-evaluation, 2026-03-13)**: Addresses G-1 — Admin Dashboard APIs lacked STRIDE threat enumeration despite being a high-privilege surface with access to audit logs, HITL state, and financial metrics.

**Surface**: GET endpoints for system health, HITL requests, audit logs, LLM cost tracking (`/api/admin/*`).
**Source**: §15.1-15.6, API Spec `/api/admin/*`, §14.10

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Spoofed admin identity via stolen JWT | Supabase JWT signature verification; `checkPermission('platform/admin.view')` on every endpoint (§14.10) | XSS leading to token exfiltration |
| **T** | Audit log tampering via admin API | Admin endpoints are read-only (GET); audit table has `REVOKE UPDATE, DELETE` (§9.3) | Database superuser bypass |
| **R** | Admin access without audit trail | Admin API requests logged via structured Pino logging (§14.10); Supabase auth events tracked | Log retention policy gaps |
| **I** | Sensitive metric leakage (LLM costs, HITL details) | RBAC gates all endpoints; aggregation queries hide row-level PII; parameterized Drizzle queries (§15.6) | Authorized admin with broad visibility — no field-level redaction on cost data |
| **I** | IDOR on audit log filters | `resource` and `actor` filters use parameterized queries; no user-supplied IDs in path | Filter values could enumerate valid resource/actor names |
| **D** | Expensive aggregation query flooding | Pagination clamped to 200 (§15.6); range clamped to 365 days; PostgreSQL connection pool limits (§2.3.2) | No per-user rate limiting on admin endpoints — sustained queries could degrade shared pool |
| **E** | Non-admin accessing admin endpoints | `checkPermission('platform/admin.view')` enforced on all routes; RBAC resolver JOINs `user_roles` + `role_permissions` WHERE `revokedAt IS NULL` (§14.10) | Role assignment compromise in `user_roles` table |

> **Accepted Design**: All admin endpoints return global platform metrics with no domain-scoped isolation. This is intentional for a single-tenant Phase 1 deployment. Phase 2: add domain-scoped admin roles if multi-tenant deployment requires metric segregation.

### 14.12 Workflow Management APIs

> **Added (Tier 1 re-evaluation, 2026-03-13)**: Addresses G-2 — Workflow Management APIs lacked dedicated STRIDE threat model despite being a control surface for workflow definition CRUD and instance management.

**Surface**: Workflow definition CRUD (`/api/v1/workflows`), instance listing, execution history, validation, and export.
**Source**: §3.1-3.3, §14.8, API Spec `/api/v1/workflows*`, FRD §3

| STRIDE | Threat | Mitigation | Residual Risk |
|--------|--------|------------|---------------|
| **S** | Unauthorized workflow creation/modification | Supabase JWT authentication; domain-scoped RBAC permissions (`{domain}/workflow.create`, `{domain}/workflow.execute`) | Stolen JWT with workflow permissions |
| **T** | Mass assignment on workflow definition update | Zod schema validation on `WorkflowCreateRequest`/`WorkflowUpdateRequest`; only whitelisted fields accepted | Schema evolution could introduce unvalidated fields |
| **T** | State machine tampering via malformed transitions | `POST /api/v1/workflows/validate` performs structural validation; invalid state graphs rejected before persistence | Semantic correctness of transitions not validated (business logic) |
| **R** | Workflow modification without audit trail | All CRUD operations produce audit events (§9.2); Inngest step execution logged per event | Audit entry creation failure (mitigated by DLQ — §9.5) |
| **I** | Workflow export leaks sensitive configuration | Export endpoint (`/api/v1/workflows/{id}/export`) returns portable JSON; sensitive runtime config (API keys, secrets) excluded from export schema | Workflow step descriptions may contain business-sensitive logic |
| **I** | Instance history reveals execution details | Instance listing and history require authenticated access with domain permissions; history entries contain step-level detail | Authorized users see full execution trace including LLM interaction summaries |
| **D** | Workflow creation flooding | Rate limit: 20 req/min per user on `POST /api/v1/workflows`; 100 req/min on `GET` (API Spec) | No global rate limit across users — coordinated attack possible |
| **D** | ReDoS via workflow state definition validation | Zod validation with bounded input; no user-supplied regex in state definitions | Complex state graphs with deep nesting could increase validation CPU time |
| **E** | Cross-domain workflow access | Domain-scoped RBAC: `crypto/workflow.execute` does not grant `hr/workflow.execute`; Drizzle queries filter by domain | RBAC misconfiguration granting cross-domain permissions |
| **E** | Delete active workflow to disrupt operations | `DELETE /api/v1/workflows/{id}` blocked when active instances exist (API Spec) | Race condition: instance starts between check and delete |

> **Implementation Note**: Workflow definitions are versioned (§3.1). Updates create new versions rather than mutating existing definitions, preserving auditability. The `DELETE` guard against active instances prevents disruption of running workflows.

---

## 15. Admin & Operations Dashboard Architecture

> **Added (P2-DOC-03, 2026-03-12)**: Documents the admin infrastructure built in Sprint 7 (S7-INT-02, S7-INT-03). Closes WARNING S2-W12 (LLM Usage Dashboard).

### 15.1 Overview

The admin dashboard provides platform operators with visibility into system health, HITL request status, audit trails, and LLM cost tracking. All endpoints enforce RBAC via `checkPermission('platform/admin.view')` middleware (§14.10) and return RFC 7807 error responses on failure.

**Store adapters**:
- `createDrizzleAdminStore(db)` — aggregation queries for overview, audit logs, HITL requests
- `createDrizzleLlmUsageStore(db)` — LLM cost breakdowns by domain, provider, and time period

### 15.2 API Endpoints

| Endpoint | Method | Description | Query Params |
|----------|--------|-------------|-------------|
| `/api/admin/overview` | GET | Platform health dashboard | — |
| `/api/admin/audit` | GET | Paginated audit log viewer | `page`, `limit` (max 200), `resource`, `actor` |
| `/api/admin/hitl` | GET | HITL request listing | `status`, `limit` (max 200) |
| `/api/admin/llm-usage` | GET | LLM cost & usage analytics | `range` (e.g., `7d`, `30d`; clamped 1-365) |
| `/api/admin/llm-usage/budget` | GET | Budget status & burn rate | — |

### 15.3 Overview Endpoint

Returns four key metrics in parallel:

```typescript
{
  pendingHitlCount: number;          // hitl_requests WHERE status = 'pending'
  activeWorkflowCount: number;       // workflows active within 5-minute window
  recentAuditEvents: AuditLogRow[];  // latest 50 audit log entries
  sloHealth: {
    workflowSuccessRate: number;     // success / total (1.0 if no workflows)
    mcpSuccessRate: number;          // success / total (1.0 if no calls)
    hitlLatencyP95Ms: number;        // P95 approval delivery latency
    auditDlqPending: number;         // dead letter queue backlog
    status: 'healthy' | 'degraded';  // healthy when: workflow >= 99%, mcp >= 99.5%, dlq <= 100
  };
}
```

SLO health is computed from `MetricService` queries (§16) — the same data that powers the SLO cron evaluators.

### 15.4 LLM Usage & Budget

**Usage endpoint** (`/api/admin/llm-usage`):
- Range-based: `?range=7d` queries last 7 days (default 30d, clamped to [1, 365])
- Returns: `costByDomain[]`, `costByProvider[]`, `dailyTotals[]`, `totalCost`, alerts
- Total cost computed client-side from domain breakdown sum

**Budget endpoint** (`/api/admin/llm-usage/budget`):
- Daily limit: $50 (configurable)
- Monthly limit: $1,000 (configurable)
- Burn rate: `monthlySpend / dayOfMonth` — projected daily average
- Alert threshold: $5/day per domain — domains exceeding threshold returned in `alerts.domainsExceeding[]`

### 15.5 RBAC Enforcement

All admin endpoints use the same pattern:

```typescript
const forbidden = await checkPermission('platform/admin.view')(request);
if (forbidden) return forbidden;
```

The `checkPermission()` factory (§14.10) returns a `(Request) => Promise<Response | null>` function. In production, it extracts the Supabase JWT, resolves user permissions from the DB, and caches them per-request via `WeakMap<Request, Set<string>>`. Returns `null` (permitted) or RFC 7807 `401`/`403` response.

### 15.6 Input Validation

- **Pagination**: `limit` clamped to `[1, 200]`, `page` floor at 1
- **Range**: parsed from string (e.g., `"7d"`), clamped to `[1, 365]` days; zero or NaN defaults to 30
- **Filters**: `resource`, `actor`, `status` are optional string filters passed directly to `WHERE` clauses via parameterized Drizzle queries (no SQL injection risk)

---

## 16. Observability & SLO Architecture

> **Added (P2-DOC-04, 2026-03-12)**: Consolidates scattered observability references into a canonical section. Covers the MetricService, SLO cron, and alert evaluators built in Sprint 7 (S7-CF-01).

### 16.1 MetricService Interface

The `MetricService` provides a shared abstraction over Drizzle aggregation queries, used by both the SLO cron job and admin dashboard APIs.

**Factory**: `createMetricService(deps)` in `apps/web/src/lib/observability/metric-service.ts`
**Query adapter**: `createMetricQueries(db)` in `packages/database/src/adapters/metric-queries.ts`

```typescript
interface MetricService {
  getWorkflowCounts(): Promise<{ total: number; success: number }>;
  getMcpCallCounts(): Promise<{ total: number; success: number }>;
  getHitlLatencyP95(): Promise<number>;
  getAuditDlqPendingCount(): Promise<number>;
  getRetentionFailureCount(): Promise<number>;
  getNotificationDeliveryRate(): Promise<number>;
}
```

All methods query PostgreSQL aggregation views over the respective tables (workflow_executions, mcp_tool_calls, hitl_requests, audit_write_dlq, notification_deliveries).

### 16.2 SLO Cron Job

**Implementation**: `apps/web/src/lib/observability/slo-cron.ts` — Inngest function running on 5-minute interval.

Each evaluation cycle:
1. Fetches current metric values from `MetricService`
2. Evaluates each metric against its SLO threshold
3. Fires alert events for threshold violations
4. Logs evaluation results for Grafana ingestion

### 16.3 Alert Evaluators

Four threshold-based alerts defined in `apps/web/src/lib/observability/slo-alerts.ts`:

| Evaluator | SLO Target | Alert Condition | Source Metric |
|-----------|-----------|-----------------|---------------|
| `workflowSuccessAlert` | ≥ 99% success rate | < 99% over 5-min window | `getWorkflowCounts()` |
| `hitlDeliveryAlert` | P95 < 10s | P95 > 10,000ms | `getHitlLatencyP95()` |
| `mcpSuccessAlert` | ≥ 99.5% success rate | < 99.5% | `getMcpCallCounts()` |
| `auditIntegrityAlert` | DLQ count ≤ threshold | count > 100 | `getAuditDlqPendingCount()` |

**Deferred**: S5-W17 burn-rate alerting — multi-window burn-rate analysis requires historical metric storage not yet implemented. See [Phase 2 Roadmap](../06-sprints/phase-2-roadmap.md) Epic 4.

### 16.4 Metric-to-Dashboard Integration

The admin overview endpoint (§15.3) reuses the same `MetricService` queries as the SLO cron, ensuring dashboard and alerting agree on metric values. The `sloHealth.status` field is derived from the same thresholds used by the alert evaluators.

```
MetricQueries (Drizzle) ──→ MetricService
                              ├──→ SLO Cron (Inngest, 5-min)
                              │     └──→ Alert Evaluators → alert events
                              └──→ Admin Overview API
                                    └──→ sloHealth response
```

### 16.5 Observability Cross-References

- **Structured logging**: Pino with PII redaction — see Coding Guidelines §3.2 and `docs/05-guidelines/05d-Observability.md`
- **Distributed tracing**: W3C traceparent propagation — see `apps/web/src/lib/tracing/context-propagation.ts`
- **Error tracking**: Sentry integration with `sanitizeForLogging()` before `captureException()`
- **SLO-Alert mapping table**: ADD §10.4.8

---

## 17. References

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
