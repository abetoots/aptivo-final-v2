# Phase 2 Sprint Plan

**Timeline**: 12 weeks (6 sprints x 2 weeks)
**Team**: 3 developers (1 Senior, 2 Web Devs)
**Goal**: Enterprise readiness, compliance hardening, and platform feature expansion
**Derived from**: [Phase 2 Roadmap](./phase-2-roadmap.md), [Tier 1-3 Re-Evaluation findings](./TIER1_FOUNDATIONAL_MULTI_REVIEW.md)
**Phase 1 baseline**: 232 SP, 1,359 tests, 37/37 warnings resolved, 10 packages

---

## Phase 2 Scope Decision

Phase 2 addresses all 8 epics from the roadmap, 6 deferred FR-CORE requirements from Phase 1, 5 scope-limited items to complete, and P2 items from the Tier 2 concern re-evaluation.

### Deferred from Phase 1 (Build in Phase 2)

| FRD Requirement | Sprint | Rationale |
|-----------------|--------|-----------|
| FR-CORE-WFE-007 Parent/Child Workflows | 3 | Needed for multi-stage approval chains |
| FR-CORE-AUD-002 Query & Export | 4 | Audit reporting for compliance |
| FR-CORE-AUD-003 Retention Policies | 4 | Domain-specific compliance rules now defined |
| FR-CORE-NOTIF-003 Priority Routing & Quiet Hours | 5 | Notification volume now exists from live domains |
| FR-CORE-INT-001 Workflow Logic Export | 5 | Enables visual workflow builder |
| FR-CORE-INT-002 Extensible Action Points | 5 | Full webhook extensibility |

### Phase 1 Scope-Limited (Complete in Phase 2)

| FRD Requirement | Phase 1 Scope | Phase 2 Full Scope | Sprint |
|-----------------|---------------|-------------------|--------|
| FR-CORE-HITL-003 Approve/Reject/Changes | Approve and reject only | Add "request changes" decision type | 3 |
| FR-CORE-HITL-004 Approval Policies | Single-approver + TTL | Multi-approver, quorum, auto-reject | 3 |
| FR-CORE-ID-001 Passwordless Auth | Supabase Auth (magic links + OAuth) | SSO via OIDC/SAML + WebAuthn/Passkeys | 1 |
| FR-CORE-ID-003 Session Management | Revocation only | Concurrent limits, token rotation, blacklist | 1 |

### Tier 2 P2 Items (Concern Re-Evaluation)

| Finding | Type | Sprint |
|---------|------|--------|
| EP-1: Circuit-breaker lifecycle test specs | Test | 2 |
| EP-2: Auth-failure path test cases | Test | 1 |
| RC-1/RC-2: WebSocket lifecycle documentation | Doc | 5 |
| AB-1: Async auth propagation through Inngest | Doc | 1 |
| SM-1: Dual-secret rotation mechanism | Doc | 1 |

### Phase 1 Warnings Deferred to Phase 2

| Warning | Finding | Sprint |
|---------|---------|--------|
| S2-W5 | PII read audit trail | 4 |
| S3-W10 | Event schema rollout policy | 1 |
| S5-W17 | Burn-rate alerting | 4 |

---

## Sprint Overview

| Sprint | Theme | SP | Weeks | Primary Epics | Key Deliverables |
|--------|-------|----|-------|---------------|------------------|
| 1 | Identity & Access Hardening | 29 | 1-2 | Epic 1 | SSO, MFA, session management, token blacklist |
| 2 | Infrastructure Hardening | 28 | 3-4 | Epic 6 | HA database, Redis split, secrets manager, drift automation |
| 3 | Multi-Approver HITL | 29 | 5-6 | Epic 2 | Quorum approval, parent/child workflows, approval chains |
| 4 | LLM Safety + Observability | 30 | 7-8 | Epic 3 + Epic 4 | Injection detection, content filtering, burn-rate alerts, audit export |
| 5 | Notifications + Platform Features | 29 | 9-10 | Epic 5 + Epic 7 | SMTP fallback, priority routing, workflow export, feature flags |
| 6 | Integration & Phase 2 Delivery | 27 | 11-12 | Epic 7 + Epic 8 | Visual builder foundation, deferred modules analysis, E2E validation |
| **Total** | | **172** | **12 weeks** | **All 8 Epics** | |

### Dependency Sequence

