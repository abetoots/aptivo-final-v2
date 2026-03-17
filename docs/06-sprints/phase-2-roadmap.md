---
id: PHASE-2-ROADMAP
title: Phase 2 Roadmap & Deferred Items
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-03-12'
---
# Phase 2 Roadmap & Deferred Items

## 1. Overview

Phase 1 delivered 232 SP across 8 sprints (+ 24 SP Phase 1.5 wiring). This document consolidates all items explicitly deferred to Phase 2+ into a single source of truth for sprint planning.

**Phase 1 final state**: 1,460 tests, 10 packages, 0 open warnings
**Phase 1.5 state**: All stubs wired to real adapters, RR-1 resolved, RR-7 partially resolved

---

## 2. Epic Groupings

### Epic 1: Identity & Access Hardening — DELIVERED (Sprint 9)

- ✅ SSO via OIDC/SAML (FR-CORE-ID-001) — OIDC provider + SAML contract
- ✅ Mandatory MFA for admin roles — `requireMfa` middleware + TOTP enrollment
- ✅ WebAuthn/Passkeys — registration, authentication, counter replay protection
- ✅ Concurrent session limits per role — admin:1, user:3 (configurable)
- ✅ Token blacklist for immediate revocation — Redis-backed with TTL

Source: [sprint-9-plan.md](./sprint-9-plan.md), [authentication.md](../04-specs/authentication.md) §6.4

### Epic 2: HITL Gateway v2 — Multi-Approver — DELIVERED (Sprint 11)

- ✅ Quorum-based approval (M-of-N configurable) (FR-CORE-HITL-004)
- ✅ Sequential approval chains with timeout escalation
- ✅ Request changes decision type with bounded retries (FR-CORE-HITL-003)
- ✅ Parent/child workflow orchestration (FR-CORE-WFE-007)
- ✅ HR contract → sequential dual-approver, Crypto trade → 2-of-3 quorum

Source: [sprint-11-plan.md](./sprint-11-plan.md), [hitl-gateway.md](../04-specs/platform-core/hitl-gateway.md) §12-19

### Epic 3: LLM Safety & Optimization

- Prompt injection detection classifier ([ADD](../03-architecture/platform-core-add.md) §14.5.1, RR-2)
- Content filtering for harmful output ([ADD](../03-architecture/platform-core-add.md) §14.5.1, RR-3)
- Per-user rate limits ([llm-gateway.md](../04-specs/platform-core/llm-gateway.md) §1.2)
- Multi-provider routing (cost vs latency optimization)
- Automatic fallback on provider failure (FR-CORE-LLM-003)

Source: [llm-gateway.md](../04-specs/platform-core/llm-gateway.md) §10, [platform-core-add.md](../03-architecture/platform-core-add.md) §14.5

### Epic 4: Observability Maturity

- Burn-rate alerting for SLOs (S5-W17)
- Event schema rollout policy (S3-W10)
- PII read audit trail (S2-W5, DPA compliance)
- Regex-based PII scanning in OTLP pipeline ([ADD](../03-architecture/platform-core-add.md) §14.3)
- Anomaly detection for bulk data access ([ADD](../03-architecture/platform-core-add.md) §14.3, RR-6)
- Grafana DLQ monitoring dashboard

Source: [WARNINGS_REGISTER.md](../WARNINGS_REGISTER.md) (Bucket D), [platform-core-add.md](../03-architecture/platform-core-add.md) §11, §14.3

### Epic 5: Notification Expansion

- Direct SMTP fallback for HITL notifications ([ADD](../03-architecture/platform-core-add.md) §6.4)
- Novu delivery rate monitoring — detect silent notification drops (C-3: Crypto BRD requires real-time alerting; Novu free-tier silently drops notifications beyond quota)
- Push notifications / FCM ([ADD](../03-architecture/platform-core-add.md) §6)
- SMS channel ([ADD](../03-architecture/platform-core-add.md) §6)
- Self-hosted Novu option (cost optimization trigger)

Source: [platform-core-add.md](../03-architecture/platform-core-add.md) §6, Tier 1 re-evaluation C-3

### Epic 6: Infrastructure Hardening — DELIVERED (Sprint 10)

- ✅ HA database connection handling + failover script
- ✅ Per-domain connection pool isolation (crypto, HR, platform)
- ✅ Separate Redis instances (session vs jobs) with backward compat
- ✅ Secrets provider abstraction with dual-key rotation
- ✅ Worker auto-scaling config (.do/app.yaml, 5-min cooldown)
- ✅ Drift detection CI pipeline (weekly GitHub Actions)
- ✅ Circuit-breaker lifecycle tests (EP-1 closure)
- Multi-region DR — Phase 3+

Source: [sprint-10-plan.md](./sprint-10-plan.md), [platform-core-add.md](../03-architecture/platform-core-add.md) §2.3.2, §8.8

### Epic 7: Platform Features

