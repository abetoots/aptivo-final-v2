# Phase 2 Sprint Plan — Multi-Model Review

**Date**: 2026-03-13
**Reviewers**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), Codex (via Codex MCP)
**Scope**: Phase 2 sprint decomposition, Sprint 1 detailed planning
**Verdict**: 6 sprints (12 weeks, 172 SP) — synthesized from Gemini's 4-sprint and Codex's 8-sprint proposals

---

## Executive Summary

All three models agree on the fundamentals: Identity & Access (Epic 1) must be Sprint 1, infrastructure hardening (Epic 6) must precede observability maturity (Epic 4), and the visual workflow builder (Epic 7) is Phase 2 foundation only. The primary divergence was sprint count and pacing. Claude synthesized at 6 sprints (12 weeks) — tighter than Codex's conservative 8-sprint plan but more realistic than Gemini's aggressive 4-sprint proposal.

---

## Consensus Findings

### 1. Identity First — No Debate

All three models independently placed Epic 1 (Identity & Access Hardening) in Sprint 1:
- **Gemini**: "SSO/MFA is a hard enterprise deployment blocker — nothing else ships without it"
- **Codex**: "Identity gates Epic 2 (multi-approver needs RBAC v2) and Epic 3 (LLM safety needs admin MFA)"
- **Claude**: Agrees — dependency chain is clear; also closes 15-minute JWT exposure window (Tier 2 AS-1)

**Decision**: Sprint 1 = Epic 1 exclusively, 29 SP.

### 2. Infrastructure Before Observability

All three models agreed Sprint 2 must be infrastructure hardening (Epic 6) before observability maturity (Epic 4):
- **Gemini**: "HA database and Redis split are prerequisites for reliable burn-rate alerting"
- **Codex**: "Metrics infra must be stable before building burn-rate SLO analysis on top"
- **Claude**: Agrees — also allows Sprint 2 to restore RTO from <8h (Phase 1 manual) to <4h (automated failover)

**Decision**: Sprint 2 = Epic 6, Sprint 4 = Epic 3 + Epic 4.

### 3. Multi-Approver HITL Needs Identity Complete

All three models placed Epic 2 (Multi-Approver HITL) after Epic 1:
- Quorum approval requires RBAC v2 for role-based approver assignment
- Delegation and escalation need the session management improvements from Sprint 1
- Parent/child workflows (WFE-007) don't depend on identity but benefit from the infrastructure hardening

**Decision**: Sprint 3 = Epic 2 + WFE-007.

### 4. Visual Builder Is Foundation Only

All three models flagged scope creep risk on Epic 7 (Platform Features):
- **Gemini**: "Visual builder is a Phase 3 deliverable — Phase 2 delivers the rule editor foundation"
- **Codex**: "Time-box to foundation; full drag-and-drop builder is out of scope"
- **Claude**: Agrees — Sprint 6 delivers CRUD API + basic rule editor; interactive visual builder is Phase 3

**Decision**: FEAT-07 delivers foundation only. Risk register entry added.

### 5. Deferred Module Analysis Is Time-Boxed

All three models agreed Epic 8 (Deferred Modules) should be analysis-only in Phase 2:
- Buy/build decision for Financial Analytics, Case Tracking, PM, CRM
- No implementation — just interface contract validation
- Time-boxed to prevent analysis paralysis

**Decision**: MOD-01 and MOD-02 in Sprint 6, time-boxed to 6 SP total.

---

## Debated Items

### D1: Sprint Count and Pacing

| Model | Sprints | Weeks | SP/Sprint | Rationale |
|-------|---------|-------|-----------|-----------|
| **Gemini** | 4 | 8 | ~43 | Phase 2 has less greenfield work; team velocity proven at 29 SP/sprint in Phase 1 |
| **Codex** | 8 | 16 | ~22 | Conservative buffer for SSO integration unknowns and HA database migration risk |
| **Claude** | 6 | 12 | ~29 | Maintains Phase 1 velocity; acknowledges less greenfield but respects integration complexity |

**Debate**:
- Gemini's 4-sprint plan packed 43 SP into Sprint 1 by combining Epic 1 + Epic 6 + WFE-007. This violates the dependency chain (infrastructure should stabilize before HITL v2) and exceeds the team's proven velocity by 48%.
- Codex's 8-sprint plan spread 172 SP across 16 weeks at ~22 SP/sprint — 24% below proven velocity. The buffer is excessive given Phase 2 is largely extending existing patterns, not greenfield.
- Claude's counter-argument to Gemini: "Phase 1 average was 29 SP/sprint with a 3-person team. Jumping to 43 SP assumes zero integration friction with enterprise IdPs — that's optimistic." Gemini conceded the dependency issue but maintained 5 sprints was achievable.
- Claude's counter-argument to Codex: "8 sprints means 16 weeks — longer than Phase 1's 14 weeks for less total SP (172 vs 232). The team has established patterns and infrastructure." Codex agreed to 7 sprints as a floor.

**Verdict**: 6 sprints (12 weeks, 172 SP). Maintains ~29 SP/sprint average matching Phase 1 velocity. Each sprint has a clear thematic focus. The 12-week timeline is 14% shorter than Phase 1 (14 weeks) which is justified by lower greenfield ratio.

### D2: Sprint 1 Scope — Pure Identity vs. Mixed

