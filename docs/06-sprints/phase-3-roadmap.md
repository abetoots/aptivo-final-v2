# Phase 3 Roadmap: Production Delivery & Domain Expansion

**Timeline**: 10 weeks (5 sprints x 2 weeks, Sprints 15-19)
**Team**: 3 developers (1 Senior, 2 Web Devs)
**Goal**: Production deployment, domain module delivery, advanced AI safety, buy integrations — **backend/API scope only**
**Derived from**: [Phase 2 Delivery Review](./phase-2-delivery-review.md), [Modules Analysis](./phase-2-modules-analysis.md), Sprint 12-14 deferred items
**Phase 2 baseline**: 172 SP delivered, 1,580 tests, all 8 Phase 2 epics complete, 0 open warnings
**Multi-Model Review**: [PHASE_3_ROADMAP_MULTI_REVIEW.md](./PHASE_3_ROADMAP_MULTI_REVIEW.md)

> **UI/UX descope decision (2026-04-20)**: All UI work — design system, domain screens, visual workflow builder canvas, consent withdrawal UI, MFA enrollment UX, operator console UX, analytics, accessibility, i18n — is **deferred to Phase 3.5** and tracked as a first-class roadmap item at [`phase-3.5-ui-roadmap.md`](./phase-3.5-ui-roadmap.md). Phase 3 ships APIs, workflows, ML safety pipelines, integrations, and production infrastructure; Phase 3.5 turns the API-complete platform into a usable product. This separation is intentional — do not re-collapse UI into Phase 3 sprint scope under schedule pressure.

---

## 1. Consolidated Deferred Backlog

All items deferred from Phase 2 sprints, consolidated into Phase 3 scope:

| Item | SP | Source | Epic | Scope |
|------|-----|--------|------|-------|
| Production deployment (real HA, MFA, Redis) | 8 | S10/S12/S14 deployment gates | 1 | backend/infra |
| Production E2E with real infrastructure | 3 | S14 delivery review | 1 | backend |
| ML injection classifier | 5 | S12 deferred | 2 | backend |
| LLM streaming content filter | 3 | S12/S13 deferred | 2 | backend |
| Active anomaly blocking | 2 | S14 preview | 2 | backend |
| ~~Full visual workflow builder (drag-drop)~~ | ~~8~~ | S14 FEAT-07 | 3 | **→ Phase 3.5 UI-E** |
| Graph validation API (cycle/unreachable detection) | 3 | S14 FEAT-07 foundation | 3 | backend |
| WebSocket server + protocol (spec in `websocket-lifecycle.md`) | 3 | S14 websocket-lifecycle.md spec | 3 | backend |
| ~~WebSocket real-time UI surfaces~~ | ~~2~~ | — | 3 | **→ Phase 3.5 UI-F** |
| Case tracking CT-1 API (Ticket CRUD) | 3 | MOD-01 build | 4 | backend |
| ~~Case tracking CT-1 UI (Ticket screens)~~ | ~~2~~ | MOD-01 build | 4 | **→ Phase 3.5 UI-D** |
| Case tracking CT-2 SLA tracking engine | 2 | MOD-01 build | 4 | backend |
| ~~Case tracking CT-2 SLA dashboard UI~~ | ~~1~~ | MOD-01 build | 4 | **→ Phase 3.5 UI-D** |
| Case tracking CT-3 (Escalation) | 3 | MOD-01 build | 4 | backend logic |
| Case tracking CT-4 reporting queries | 2 | MOD-01 build | 4 | backend |
| ~~Case tracking CT-4 reporting UI~~ | ~~1~~ | MOD-01 build | 4 | **→ Phase 3.5 UI-D** |
| Crypto live-trading workflow | 5 | S12/S13 deferred | 5 | backend |
| HR onboarding workflow | 4 | S12/S13 deferred | 5 | backend |
| MOD-02 interface contract validation | 3 | S14 deferred | 5 | backend |
| Stripe Billing integration (FA-1) | 3 | MOD-01 buy | 6 | backend |
| HubSpot CRM integration (CRM-1..4) | 5 | MOD-01 buy | 6 | backend |
| Asana PM integration (PM-1) | 2 | MOD-01 buy | 6 | backend |
| Toggl time tracking (PM-2) | 1 | MOD-01 buy | 6 | backend |
| ~~Consent withdrawal UI (React component)~~ | ~~3~~ | S14 preview | 7 | **→ Phase 3.5 UI-H** |
| Consent withdrawal API hardening | 1 | S14 preview | 7 | backend |
| Push notifications / FCM backend + delivery | 2 | Phase 2 Epic 5 deferred | 7 | backend |
| ~~Push notifications UX (in-app preferences)~~ | ~~1~~ | Phase 2 Epic 5 | 7 | **→ Phase 3.5 UI-H** |
| SMS channel backend | 2 | Phase 2 Epic 5 deferred | 7 | backend |
| FA-4 Budgeting (build) | 5 | MOD-01 build | 8 | backend |

**Phase 3 total (backend-only)**: ~75 SP
**Moved to Phase 3.5**: ~18 SP of UI items (see [phase-3.5-ui-roadmap.md](./phase-3.5-ui-roadmap.md) for the full 137-SP UI track including foundation work)

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

### Epic 3: Workflow Experience — Backend Only (6 SP)

