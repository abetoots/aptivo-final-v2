# Sprint 12 Plan — Multi-Model Review

**Date**: 2026-03-17
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: Sprint 12 planning (Phase 2 Sprint 4: LLM Safety + Observability Maturity)
**Verdict**: 11 tasks, 30 SP. Absorb 3 S11 carry-overs + 1 S10 carry-over. Defer OBS-05 and D-3.

---

## Executive Summary

Both models agree on the core structure: prompt injection and content filtering first (core safety), then rate limits and routing (operational), then observability maturity (audit, retention, burn-rate). Sprint 11 P2 carry-overs absorbed as a 2 SP bundle. OBS-05 (anomaly detection) deferred to Sprint 13 — it needs OBS-04 (PII read audit trail) to be useful. OBS-01 (burn-rate alerting) resized from 3→4 SP for multi-window complexity.

---

## Consensus Findings

### 1. Safety Controls Before Operational Maturity
Both models place LLM2-01 (injection detection) and LLM2-02 (content filtering) early. Rate limits and routing depend on safety controls being in place.

### 2. OBS-05 Deferred to Sprint 13
Both models agree anomaly detection needs richer audit data from OBS-04 before it's useful.

### 3. S11 Carry-Overs as Bundle
Both models bundle the 3 P2 fixes into a single starter task (2 SP).

---

## Final Task Allocation (30 SP)

| Task | SP | Source | Owner |
|------|-----|--------|-------|
| S12-00: S11 Carry-Over Bundle | 2 | S11 F-3/F-4/F-6 | Web Dev 1 |
| LLM2-01: Prompt Injection Detection | 5 | Macro | Senior |
| LLM2-02: Content Filtering Pipeline | 3 | Macro | Senior |
| LLM2-03: Per-User LLM Rate Limits | 3 | Macro | Web Dev 2 |
| LLM2-04: Multi-Provider Routing | 3 | Macro | Web Dev 2 |
| OBS-01: Burn-Rate SLO Alerting | 4 | Macro (resized) | Web Dev 1 |
| OBS-02: Audit Query & Export (AUD-002) | 3 | Macro | Web Dev 1 |
| OBS-03: Retention Policies (AUD-003) | 2 | Macro (resized) | Web Dev 2 |
| OBS-04: PII Read Audit Trail (S2-W5) | 2 | Macro (resized) | Web Dev 1 |
| DEP-12-01: Pool Config Closure (S10 D-1) | 1 | S10 carry-over | Web Dev 2 |
| OBS-06: Integration Tests | 2 | Macro | All |
| **Total** | **30** | | |

### Deferred

| Item | Reason | Target |
|------|--------|--------|
| OBS-05: Anomaly Detection (RR-6) | Needs OBS-04 PII trail data | Sprint 13 |
| S10 D-3: Real HA Failover Test | Deployment-time activity | Deployment gate |