```
Sprint 1 (Identity) ─────→ Sprint 3 (HITL v2) [HITL needs RBAC v2]
                     └───→ Sprint 4 (LLM Safety) [admin MFA before LLM production use]

Sprint 2 (Infrastructure) → Sprint 4 (Observability) [burn-rate needs reliable metrics infra]

Sprint 5 (Notifications + Features) ── independent
Sprint 6 (Integration + Modules) ── depends on Sprint 5 (feature flags for gradual rollout)
```

---

## Sprint 1: Identity & Access Hardening (Epic 1)

**Theme**: "Trust no token" — Enterprise auth, mandatory MFA, immediate revocation
**Weeks**: 1-2 (Phase 2)
**FRD Coverage**: FR-CORE-ID-001 (full SSO), FR-CORE-ID-003 (full session management)

### Why Identity First?

1. **Enterprise deployment blocker**: SSO via OIDC/SAML is required for B2B customers (Critical priority)
2. **Dependency gate**: Epic 2 (Multi-Approver HITL) and Epic 3 (LLM Safety) both require RBAC v2 and admin MFA
3. **Closes 15-minute exposure window**: Redis token blacklist eliminates the JWT revocation gap flagged in Tier 2 (AS-1)
4. **Resolves Tier 2 auth concerns**: EP-2 auth-failure tests, AB-1 async auth docs, SM-1 rotation docs

### Tasks

| Task | Owner | SP | Dependencies | FRD |
|------|-------|----|--------------|-----|
| **ID2-01: OIDC Provider Integration** | Senior | 5 | Supabase Auth (SP-03) | ID-001 |
| **ID2-02: SAML Adapter Contract** | Senior | 3 | ID2-01 | ID-001 |
| **ID2-03: Admin MFA Enrollment & Enforcement** | Web Dev 1 | 3 | ID2-01 | ID-001 |
| **ID2-04: WebAuthn/Passkey Registration** | Web Dev 2 | 5 | ID2-03 | ID-001 |
| **ID2-05: Concurrent Session Limits** | Web Dev 1 | 3 | ID-01 (existing RBAC) | ID-003 |
| **ID2-06: Redis Token Blacklist** | Senior | 3 | ID2-05 | ID-003 |
| **ID2-07: Auth-Failure Test Matrix** | Web Dev 2 | 2 | ID2-01, ID2-06 | EP-2 |
| **ID2-08: Async Auth Propagation Doc** | Web Dev 2 | 1 | ID2-01 | AB-1 |
| **ID2-09: Dual-Secret Rotation Doc** | Web Dev 1 | 1 | — | SM-1 |
| **ID2-10: Event Schema Rollout Policy** | Web Dev 1 | 1 | — | S3-W10 |
| **ID2-11: Integration Tests** | All | 2 | ID2-01 through ID2-06 | — |

**Sprint total: 29 SP**

- **ID2-01**: Wire Supabase Auth OIDC provider for enterprise IdPs (Google Workspace, Okta, Azure AD). Role mapping from IdP claims to Aptivo RBAC roles. Update `rbac-resolver.ts` to handle external identity sources.
- **ID2-02**: SAML 2.0 adapter interface contract. Phase 2 delivers OIDC; SAML adapter is contract-only (implementation when customer requires it). Validates Supabase SAML support availability.
- **ID2-03**: MFA enrollment UI for admin roles. TOTP (authenticator app) as primary factor. Server-side enforcement: admin API routes reject requests without active MFA session. Step-up challenge for sensitive operations (HITL approval, role changes).
- **ID2-04**: WebAuthn/Passkey registration and challenge verification. Depends on Supabase WebAuthn support (SP-03 validated capability). Fallback to TOTP if WebAuthn not available.
- **ID2-05**: Configurable concurrent session limit per role (default: 3 for User, 1 for Admin). Oldest session evicted on new login when limit reached. Session count tracked in Redis.
- **ID2-06**: Redis-backed JWT blacklist with TTL matching JWT expiry. `checkBlacklist()` middleware runs on every authenticated request. Closes the 15-minute JWT revocation window (Tier 2 AS-1). Revocation propagation < 1s.
- **ID2-07**: Comprehensive auth-failure test matrix covering: expired JWT, invalid signature, JWKS fetch failure, JWKS stale-if-error fallback, MFA step-up required, blacklisted token, exceeded session limit. Maps to FR-CORE-ID-001/002/003 in RTM. Closes Tier 2 EP-2.
- **ID2-08**: Document how user identity and roles propagate through Inngest `step.run()` activities. Pattern: serialize auth context into event payload, deserialize in step function. Closes Tier 2 AB-1.
- **ID2-09**: Document dual-secret rotation mechanism: how the application validates both old and new secrets during rotation window. Covers HITL_SECRET, webhook HMAC keys. Closes Tier 2 SM-1.
- **ID2-10**: Documented policy for rolling out breaking Inngest event schema changes. Procedure: add new fields as optional → deploy consumers → make required → remove old fields. Closes S3-W10.