- Visual workflow rule builder (FR-CORE-WFE-001)
- Dynamic MCP server discovery API (FR-CORE-MCP-001, [ADD](../03-architecture/platform-core-add.md) §5.2)
- Per-tool MCP circuit breaker override ([ADD](../03-architecture/platform-core-add.md) §5.2)
- Runtime feature flag service — LaunchDarkly/Unleash ([configuration.md](../04-specs/configuration.md) §5.3)
- Self-service consent withdrawal UI ([ADD](../03-architecture/platform-core-add.md) §9.4.2, DPA Art 7)

Source: [platform-core-frd.md](../02-requirements/platform-core-frd.md), [platform-core-add.md](../03-architecture/platform-core-add.md) §5, [configuration.md](../04-specs/configuration.md)

### Epic 8: Deferred Modules (Buy vs Build)

- Financial & Admin (FA1-FA4): invoicing, payroll, expenses, budgeting
- Ticketing & Support (CT1-CT5): CRUD, SLA tracking
- Project Management (PM1-PM3): tasks, time tracking
- CRM (CRM1-CRM4): contacts, pipeline, interactions

Source: [deferred-contracts.md](../04-specs/deferred-contracts.md) §2-5 (interface contracts defined)

---

## 3. Priority Matrix

| Priority | Epic | Rationale |
|----------|------|-----------|
| Critical | Epic 1 (Identity) | Enterprise deployment blocker; SSO required for B2B |
| Critical | Epic 6 (HA Database) | SLO compliance requires failover |
| High | Epic 2 (Multi-Approver HITL) | Compliance requirement for trade/contract approval chains |
| High | Epic 3 (LLM Safety) | Production LLM use requires injection defense |
| High | Epic 4 (Observability) | Burn-rate alerting required for SLO enforcement |
| Medium | Epic 5 (Notifications) | SMTP fallback high priority; push/SMS can wait |
| Medium | Epic 7 (Platform Features) | Visual builder is user experience improvement |
| Low | Epic 8 (Deferred Modules) | Buy vs Build analysis gates; no implementation committed |

---

## 4. Dependency Graph

```
Epic 1 (Identity) ──── Epic 2 (Multi-Approver HITL) [HITL needs RBAC v2]
                  └─── Epic 3 (LLM Safety) [admin MFA before LLM production use]

Epic 6 (HA Database) ── Epic 4 (Observability) [burn-rate needs reliable metrics infra]

Epic 5 (Notifications) ── independent
Epic 7 (Platform Features) ── independent (visual builder needs stable workflow engine)
Epic 8 (Deferred Modules) ── depends on Epic 7 (runtime feature flags for gradual rollout)
```

---

## 5. Warning Closure Plan

Three Phase 1 warnings remain deferred:

| Warning | Finding | Epic | Target |
|---------|---------|------|--------|
| S2-W5 | PII read audit trail | Epic 4 (Observability) | Sprint 2-3 |
| S3-W10 | Event schema rollout order | Epic 4 (Observability) | Sprint 1 (policy doc) |
| S5-W17 | Burn-rate alerting | Epic 4 (Observability) | Sprint 2-3 |

Two accepted risks may graduate:

| Risk | Finding | Epic | Trigger |
|------|---------|------|---------|
| T1-W22 | PostgreSQL shared DB SPOF | Epic 6 (Infrastructure) | SLO enforcement |
| S3-W9 | MCP Redis recovery edge case | Epic 6 (Infrastructure) | Financial domain go-live |

---

## 6. Doc-Gate Checklist

Required documentation before each epic enters sprint planning:

| Epic | Required Docs |
|------|---------------|
| Epic 1 | [authentication.md](../04-specs/authentication.md) update (WebAuthn §6.2 expansion), RBAC v2 design in [ADD](../03-architecture/platform-core-add.md) §8 |
| Epic 2 | [hitl-gateway.md](../04-specs/platform-core/hitl-gateway.md) §12-14 expansion (multi-approver patterns) |
| Epic 3 | [llm-gateway.md](../04-specs/platform-core/llm-gateway.md) §10 expansion (classifier architecture, filtering pipeline) |
| Epic 4 | [observability.md](../04-specs/observability.md) TSD (already created DOC-06), [ADD](../03-architecture/platform-core-add.md) §16 |
| Epic 5 | [notification-bus.md](../04-specs/notification-bus.md) update (SMTP fallback architecture) |
| Epic 6 | [ADD](../03-architecture/platform-core-add.md) §2.3.2 expansion (HA topology, connection pool design) |
| Epic 7 | New TSD for visual workflow builder; [configuration.md](../04-specs/configuration.md) §5.3 expansion |
| Epic 8 | Expand [deferred-contracts.md](../04-specs/deferred-contracts.md) with buy/build analysis results |

---

## 7. Explicit Non-Goals (Phase 2)

- **Phase 3+ only**: Cryptographic hash-chaining for audit tamper-proofness (T3-E3)
- **Phase 3+ only**: Multi-region DR with geographic failover ([ADD](../03-architecture/platform-core-add.md) §2.3.2)
- **Phase 3+ only**: Separate database instances per domain ([ADD](../03-architecture/platform-core-add.md) §2.3.2)
- **Not planned**: LinkedIn MCP integration (no API access confirmed)
- **Not planned**: Custom ATS timeline (deferred indefinitely per strategy review)
- **Not planned**: NATS evaluation (Inngest sufficient for Phase 2 scale)