| Model | Sprint 1 Scope | SP |
|-------|---------------|-----|
| **Gemini** | Epic 1 + Epic 6 (infra) + WFE-007 | 28 |
| **Codex** | Pure Epic 1 (Identity) | 29 |
| **Claude** | Pure Epic 1 + Tier 2 P2 doc items | 29 |

**Debate**:
- Gemini argued infrastructure hardening (HA database, Redis split) could run in parallel with identity work since different team members would own each track.
- Codex argued Sprint 1 should be laser-focused: "SSO integration with enterprise IdPs (Okta, Azure AD) always takes longer than expected. Don't dilute focus."
- Claude agreed with Codex's focus argument but added Tier 2 P2 documentation items (AB-1, SM-1, S3-W10) as low-risk 1 SP tasks that don't compete for the same attention.

**Verdict**: Sprint 1 = Pure Epic 1 (11 tasks, 29 SP). Tier 2 doc items included because they're documentation-only (3 SP total) and close known gaps without competing for engineering bandwidth.

### D3: Epic 3 + Epic 4 Together or Separate

| Model | Position |
|-------|----------|
| **Gemini** | Together in one sprint (Sprint 3 in their 4-sprint plan) |
| **Codex** | Separate — Epic 3 (LLM Safety) in Sprint 5, Epic 4 (Observability) in Sprint 6 |
| **Claude** | Together in Sprint 4 — complementary concerns, shared infrastructure |

**Debate**:
- Codex wanted separation to reduce sprint complexity. Claude argued LLM safety and observability are tightly coupled — prompt injection detection needs monitoring, burn-rate alerting needs the same MetricService infrastructure as LLM cost tracking.
- Gemini agreed with Claude: "These are two faces of the same production-readiness coin."

**Verdict**: Combined in Sprint 4 at 30 SP. The 1 SP over average is acceptable given the complementary nature of the work.

### D4: Feature Flags Placement

| Model | Position |
|-------|----------|
| **Gemini** | Sprint 2 (early, enables incremental rollout) |
| **Codex** | Sprint 5 (with platform features) |
| **Claude** | Sprint 5 (with platform features — FEAT-03) |

**Debate**:
- Gemini argued feature flags should be early infrastructure. Claude countered: "Phase 2 doesn't have the progressive rollout needs until Sprint 5+ when notification and workflow features land. The overhead of integrating LaunchDarkly/Unleash in Sprint 2 doesn't pay off for 6 weeks."
- Codex agreed with Claude's placement.

**Verdict**: Sprint 5 (FEAT-03, 5 SP). Feature flags are a platform feature, not infrastructure.

---

## Model-Specific Insights

### Gemini — Unique Contributions
- Suggested a "Sprint 0.5" concept for SSO vendor evaluation before committing to Sprint 1 scope. Declined as too conservative — SP-03 already validated Supabase OIDC capability.
- Raised concern about WebAuthn browser support matrix. Incorporated as risk register entry with TOTP fallback mitigation.

### Codex — Unique Contributions
- Identified that the SAML adapter should be contract-only in Phase 2 (no implementation unless customer demands it). Incorporated as ID2-02 design.
- Suggested explicit "Doc-Gate" requirements per sprint — each sprint that touches architecture must update the relevant ADD/TSD sections before closing. Incorporated as Sprint 1 Doc-Gate Requirement section.

### Claude (Lead) — Synthesis Decisions
- FRD Traceability Matrix added to the sprint plan (17 requirements tracked) — neither Gemini nor Codex proposed this, but it mirrors Phase 1 format and enables progress tracking.
- Risk Register with 7 entries synthesized from all three models' concerns.
- Success Metrics table with quantitative targets.

---

## Final Sprint Allocation Summary

| Sprint | Weeks | SP | Epics | Gemini | Codex | Claude (Final) |
|--------|-------|-----|-------|--------|-------|----------------|
| 1 | 1-2 | 29 | Epic 1 | Epic 1+6+WFE-007 | Epic 1 | Epic 1 |
| 2 | 3-4 | 28 | Epic 6 | (merged into S1) | Epic 6 | Epic 6 |
| 3 | 5-6 | 29 | Epic 2 | Epic 2+3 | Epic 2 | Epic 2 |
| 4 | 7-8 | 30 | Epic 3+4 | Epic 5+7+8 | Epic 3 | Epic 3+4 |
| 5 | 9-10 | 29 | Epic 5+7 | (merged into S4) | Epic 4+5 | Epic 5+7 |
| 6 | 11-12 | 27 | Epic 7+8 | — | Epic 7+8 | Epic 7+8 |
| **Total** | **12 wk** | **172** | **All 8** | **8 wk** | **16 wk** | **12 wk** |

---

## Actionable Recommendations

1. **Adopt 6-sprint plan** as documented in `phase-2-sprint-plan.md`
2. **Begin Sprint 1** with ID2-01 (OIDC Provider Integration) as the critical path item
3. **Validate Supabase SAML support** early in Sprint 1 — if unavailable on current plan, escalate to risk register
4. **Schedule HA database migration window** during Sprint 2 planning (Week 2)
5. **Review Sprint 2-6 task decomposition** at Sprint 1 retrospective — high-level tasks will be broken into detailed plans following the Sprint 1 format
