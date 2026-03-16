# Sprint 10 Plan — Multi-Model Review

**Date**: 2026-03-16
**Reviewers**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), Codex/GPT (via Codex MCP)
**Scope**: Sprint 10 planning (Phase 2 Sprint 2: Infrastructure Hardening)
**Verdict**: 10 tasks, 28 SP, absorb all 6 Sprint 9 residuals by merging into related macro tasks

---

## Executive Summary

Both models agree on absorbing all 6 Sprint 9 residuals into Sprint 10 rather than deferring any. The primary divergence is budget: Gemini proposes 35 SP (12 tasks), exceeding team velocity. Codex hits 28 SP (9 tasks) by deferring circuit-breaker tests and merging residuals aggressively. Claude synthesizes at 28 SP (10 tasks) — keeps circuit-breaker tests (EP-1 Tier 2 closure) but merges residuals into related macro tasks to save SP.

---

## Consensus Findings

### 1. Absorb All 6 Sprint 9 Residuals

All three models agree: every residual aligns with the Infrastructure Hardening theme.

| Residual | Absorbed Into |
|----------|--------------|
| WebAuthn Drizzle adapter | INF-01 (HA Database) |
| Atomic Redis session eviction | INF-03 (Redis Separation) |
| Admin route migration to `checkPermissionWithBlacklist` | INF-07 (new: Auth Route Hardening) |
| Wire session routes to `getSessionLimitService()` | INF-07 |
| Wire MFA routes to `getMfaClient()` | INF-04 (Secrets Manager) |
| ADD §8.7 session limits doc update | INF-10 (Integration + Docs) |

### 2. HA Database Is Critical Path

All agree INF-01 starts Day 1 with no dependencies, and INF-02 (connection pools) + INF-09 (failover validation) depend on it.

### 3. Redis Separation Before Atomic Ops

All agree: split Redis instances first, then implement WATCH/MULTI on the session Redis.

---

## Debated Items

### D-1: Circuit-Breaker Tests (INF-08 / EP-1)

| Model | Position |
|-------|----------|
| **Gemini** | Keep (2 SP) |
| **Codex** | Defer to Sprint 11 — not core to infra hardening |
| **Claude** | Keep — EP-1 is a Tier 2 commitment, only 2 SP, tests existing MCP circuit breaker |

**Verdict**: **KEEP**. EP-1 was committed in the Phase 2 Sprint Plan. Deferring a Tier 2 closure sets a bad precedent. The tests exercise existing code (Sprint 3 MCP circuit breaker) and don't require new infrastructure.

### D-2: Total SP Budget

| Model | SP | Tasks |
|-------|-----|-------|
| **Gemini** | 35 | 12 (over velocity by 25%) |
| **Codex** | 28 | 9 (on budget, defers EP-1) |
| **Claude** | 28 | 10 (on budget, keeps EP-1, merges residuals into macro tasks) |

**Verdict**: **28 SP**. Phase 1 velocity was 29 SP/sprint. Staying at 28 SP matches the macro plan and leaves 1 SP buffer for infra surprises.

### D-3: Secrets Manager Scope

| Model | Position |
|-------|----------|
| **Gemini** | 5 SP — full Vault/DO integration with auto-rotation |
| **Codex** | 5 SP — includes MFA client factory wiring |
| **Claude** | 4 SP — MFA factory is 1 SP of wiring, secrets manager is 3 SP of abstraction |

**Verdict**: **4 SP total** (3 SP secrets abstraction + 1 SP MFA factory). The secrets manager in Phase 2 is an abstraction layer over env vars with rotation support, not a full Vault deployment. Real Vault integration is Sprint 10's "aspirational" scope — the minimum is the abstraction + dual-key rotation pattern already documented in ADD §8.11.

---

## Final Task Allocation (28 SP)

| Task | SP | Source | Owner |
|------|-----|--------|-------|
| INF-01: HA Database + WebAuthn Adapter | 5 | Macro + S9 | Senior |
| INF-02: Per-Domain Connection Pools | 2 | Macro | Web Dev 2 |
| INF-03: Redis Separation + Atomic Session Ops | 4 | Macro + S9 | Senior |
| INF-04: Secrets Manager + MFA Client Factory | 4 | Macro + S9 | Web Dev 1 |
| INF-05: Worker Auto-Scaling Config | 2 | Macro | Web Dev 2 |
| INF-06: Drift Detection CI Pipeline | 2 | Macro | Web Dev 1 |
| INF-07: Auth Route Hardening (S9 wiring) | 2 | S9 residual | Web Dev 1 |
| INF-08: Circuit-Breaker Lifecycle Tests (EP-1) | 2 | Macro | Web Dev 2 |
| INF-09: HA Failover Validation | 3 | Macro | Senior |
| INF-10: Integration Tests + Doc Updates | 2 | Macro + S9 | All |
| **Total** | **28** | | |
