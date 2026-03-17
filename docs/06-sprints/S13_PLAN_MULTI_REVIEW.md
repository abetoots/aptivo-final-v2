# Sprint 13 Plan — Multi-Model Review

**Date**: 2026-03-17
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: Sprint 13 planning (Phase 2 Sprint 5: Notifications + Platform Features)
**Verdict**: 11 tasks, 29 SP. Absorb 2 deferred items (OBS-05, per-approver webhooks). Defer 5 items.

---

## Executive Summary

Both models agree on the core structure: notification expansion (SMTP fallback, monitoring, priority routing) first, then platform features (workflow CRUD, webhooks, feature flags, consent UI). Two Sprint 12 deferred items absorbed: OBS-05 (anomaly detection, 3 SP — needs OBS-04 PII trail data) and per-approver webhook notifications (2 SP — needs FEAT-02 webhook action points). FEAT-05 (WebSocket docs) deferred to Sprint 14 as lowest value. FEAT-03 resized from 5→4 SP and FEAT-04 from 3→2 SP to fit budget.

---

## Final Task Allocation (29 SP)

| Task | SP | Source | Owner |
|------|-----|--------|-------|
| NOTIF2-01: SMTP Fallback | 3 | Macro | Web Dev 1 |
| NOTIF2-02: Novu Silent-Drop Monitoring | 2 | Macro | Web Dev 1 |
| NOTIF2-03: Priority Routing + Quiet Hours | 3 | Macro | Web Dev 2 |
| FEAT-01: Workflow Definition CRUD API | 5 | Macro | Senior |
| FEAT-02: Extensible Webhook Action Points | 3 | Macro | Senior |
| FEAT-03: Runtime Feature Flag Service | 4 | Macro (resized) | Web Dev 2 |
| FEAT-04: Consent Withdrawal UI (MVP) | 2 | Macro (resized) | Web Dev 1 |
| NOTIF2-04: Per-Approver Webhook Notifications | 2 | S12 deferred | Web Dev 2 |
| OBS-05: Anomaly Detection (RR-6) | 3 | S12 deferred | Senior |
| FEAT-06: Integration Tests | 2 | Macro | All |
| **Total** | **29** | | |

### Deferred

| Item | Reason | Target |
|------|--------|--------|
| FEAT-05: WebSocket Lifecycle Docs (RC-1, RC-2) | Lowest value doc task | Sprint 14 |
| Approval SLA Metrics | Needs per-approver timing model | Sprint 14 |
| LLM Streaming Content Filter | Needs streaming pipeline hooks | Sprint 14 |
| Crypto Live-Trading Workflow | Needs stronger safety + notification | Sprint 14 |
| HR Onboarding Workflow | Needs SLA metrics + notification | Sprint 14 |
| ML Injection Classifier | Needs model hosting infra | Phase 3 |
