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

### Epic 3: LLM Safety & Optimization — DELIVERED (Sprint 12)

- ✅ Prompt injection detection classifier (LLM2-01) — 16 patterns, 4 categories, Unicode normalization (RR-2)
- ✅ Content filtering pipeline (LLM2-02) — pre-request + post-response, 3 domain tiers (RR-3)
- ✅ Per-user durable rate limits (LLM2-03) — Redis-backed token bucket with tier support
- ✅ Multi-provider routing (LLM2-04) — cost/latency/failover strategies (FR-CORE-LLM-003)

Source: [sprint-12-plan.md](./sprint-12-plan.md), [llm-gateway.md](../04-specs/platform-core/llm-gateway.md) §12

### Epic 4: Observability Maturity — DELIVERED (Sprint 12)

- ✅ Burn-rate SLO alerting (OBS-01) — multi-window (5m + 1h), error budget model — S5-W17 resolved
- ✅ Audit query & export (OBS-02) — CSV/JSON with SHA-256 checksum — FR-CORE-AUD-002
- ✅ Retention policies (OBS-03) — domain overrides (HR 7yr, crypto 5yr) — FR-CORE-AUD-003
- ✅ PII read audit trail (OBS-04) — pii.read/bulk/export actions, withPiiReadAudit HOF — S2-W5 resolved
- Event schema rollout policy (S3-W10) — documented in ADD §12.5 (Sprint 9)
- Anomaly detection for bulk data access (RR-6) — deferred to Sprint 13

Source: [sprint-12-plan.md](./sprint-12-plan.md), [WARNINGS_REGISTER.md](../WARNINGS_REGISTER.md)

### Epic 5: Notification Expansion — DELIVERED (Sprint 13)

- ✅ SMTP fallback for HITL notifications (NOTIF2-01) — Novu primary → SMTP secondary failover
- ✅ Novu delivery rate monitoring (NOTIF2-02) — silent-drop detection with health alerts
- ✅ Priority routing + quiet hours (NOTIF2-03) — 4-tier priority, FR-CORE-NOTIF-003
- ✅ Per-approver webhook notifications (NOTIF2-04) — HMAC-signed per-approver dispatch
- Push notifications / FCM — Phase 3+
- SMS channel — Phase 3+

Source: [sprint-13-plan.md](./sprint-13-plan.md)

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

### Epic 7: Platform Features — DELIVERED (Sprint 13-14)

- ✅ Workflow definition CRUD API (FEAT-01, Sprint 13) — versioned, FR-CORE-INT-001
- ✅ Extensible webhook action points (FEAT-02, Sprint 13) — HMAC-signed, FR-CORE-INT-002
- ✅ Runtime feature flag service (FEAT-03, Sprint 13) — local JSON provider, LaunchDarkly-ready interface
- ✅ Self-service consent withdrawal API (FEAT-04, Sprint 13) — DPA Art 7, audit trail
- ✅ Visual workflow rule builder (FEAT-07, Sprint 14) — step editor, add/remove/reorder, activate lifecycle
- ✅ Dynamic MCP server discovery API (FEAT-08, Sprint 14) — health status from CircuitBreakerRegistry
- ✅ Per-tool MCP circuit breaker override (FEAT-09, Sprint 14) — configurable thresholds per tool

Source: [sprint-13-plan.md](./sprint-13-plan.md), [sprint-14-plan.md](./sprint-14-plan.md)

### Epic 8: Deferred Modules Analysis — DELIVERED (Sprint 14)

Buy/build decision matrix completed. 16 modules evaluated, Phase 3 implementation sequence defined.

- ✅ Financial & Admin (FA1-FA4) — 3 buy (Stripe, Deel, Expensify) + 1 build (budgeting)
- ✅ Case Tracking (CT1-CT5) — 4 build (leverages workflow engine) + 1 defer (portal)
- ✅ Project Management (PM1-PM3) — 2 buy (Asana, Toggl) + 1 defer (resource planning)
- ✅ CRM (CRM1-CRM4) — 4 buy (HubSpot)

Source: [phase-2-modules-analysis.md](./phase-2-modules-analysis.md)

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