### Doc-Gate Requirement

Per Phase 2 Roadmap §6, Epic 1 requires updates to:
- `docs/04-specs/authentication.md` — WebAuthn §6.2 expansion
- `docs/03-architecture/platform-core-add.md` §8 — RBAC v2 design

These updates are delivered as part of ID2-08 and ID2-09 documentation tasks.

### Sprint 1 Definition of Done

- [ ] OIDC SSO login works end-to-end with at least one enterprise IdP *(ID-001)*
- [ ] SAML adapter contract defined with implementation stub *(ID-001)*
- [ ] Admin MFA is mandatory and enforced server-side *(ID-001)*
- [ ] WebAuthn/Passkey enrollment and authentication functional *(ID-001)*
- [ ] Concurrent session limits enforced per role *(ID-003)*
- [ ] Redis token blacklist eliminates 15-minute JWT exposure window *(ID-003, AS-1)*
- [ ] Auth-failure test matrix implemented and running in CI *(EP-2)*
- [ ] Async auth propagation documented in ADD §3 *(AB-1)*
- [ ] Dual-secret rotation mechanism documented in ADD §8.8 and Runbook §9.3 *(SM-1)*
- [ ] Event schema rollout policy documented *(S3-W10)*
- [ ] 80%+ test coverage on new identity/session code
- [ ] CI pipeline green with all auth-failure negative tests passing

---

## Sprint 2: Infrastructure Hardening (Epic 6)

**Theme**: "The floor must hold" — HA database, Redis isolation, automated drift detection
**Weeks**: 3-4
**FRD Coverage**: Non-functional (SLO compliance, operational maturity)

### Tasks (High-Level)

| Task | Owner | SP | Dependencies | Epic |
|------|-------|----|--------------|------|
| **INF-01: HA Database Upgrade** | Senior | 5 | — | 6 |
| **INF-02: Per-Domain Connection Pools** | Web Dev 2 | 3 | INF-01 | 6 |
| **INF-03: Redis Instance Separation** | Senior | 3 | — | 6 |
| **INF-04: Secrets Manager Integration** | Web Dev 1 | 5 | — | 6 |
| **INF-05: Worker Auto-Scaling Config** | Web Dev 2 | 2 | — | 6 |
| **INF-06: Drift Detection CI Pipeline** | Web Dev 1 | 3 | — | 6 |
| **INF-07: Circuit-Breaker Lifecycle Tests** | Web Dev 2 | 2 | MCP-04 (P1) | EP-1 |
| **INF-08: HA Failover Validation** | Senior | 3 | INF-01 | 6 |
| **INF-09: Integration Tests** | All | 2 | All above | — |

**Sprint total: 28 SP**

### Sprint 2 Definition of Done

