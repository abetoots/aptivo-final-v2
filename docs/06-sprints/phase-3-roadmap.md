# Phase 3 Roadmap: Production Delivery & Domain Expansion

**Timeline**: 10 weeks (5 sprints x 2 weeks, Sprints 15-19)
**Team**: 3 developers (1 Senior, 2 Web Devs)
**Goal**: Production deployment, domain module delivery, advanced AI safety, buy integrations
**Derived from**: [Phase 2 Delivery Review](./phase-2-delivery-review.md), [Modules Analysis](./phase-2-modules-analysis.md), Sprint 12-14 deferred items
**Phase 2 baseline**: 172 SP delivered, 1,580 tests, all 8 Phase 2 epics complete, 0 open warnings
**Multi-Model Review**: [PHASE_3_ROADMAP_MULTI_REVIEW.md](./PHASE_3_ROADMAP_MULTI_REVIEW.md)

---

## 1. Consolidated Deferred Backlog

All items deferred from Phase 2 sprints, consolidated into Phase 3 scope:

| Item | SP | Source | Epic |
|------|-----|--------|------|
| Production deployment (real HA, MFA, Redis) | 8 | S10/S12/S14 deployment gates | 1 |
| Production E2E with real infrastructure | 3 | S14 delivery review | 1 |
| ML injection classifier | 5 | S12 deferred | 2 |
| LLM streaming content filter | 3 | S12/S13 deferred | 2 |
| Active anomaly blocking | 2 | S14 preview | 2 |
| Full visual workflow builder (drag-drop) | 8 | S14 FEAT-07 foundation → full | 3 |
| WebSocket implementation | 5 | S14 websocket-lifecycle.md spec | 3 |
| Case tracking CT-1 (Ticket CRUD) | 5 | MOD-01 build | 4 |
| Case tracking CT-2 (SLA Tracking) | 3 | MOD-01 build | 4 |
| Case tracking CT-3 (Escalation) | 3 | MOD-01 build | 4 |
| Case tracking CT-4 (Reporting) | 3 | MOD-01 build | 4 |
| Crypto live-trading workflow | 5 | S12/S13 deferred | 5 |
| HR onboarding workflow | 4 | S12/S13 deferred | 5 |
| MOD-02 interface contract validation | 3 | S14 deferred | 5 |
| Stripe Billing integration (FA-1) | 3 | MOD-01 buy | 6 |
| HubSpot CRM integration (CRM-1..4) | 5 | MOD-01 buy | 6 |
| Asana PM integration (PM-1) | 2 | MOD-01 buy | 6 |
| Toggl time tracking (PM-2) | 1 | MOD-01 buy | 6 |
| Consent withdrawal UI | 3 | S14 preview | 7 |
| Push notifications / FCM | 3 | Phase 2 Epic 5 deferred | 7 |
| SMS channel | 2 | Phase 2 Epic 5 deferred | 7 |
| FA-4 Budgeting (build) | 5 | MOD-01 build | 8 |

**Total**: ~127 SP

---

## 2. Epic Groupings

### Epic 1: Production Readiness (22 SP)

**Sprint 15 — must be first.** Gates all subsequent production features.

- Configure Supabase Pro for OIDC SSO + MFA
- Provision HA database cluster + execute real failover test
- Configure split Redis instances (session vs jobs)
- Set SMTP credentials for notification failback
- Deploy feature flags for gradual rollout
- Production E2E validation against staging
- Game-day runbook exercises (DR, failover, rollback)
- Real pool config enforcement at pg driver level

Source: S10/S12/S14 deployment gates, S14 delivery review release gates

### Epic 2: LLM Safety v2 (10 SP)

- ML injection classifier (replace rule-based with fine-tuned small model)
- LLM streaming content filter (async chunk-based pipeline)
- Active anomaly blocking (auto-throttle on detected PII bulk access)
- Eval harness for classifier accuracy (precision/recall benchmarks)

Source: S12 deferrals, S14 Phase 3 recommendations

### Epic 3: Workflow Experience Expansion (13 SP)

- Full visual workflow builder (drag-and-drop canvas, node graph editor)
- Graph validation (cycle detection, unreachable step detection)
- WebSocket real-time collaboration/status updates (from S14 spec)

Source: FEAT-07 foundation → full implementation, websocket-lifecycle.md

### Epic 4: Case Tracking Build (14 SP)

- CT-1: Ticket CRUD (5 SP) — leverages workflow definition API
- CT-2: SLA tracking (3 SP) — leverages burn-rate alerting infra
- CT-3: Escalation (3 SP) — leverages HITL sequential chains
- CT-4: Reporting (3 SP) — leverages metric service

Source: MOD-01 build recommendations. **Highest-value build track** — reuses existing platform infrastructure.

### Epic 5: Domain Workflow Enablement (12 SP)

- Crypto live-trading workflow with quorum approval (5 SP)
- HR onboarding workflow with sequential chain (4 SP)
- MOD-02 interface contract validation for selected modules (3 SP)

Source: S12/S13 deferrals, MOD-01 interface contracts

### Epic 6: Buy Integrations (11 SP)

- Stripe Billing API (FA-1 invoicing) — 3 SP
- HubSpot CRM integration (CRM-1..4) — 5 SP
- Asana PM integration (PM-1 tasks) — 2 SP
- Toggl time tracking (PM-2) — 1 SP

Source: MOD-01 buy recommendations. Follows Epic 5 interface contracts.

### Epic 7: Compliance & Communications (8 SP)

- Consent withdrawal UI (full React component) — 3 SP
- Push notifications / FCM — 3 SP
- SMS channel — 2 SP