- Graph validation API (cycle detection, unreachable step detection) — 3 SP
- WebSocket server implementation + protocol (per `websocket-lifecycle.md` spec) — 3 SP

> **Descoped to Phase 3.5**: Full visual workflow builder canvas (drag-drop, node editor), WebSocket UI surfaces (live status, collaboration cursors). See Phase 3.5 UI-E (Visual Builder) and UI-F (Real-Time UI) — 21 SP combined in the UI roadmap.

Source: FEAT-07 backend foundation, websocket-lifecycle.md. Epic 3 backend unblocks Phase 3.5 UI-E and UI-F.

### Epic 4: Case Tracking — Backend Only (10 SP)

- CT-1: Ticket CRUD **API** (3 SP) — leverages workflow definition API. UI descoped.
- CT-2: SLA tracking **engine** (2 SP) — leverages burn-rate alerting infra. Dashboard descoped.
- CT-3: Escalation logic (3 SP) — leverages HITL sequential chains. Pure backend.
- CT-4: Reporting **queries** (2 SP) — leverages metric service. Report UI descoped.

> **Descoped to Phase 3.5**: all ticket list/detail/edit screens, SLA dashboard UI, escalation viewer, reporting charts. See Phase 3.5 UI-D (Case Tracking UI, 12 SP).

Source: MOD-01 build recommendations. **Highest-value build track** — reuses existing platform infrastructure. Phase 3 ships the API layer; Phase 3.5 makes it operable by humans.

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

### Epic 7: Compliance & Communications — Backend Only (5 SP)

- Consent withdrawal API hardening (1 SP) — idempotency, audit, cascading data operations. **UI descoped.**
- Push notifications / FCM backend + delivery adapter (2 SP) — Firebase integration, device registration API, retry policy. **Preference UX descoped.**
- SMS channel backend (2 SP) — Twilio adapter, HITL-only route, rate-limit.

> **Descoped to Phase 3.5**: Consent withdrawal UI React component, notification preference center, privacy dashboard, communications opt-in/opt-out flows. See Phase 3.5 UI-H (Compliance & Comms UX, 5 SP).

Source: Phase 2 Epic 5 deferrals, FEAT-04 API foundation.

### Epic 8: Platform Maturity (5 SP)

- FA-4 department budgeting (build) — 5 SP (leverages existing LLM budget service)

Source: MOD-01 build recommendation

---

## 3. Sprint Overview

| Sprint | Weeks | SP | Epics | Theme |
|--------|-------|-----|-------|-------|
| 15 ✅ | 1-2 | 26 | Epic 1 + Epic 2 start | "Go live" — production deployment + streaming content filter MVP (DELIVERED 2026-03-18) |
| 16 | 3-4 | 15 | Epic 2 finish + Epic 3 backend | "Safety + protocol" — ML classifier + graph validation + WebSocket server |
| 17 | 5-6 | 10 | Epic 4 | "Track the work (APIs)" — case tracking APIs + SLA engine + escalation logic + reporting queries |
| 18 | 7-8 | 17 | Epic 5 + Epic 6 start | "Domain delivery" — crypto live trading + HR onboarding + MOD-02 contracts + first integrations |
| 19 | 9-10 | 17 | Epic 6 finish + Epic 7 + Epic 8 | "Close Phase 3 backend" — remaining integrations + compliance APIs + FA-4 budgeting |
| **Total (backend)** | **10 weeks** | **~85 SP** | **All 8 (API surfaces)** | |
| Phase 3.5 follows | 12 weeks | **137 SP** | UI track | [phase-3.5-ui-roadmap.md](./phase-3.5-ui-roadmap.md) |

> SP totals shifted from 127 → ~85 after UI descope. Sprint 15 delivered on original scope (before descope) so its 26 SP reflects actual Sprint 15 output including streaming filter MVP. Sprints 16-19 are lighter than originally planned; remaining capacity can be used for technical debt reduction, additional deferred items, or compressing Phase 3 to 4 sprints.

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

## 10. Phase 3.5 Hand-Off

Phase 3 exit = API-complete platform. The deliverables Phase 3.5 inherits:

- **OpenAPI v1.2.0+** covering all admin, domain, and case-tracking endpoints with admin schema additions (required arrays, Sunset headers) and the two endpoints currently pending (approval-sla, feature-flags)
- **WebSocket spec + server** from Epic 3 (protocol + connection lifecycle per `websocket-lifecycle.md`)
- **Event schemas** for real-time UI subscriptions
- **Production infrastructure** (Epic 1) — OIDC/SSO, MFA, HA DB, Redis split, SMTP, feature flags
- **ML safety classifiers** (Epic 2) — inform UX copy for blocked prompts/denied actions
- **Domain APIs** for all personas: HR (4 personas), Crypto (3 personas), platform admin (3 personas), case tracking (new)
- **Integration adapters** (Epic 6) — Stripe, HubSpot, Asana, Toggl — ready to surface in UI preference/settings screens

Phase 3.5 scope is [phase-3.5-ui-roadmap.md](./phase-3.5-ui-roadmap.md). Designer engagement (F-1) should begin contracting during Sprint 17 so the designer is active by Sprint 20 (start of Phase 3.5). UX discovery (F-2) can start in parallel with Phase 3 Sprint 19 if the designer is onboarded early.
