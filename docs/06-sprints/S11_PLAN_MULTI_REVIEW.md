# Sprint 11 Plan — Multi-Model Review

**Date**: 2026-03-16
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: Sprint 11 planning (Phase 2 Sprint 3: Multi-Approver HITL + Advanced Workflows)
**Verdict**: 10 tasks, 29 SP. Absorb 1 Sprint 10 residual (D-4), defer 2 deployment items.

---

## Executive Summary

Both models agree on the core structure: policy model first, then quorum engine, then sequential chains, then domain workflow updates. Codex restructures the macro plan into a more granular task breakdown that separates schema from logic — Claude adopts this approach. One Sprint 10 residual absorbed (session DELETE blacklisting, 1 SP). Delegation scoped to MVP (timeout escalation only, no admin UI).

---

## Consensus Findings

### 1. Policy Model Must Come First
Both models independently placed the approval policy schema/interfaces as the first implementation task, before any quorum or sequential logic.

### 2. Session DELETE Blacklisting Absorbed
Both models absorb D-4 from Sprint 10 as a 1 SP starter task — it's security-relevant and unblocks clean session management.

### 3. Delegation Scoped to MVP
Both models scope delegation to timeout escalation only (2 SP), deferring full delegation admin UI to Sprint 13+.

### 4. Parent/Child Kept In-Sprint
Both models keep WFE-007 (parent/child workflow orchestration) at 4-5 SP. It's core Phase 2 value.

---

## Final Task Allocation (29 SP)

| Task | SP | Source | Owner |
|------|-----|--------|-------|
| HITL2-00: Session DELETE Token Blacklisting | 1 | S10 residual D-4 | Web Dev 1 |
| HITL2-01: Approval Policy Model + Schema | 4 | Macro (restructured) | Senior |
| HITL2-02: Multi-Approver Request Creation | 4 | Macro (restructured) | Senior |
| HITL2-03: Quorum Decision Engine | 5 | Macro HITL2-01 | Senior |
| HITL2-04: Sequential Chain + Timeout Escalation | 2 | Macro HITL2-02 (MVP) | Web Dev 1 |
| HITL2-05: "Request Changes" Decision Type | 3 | Macro HITL2-03 | Web Dev 2 |
| HITL2-06: Parent/Child Workflow Orchestration | 4 | Macro HITL2-05 (WFE-007) | Web Dev 2 |
| HITL2-07: Domain Workflow Upgrades (HR + Crypto) | 3 | Macro HITL2-06/07 | Web Dev 1 |
| HITL2-08: Integration Tests | 2 | Macro HITL2-08 | All |
| HITL2-09: HITL v2 Documentation | 1 | Macro HITL2-09 | Web Dev 2 |
| **Total** | **29** | | |