- [ ] HA database with automatic failover (< 30s interruption)
- [ ] Per-domain connection pool isolation prevents cross-domain pool exhaustion
- [ ] Separate Redis instances for jobs vs cache
- [ ] Secrets manager (Vault/DO) replaces env-var-based secrets for rotation-sensitive keys
- [ ] Drift detection runs weekly in CI; alerts on spec divergence
- [ ] Circuit-breaker lifecycle tests cover open/half-open/closed transitions *(EP-1)*
- [ ] RTO target achievable at < 4h with automated failover (restored from Phase 1's < 8h manual target)
- [ ] 80%+ test coverage on new infrastructure code

---

## Sprint 3: Multi-Approver HITL + Advanced Workflows (Epic 2)

**Theme**: "Two heads approve better than one"
**Weeks**: 5-6
**FRD Coverage**: FR-CORE-HITL-003 (full), FR-CORE-HITL-004 (full), FR-CORE-WFE-007

### Tasks (High-Level)

| Task | SP | Description | FRD |
|------|----|-------------|-----|
| **HITL2-01** | 5 | Quorum-based approval (2-of-3) with configurable threshold | HITL-004 |
| **HITL2-02** | 3 | Sequential approval chains (ordered multi-step) | HITL-004 |
| **HITL2-03** | 3 | "Request changes" decision type with re-submission flow | HITL-003 |
| **HITL2-04** | 3 | Approval delegation and timeout escalation | HITL-004 |
| **HITL2-05** | 5 | Parent/child workflow orchestration via Inngest | WFE-007 |
| **HITL2-06** | 3 | Contract approval workflow updated for multi-approver | HR domain |
| **HITL2-07** | 3 | Trade execution workflow updated for quorum approval | Crypto domain |
| **HITL2-08** | 2 | Integration tests (multi-approver + parent/child) | — |
| **HITL2-09** | 2 | Doc: HITL Gateway TSD §12-14 expansion | Doc-gate |

**Sprint total: 29 SP**

---

## Sprint 4: LLM Safety + Observability Maturity (Epic 3 + Epic 4)

**Theme**: "Guard the models, measure everything"
**Weeks**: 7-8
**FRD Coverage**: FR-CORE-LLM-003 (hardening), FR-CORE-AUD-002, FR-CORE-AUD-003

### Tasks (High-Level)

| Task | SP | Description | Epic |
|------|----|-------------|------|
| **LLM2-01** | 5 | Prompt injection detection classifier (RR-2) | 3 |
| **LLM2-02** | 3 | Content filtering pipeline for harmful output (RR-3) | 3 |
| **LLM2-03** | 3 | Per-user LLM rate limits (token bucket per session) | 3 |
| **LLM2-04** | 3 | Multi-provider routing (cost vs latency optimization) | 3 |
| **OBS-01** | 3 | Burn-rate SLO alerting (multi-window analysis) | 4 |
| **OBS-02** | 3 | Audit query & export with checksums (AUD-002) | 4 |
| **OBS-03** | 3 | Retention policies with domain overrides (AUD-003) | 4 |
| **OBS-04** | 3 | PII read audit trail (S2-W5) | 4 |
| **OBS-05** | 2 | Anomaly detection for bulk data access (RR-6) | 4 |
| **OBS-06** | 2 | Integration tests | — |

**Sprint total: 30 SP**

---

## Sprint 5: Notifications + Platform Features (Epic 5 + Epic 7)

**Theme**: "Never miss a message, build the builder"
**Weeks**: 9-10
**FRD Coverage**: FR-CORE-NOTIF-003, FR-CORE-INT-001, FR-CORE-INT-002

### Tasks (High-Level)

| Task | SP | Description | Epic |
|------|----|-------------|------|
| **NOTIF2-01** | 3 | SMTP fallback for HITL notifications | 5 |
| **NOTIF2-02** | 2 | Novu delivery rate monitoring (silent-drop detection) | 5 |
| **NOTIF2-03** | 3 | Priority routing & quiet hours (NOTIF-003) | 5 |
| **FEAT-01** | 5 | Workflow definition CRUD API (INT-001) | 7 |
| **FEAT-02** | 3 | Extensible webhook action points (INT-002) | 7 |
| **FEAT-03** | 5 | Runtime feature flag service (LaunchDarkly/Unleash) | 7 |
| **FEAT-04** | 3 | Self-service consent withdrawal UI (DPA Art 7) | 7 |
| **FEAT-05** | 2 | WebSocket lifecycle documentation (RC-1, RC-2) | Doc |
| **FEAT-06** | 3 | Integration tests | — |

**Sprint total: 29 SP**

---

## Sprint 6: Integration & Phase 2 Delivery (Epic 7 + Epic 8)

**Theme**: "Ship it, plan the next horizon"
**Weeks**: 11-12
**FRD Coverage**: FR-CORE-WFE-001 (visual builder foundation), Epic 8 analysis

### Tasks (High-Level)

| Task | SP | Description | Epic |
|------|----|-------------|------|
| **FEAT-07** | 5 | Visual workflow builder (rule editor UI foundation) | 7 |
| **FEAT-08** | 3 | Dynamic MCP server discovery API | 7 |
| **FEAT-09** | 3 | Per-tool MCP circuit breaker override config | 7 |
| **MOD-01** | 3 | Deferred modules buy/build analysis (FA, CT, PM, CRM) | 8 |
| **MOD-02** | 3 | Interface contract validation for selected modules | 8 |
| **INT2-01** | 5 | E2E validation: SSO → MFA → multi-approver → LLM → workflow | — |
| **INT2-02** | 3 | Phase 2 documentation closure + WARNING register update | — |
| **INT2-03** | 2 | Multi-model Phase 2 delivery review | — |

**Sprint total: 27 SP**

---

## FRD Traceability Matrix (Phase 2)

| FRD ID | Title | Phase 1 Status | Phase 2 Sprint | Phase 2 Status |
|--------|-------|----------------|----------------|----------------|
| FR-CORE-WFE-001 | Workflow States/Transitions | Scope-limited | 6 | **Delivered (Sprint 14)** — visual builder + step editor + activate lifecycle |
| FR-CORE-WFE-007 | Parent/Child Workflows | Deferred | 3 | **Delivered (Sprint 11)** |
| FR-CORE-HITL-003 | Approve/Reject/Changes | Scope-limited | 3 | **Delivered (Sprint 11)** — request changes + resubmit |
| FR-CORE-HITL-004 | Approval Policies | Scope-limited | 3 | **Delivered (Sprint 11)** — quorum, sequential, delegation MVP |
| FR-CORE-LLM-003 | Fallback on Failure | Full (one-hop) | 4 | **Delivered (Sprint 12)** — multi-provider routing (3 strategies) |
| FR-CORE-NOTIF-003 | Priority Routing | Deferred | 5 | **Delivered (Sprint 13)** — 4-tier priority, quiet hours, SMTP fallback |
| FR-CORE-AUD-002 | Query & Export | Deferred | 4 | **Delivered (Sprint 12)** — paginated query + CSV/JSON export + SHA-256 |
| FR-CORE-AUD-003 | Retention Policies | Deferred | 4 | **Delivered (Sprint 12)** — domain overrides (HR 7yr, crypto 5yr) |
| FR-CORE-ID-001 | Passwordless Auth | Buy (Supabase) | 1 | **Delivered (Sprint 9)** — OIDC SSO + WebAuthn + SAML contract |
| FR-CORE-ID-003 | Session Management | Scope-limited | 1 | **Delivered (Sprint 9)** — limits, blacklist, rotation |
| FR-CORE-INT-001 | Workflow Logic Export | Deferred | 5 | **Delivered (Sprint 13)** — versioned CRUD API, draft/active/archived |
| FR-CORE-INT-002 | Extensible Action Points | Deferred | 5 | **Delivered (Sprint 13)** — webhook action points, HMAC-signed dispatch |
| FR-CORE-ADM-001 | Platform Health Dashboard | Full (P1) | — | Maintained |
| FR-CORE-ADM-002 | LLM Usage & Budget | Full (P1) | — | Maintained |
| FR-CORE-ADM-003 | Audit Log Viewer | Full (P1) | — | Maintained |
| FR-CORE-OBS-001 | SLO Monitoring | Full (P1) | 4 | **Delivered (Sprint 12)** — burn-rate multi-window alerting |
| FR-CORE-OBS-002 | Threshold Alerting | Full (P1) | 4 | **Delivered (Sprint 12)** — burn-rate + error budget model |

**Summary**: 12 requirements addressed in Phase 2 (6 deferred + 4 scope-limited + 2 enhanced)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Supabase SSO/SAML limitations | Medium | High | SP-03 validated OIDC; SAML depends on Supabase Pro plan availability |
| WebAuthn browser support gaps | Low | Medium | TOTP fallback always available; WebAuthn is progressive enhancement |
| HA database migration downtime | Medium | High | Blue-green upgrade with read replica; scheduled maintenance window |
| Prompt injection classifier accuracy | Medium | Medium | Start with rule-based detection; ML classifier in Phase 3 if needed |
| Multi-approver HITL complexity | Medium | Medium | Quorum-based (simpler) before sequential chains |
| Visual builder scope creep | High | Medium | Phase 2 delivers foundation only; full builder is Phase 3 |
| Deferred modules analysis paralysis | Medium | Low | Time-boxed buy/build analysis; decision forced by Sprint 6 end |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| FRD coverage (Phase 2 scope) | 12/12 requirements addressed |
| Test coverage | 80%+ per new package; total tests > 2,000 |
| WARNING closure | S2-W5, S3-W10, S5-W17 resolved |
| Tier 2 P2 items | EP-1, EP-2, RC-1/RC-2, AB-1, SM-1 resolved |
| RTO with HA database | < 4h (automated failover) |
| JWT revocation window | < 1s (Redis blacklist) |
| Multi-approver HITL | Quorum + sequential + delegation |
| LLM safety | Injection detection + content filtering active |