Source: Phase 2 Epic 5 deferrals, FEAT-04 API foundation

### Epic 8: Platform Maturity (5 SP)

- FA-4 department budgeting (build) — 5 SP (leverages existing LLM budget service)

Source: MOD-01 build recommendation

---

## 3. Sprint Overview

| Sprint | Weeks | SP | Epics | Theme |
|--------|-------|-----|-------|-------|
| 15 | 1-2 | 25 | Epic 1 + Epic 2 start | "Go live" — production deployment + ML safety |
| 16 | 3-4 | 26 | Epic 2 finish + Epic 3 | "Build the builder" — visual workflow + WebSocket |
| 17 | 5-6 | 25 | Epic 4 | "Track the work" — case tracking modules |
| 18 | 7-8 | 26 | Epic 5 + Epic 6 start | "Domain delivery" — crypto/HR workflows + integrations |
| 19 | 9-10 | 25 | Epic 6 finish + Epic 7 + Epic 8 | "Close Phase 3" — integrations + compliance + maturity |
| **Total** | **10 weeks** | **~127 SP** | **All 8** | |

---

## 4. Dependency Sequence

```
Epic 1 (Production) ────────→ Epic 5 (Domain Workflows) [requires real infra]
                     └──────→ Epic 6 (Buy Integrations) [requires vendor APIs in staging]
                     └──────→ Epic 7 (Compliance) [requires production controls]

Epic 2 (LLM Safety v2) ────→ Epic 5 (Crypto live-trading needs safety pipeline)

Epic 3 (Workflow Builder) ──→ Epic 4 (Case Tracking uses workflow engine)

Epic 5 (Domain Workflows) ──→ Epic 6 (Buy integrations follow interface contracts)

Epic 8 (Budgeting) ─────────→ independent (reuses existing budget service)
```

---

## 5. FRD Requirement Mapping

### Platform-Core FRD (remaining)

| Requirement | Epic | Status |
|-------------|------|--------|
| FR-CORE-WFE-001 (full visual builder) | 3 | Phase 3 |
| FR-CORE-NOTIF-001 (multi-channel push/SMS) | 7 | Phase 3 |

### Crypto Domain FRD

| Requirement | Addressable | Epic |
|-------------|------------|------|
| FR-CRYPTO-TRD-001 (live trading lifecycle) | Yes | 5 |
| FR-CRYPTO-TRD-003 (position monitoring) | Partial | 5 |
| FR-CRYPTO-RISK-001/002/003 (risk management) | Partial | 5 |
| FR-CRYPTO-SMT-* (smart money tracking) | No — Phase 4+ | — |
| FR-CRYPTO-NS-* (narrative scouting) | No — Phase 4+ | — |

### HR Domain FRD

| Requirement | Addressable | Epic |
|-------------|------------|------|
| FR-HR-CM-002 (workflow editor) | Yes (via Epic 3) | 3 |
| FR-HR-CM-004/005 (SAR, anonymization) | Partial | 7 |
| FR-HR-COMP-001/002 (PH compliance) | Partial | 5 |
| FR-HR-COMP-003/004/005 (BIR, tax, DPA) | No — Phase 4+ | — |

---

## 6. Prerequisites

| Prerequisite | Owner | Needed By |
|-------------|-------|-----------|
| Staging environment with production topology | DevOps | Sprint 15 |
| Supabase Pro plan (OIDC SSO + SAML) | Admin | Sprint 15 |
| HA database cluster (DO Managed PostgreSQL) | DevOps | Sprint 15 |
| Split Redis instances (Upstash) | DevOps | Sprint 15 |
| SMTP credentials (SendGrid/Mailgun) | Admin | Sprint 15 |
| Stripe Billing API key + test account | Finance | Sprint 18 |
| HubSpot API key + sandbox | Sales | Sprint 18 |
| Asana + Toggl API access | PM | Sprint 18 |
| ML model hosting (Replicate/HuggingFace) | Senior | Sprint 15 |
| Compliance policy sign-off (HR DPA/DOLE) | Legal | Sprint 18 |

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Production deployment reveals hidden issues | Medium | High | Staging validation first; feature flags for gradual rollout |
| ML classifier accuracy insufficient | Medium | Medium | Eval harness with benchmarks; rule-based fallback preserved |
| Vendor API contracting delays | Medium | Medium | Start procurement in Sprint 15; sandbox access for dev |
| Visual builder scope creep | High | Medium | Foundation + graph validation only; full canvas is Phase 3 scope |
| Live trading operational risk | Medium | High | Kill-switch + HITL quorum enforcement; paper-trade validation first |
| In-memory → production behavior drift | Medium | Medium | Production E2E suite; documented stub-to-real migration checklist |

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Production deployment | Staging validated, production gates passed |
| Test count | > 2,000 |
| FRD requirements addressed | All platform-core + partial domain |
| ML classifier precision/recall | > 90% / > 80% |
| Case tracking modules | CT-1..CT-4 operational |
| Buy integrations | 4 vendors connected |
| Open warnings | 0 |

---

## 9. Explicit Non-Goals (Phase 4+)

- CT-5 customer portal (UI framework decision needed)
- PM-3 resource planning (complex, domain-specific)
- Multi-region DR
- Full per-domain physical database split
- FR-CRYPTO-SMT-* (smart money tracking — requires real MCP servers)
- FR-CRYPTO-NS-* (narrative scouting — requires social data sources)
- FR-HR-COMP-003/004/005 (BIR tax, retention, export — requires legal review)
