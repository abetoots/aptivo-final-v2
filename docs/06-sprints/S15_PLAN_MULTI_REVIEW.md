# Sprint 15 Plan — Multi-Model Review

**Date**: 2026-03-17
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: Sprint 15 planning (Phase 3 Sprint 1: Production Readiness + LLM Safety v2 Start)
**Verdict**: 10 tasks, 25 SP. Epic 1 (22 SP) + streaming content filter from Epic 2 (3 SP).

---

## Consensus

Both models agree: Sprint 15 is infrastructure/operational, not heavy code. The ML injection classifier (5 SP) defers to Sprint 16 — it needs stable production baseline first. Streaming content filter (3 SP) fills remaining capacity and closes an immediate safety gap.

## Final Task Allocation (25 SP)

| Task | SP | Type | Owner |
|------|-----|------|-------|
| PR-01: Supabase Pro OIDC SSO + MFA Config | 4 | Config + Deploy | Senior |
| PR-02: Remove MFA Stub in Production | 2 | Code | Web Dev 1 |
| PR-03: HA Database + Real Failover Test | 5 | Config + Deploy | Senior |
| PR-04: Real Pool Config Enforcement | 2 | Code | Web Dev 2 |
| PR-05: Split Redis Instances | 3 | Config + Code | Web Dev 2 |
| PR-06: SMTP Notification Failback Activation | 2 | Config + Deploy | Web Dev 1 |
| PR-07: Feature Flag Rollout Controls | 2 | Code + Config | Web Dev 1 |
| PR-08: Production E2E Validation | 2 | Testing + Deploy | Senior |
| PR-09: Game-Day Runbook Drills | 1 | Docs + Ops | All |
| LLM3-01: Streaming Content Filter MVP | 3 | Code | Web Dev 2 |
| **Total** | **25** | | |
