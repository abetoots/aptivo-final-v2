# Phase 2 Architecture Delta

## Overview

Phase 2 (Sprints 9-14, 172 SP) transformed the platform from a single-user, single-approver prototype into an enterprise-ready, multi-approver workflow automation platform.

## Major Architectural Changes

### 1. Identity & Auth (Sprint 9)

- From: Supabase magic links only
- To: OIDC SSO + MFA enforcement + WebAuthn + token blacklist + session limits

Key additions:
- `oidc-provider.ts` — ClaimMapper, OidcProviderConfig schema, loadProvidersFromEnv
- `jit-provisioning.ts` — JitProvisioner with account linking
- `mfa-enforcement.ts` — createMfaEnforcement + SENSITIVE_OPERATIONS
- `token-blacklist.ts` — Redis SET with TTL + checkBlacklist middleware (fail-open)
- `session-limit-service.ts` — Redis-backed, admin:1 / user:3 default
- `webauthn-service.ts` — registration, authentication, counter replay protection
- 12 new API endpoints across SSO, MFA, WebAuthn, and session management

### 2. Infrastructure (Sprint 10)

- From: Single DB, single Redis, env-var secrets
- To: HA database + per-domain pools + split Redis + secrets provider + drift detection CI

Key additions:
- HA database with read replicas and automatic failover
- Per-domain connection pools (default, analytics, audit)
- Split Redis instances (cache vs pub/sub vs rate-limit)
- Secrets provider abstraction (env, vault, DO secrets)
- Drift detection CI pipeline for infrastructure state

### 3. HITL Gateway (Sprint 11)

- From: Single-approver approve/reject
- To: Multi-approver quorum/sequential + request changes + parent/child orchestration

Key additions:
- Approval policy engine with quorum and sequential strategies
- Multi-request service for batch approval workflows
- Multi-decision service with token-based voting
- Parent/child request orchestration
- Request changes flow (not just approve/reject)

### 4. LLM Gateway (Sprint 12)

- From: Simple provider abstraction
- To: Injection detection + content filtering + durable rate limits + multi-provider routing

Key additions:
- Prompt injection classifier with scoring pipeline
- Content filter with configurable category thresholds
- Durable rate limits persisted to Redis (survives restarts)
- Multi-provider routing with cost-aware fallback

### 5. Observability (Sprint 12)

- From: Threshold alerts
- To: Burn-rate multi-window alerting + audit query/export + retention policies + PII read audit

Key additions:
- Multi-window burn-rate alerting (1h/6h windows) for workflow and MCP SLOs
- Audit query API with filtering, pagination, and export
- Configurable retention policies with automated enforcement
- PII read audit middleware for compliance (closes S2-W5)
- Anomaly detection for metric streams (Sprint 13)

### 6. Notifications (Sprint 13)

- From: Novu adapter only
- To: SMTP failback + priority routing + quiet hours + delivery monitoring

Key additions:
- SMTP failback transport when Novu is unavailable
- Delivery monitoring with success/failure tracking
- Priority-based routing (critical bypasses quiet hours)
- Approver webhook notifications for external integrations

### 7. Platform Features (Sprint 13-14)

- From: Hard-coded workflows
- To: Workflow CRUD API + visual builder + webhook action points + feature flags + consent API

Key additions:
- Workflow CRUD API (create, read, update, delete, list)
- Visual workflow builder foundation (graph model, validation, serialization)
- Webhook action point registration and dispatch
- Runtime feature flags with gradual rollout support
- Consent management API for data processing agreements
- Approval SLA metrics and dashboard

### 8. MCP (Sprint 14)

- From: Static registry
- To: Dynamic discovery + per-tool circuit breaker override

Key additions:
- Dynamic MCP server discovery API
- Per-tool circuit breaker override configuration
- Deferred modules buy/build analysis for Phase 3

## Metrics

| Metric | Phase 1 End | Phase 2 End |
|--------|-------------|-------------|
| Tests | ~483 | 1,500+ |
| Packages | 10 | 10 (enhanced) |
| API Endpoints | ~20 | ~50+ |
| FRD Requirements Addressed | ~20 | 37 |
| Warnings Resolved | All Phase 1 | + S2-W5, S5-W17, S3-W10 |
| Tier 2 Findings Resolved | — | EP-1, EP-2, AB-1, SM-1, AS-1 |

## Bucket D Resolution

All 3 originally-deferred Bucket D warnings were resolved during Phase 2:

| WARNING | Finding | Resolution |
|---------|---------|------------|
| S2-W5 | PII read audit trail | Implemented in Sprint 12 (OBS-04) |
| S3-W10 | Event schema rollout order | Documented in ADD section 12.5 |
| S5-W17 | Burn-rate alerting | Implemented in Sprint 12 (OBS-01) |

2 accepted risks remain unchanged:
- T1-W22: PostgreSQL shared DB SPOF (accepted risk, ADD section 2.3.2)
- S3-W9: MCP Redis recovery edge case (accepted, human review required)

## Cross-Cutting Concerns

### Security Posture

Phase 2 elevated the security model from basic auth to enterprise-grade:
- Zero Trust enforcement via `checkPermissionWithBlacklist` middleware
- Federated identity with OIDC claim mapping
- Hardware-bound authentication via WebAuthn
- Token lifecycle management with blacklist and session limits

### Resilience

Phase 2 improved resilience across all layers:
- HA database eliminates PostgreSQL SPOF for production deployments
- Split Redis prevents cross-domain cache poisoning
- Multi-provider LLM routing ensures availability during provider outages
- SMTP failback ensures notification delivery during Novu outages
- Durable rate limits survive process restarts

### Observability

Phase 2 closed the observability gaps identified in Phase 1 reviews:
- Burn-rate alerting replaces simple threshold alerts
- PII read audit provides compliance evidence
- Audit query/export enables forensic investigation
- Anomaly detection surfaces emerging issues before SLO breach
