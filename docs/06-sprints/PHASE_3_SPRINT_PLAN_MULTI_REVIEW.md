# Phase 3 Sprint Planning (S16–S19) — Multi-Model Review

**Date**: 2026-04-20
**Reviewers**: Claude Opus 4.7 (Lead), Codex/GPT (via Codex MCP), Gemini (via PAL clink — `gemini-3-flash-preview`)
**Scope**: Sprint 16-19 planning after UI descope to Phase 3.5
**Trigger**: Commit `83f90e9` descopes UI from Phase 3 → Phase 3.5, reducing remaining backend scope from ~101 SP to ~59 SP across 4 sprints
**Prior art**: [phase-3-roadmap.md](./phase-3-roadmap.md), [PHASE_3_ROADMAP_MULTI_REVIEW.md](./PHASE_3_ROADMAP_MULTI_REVIEW.md), [sprint-15-plan.md](./sprint-15-plan.md)

---

## Executive Summary

Three reviewers independently converge on **compressing Phase 3 to effectively 3 planned sprints (S16-S18) at ~20 SP/sprint** rather than stretching ~59 SP across four sprints at ~15 SP/sprint. Disagreement centres on **what to do with Sprint 19** and **how much Phase 3.5 foundation work to pull forward**. Final verdict follows Codex: keep S19 as an explicit contingency buffer, not as planned scope, and absorb only backend-facing foundation work (OpenAPI hardening, WebSocket spec lock) — do not pre-build design system artefacts without a designer onboarded.

---

## Consensus Findings

All three reviewers agree on:

1. **Compress the planned scope to S16-S18**. ~20 SP/sprint is still materially below Phase 2's sustained 27-30 SP/sprint velocity, so compression is low-risk.
2. **Sprint 16 is the critical gate sprint.** Epic 2 (ML safety v2) and Epic 3 (workflow backend) must both land there because they unblock the downstream work: E2 → E5 (crypto live trading), E3 → E4 (case tracking).
3. **Case tracking (Epic 4, 10 SP) stays together in one sprint.** The four CT tasks share a ticket schema and interleave poorly across sprint boundaries.
4. **Integrations follow MOD-02 contract validation.** Stripe/HubSpot/Asana/Toggl bind to stable interface contracts — shipping them before MOD-02 creates rework.
5. **ML classifier accuracy is the top risk.** If precision/recall misses the >90%/>80% targets, crypto live-trading must ship with rule-based fallback preserved and paper-trade/quorum-only exposure.
6. **OpenAPI contract stability is the critical Phase 3.5 handoff artefact.** Phase 3.5 UI depends on a frozen API surface; contract churn cascades into wasted design work.

---

## Debated Items

### D1. Sprint 19 — Delete or keep as contingency?

| Reviewer | Position |
|---|---|
| Gemini | **Delete.** Compress to 3 sprints, end Phase 3 on 2026-06-01, accelerate Phase 3.5 start. |
| Codex | **Keep as contingency buffer.** Do not pre-fill with tech debt unless it directly blocks production reliability or Phase 3.5. |
| Claude (Lead) | **Agree with Codex.** |

**Verdict**: Keep Sprint 19 as an unplanned contingency buffer. Rationale: the Epic 2 ML classifier, Epic 6 vendor integrations, and Epic 5 crypto live trading each carry calendar-driven risk (model training iteration, vendor sandbox access, safety validation) that converts poorly into story points. Deleting the buffer forces schedule pressure to eat into UI boundary discipline — exactly what the 2026-04-20 descope decision warned against ("do not re-collapse UI into Phase 3 sprint scope under schedule pressure"). If S19 is unused, convert it to designer onboarding runway for Phase 3.5 (the roadmap already calls for designer contracting in Sprint 17) rather than manufacturing work.

### D2. Epic 8 (FA-4 Budgeting, 5 SP) — Sprint 16 or Sprint 17?

| Reviewer | Position |
|---|---|
| Gemini | Sprint 17 (with domain workflows) |
| Codex | Sprint 16 (independent filler, load balances) |
| Claude (Lead) | Sprint 16 |

**Verdict**: Sprint 16. Epic 8 has zero dependencies and reuses the existing LLM budget service. Placing it in S16 balances the sprint load (21 SP) and leaves S17 as a focused domain-delivery sprint (22 SP of case tracking + domain workflows — thematically cohesive, easier to review).

### D3. Partial Epic 4 in Sprint 16?

| Reviewer | Position |
|---|---|
| Gemini | Start CT-1 + CT-2 in S16 alongside E3 |
| Codex | All of E4 in S17 after E3 lands |
| Claude (Lead) | All of E4 in S17 |

**Verdict**: All of Epic 4 in Sprint 17. Although CT-1 (Ticket CRUD API) could technically start before the Epic 3 graph-validation API lands (it reuses the Sprint 13 `workflow-crud` API, not the new validation layer), splitting Epic 4 across two sprints creates unnecessary context switching for a tightly coupled 10-SP epic. Keeping E4 whole also lets the team validate the full CT-1→CT-4 stack against a stable workflow engine in S17.

### D4. Phase 3.5 foundation absorption — which items?

| Item | Gemini | Codex | Claude (Lead) |
|---|---|---|---|
| OpenAPI v1.2.0+ hardening | Absorb (explicit S18 item) | Absorb as acceptance criteria across S16-S18 | Agree with Codex — criterion, not task |
| WebSocket spec review | (implicit in E3) | Absorb in S16 alongside server | Agree with Codex |
| Design system token prep | Absorb (4 SP in S18) | Do not absorb — spend on API contracts instead | Agree with Codex |
| Designer contracting | Not addressed | Mentioned as S17 milestone per roadmap | Start contracting in S17 regardless |

**Verdict**: Follow Codex. Treat OpenAPI hardening and WebSocket spec lock as cross-sprint acceptance criteria (definition-of-done items), not discrete tasks. Reject design system token prep — designing tokens without an active designer is speculative work that will likely be rewritten once F-1 (designer) lands in Phase 3.5. Designer contracting should begin in S17 per existing roadmap, but that is a procurement activity, not engineering capacity.

---

## Final Verdict: Sprint 16-19 Plan

| Sprint | Dates (est.) | SP | Theme | Tasks |
|---|---|---|---|---|
| S15 ✅ | 2026-03-04 → 2026-03-18 | 26 delivered | Production gate + safety MVP | Epic 1 + streaming filter (already shipped) |
| **S16** | 2026-04-22 → 2026-05-06 | **21** | **Safety + Protocol + Budgeting** | E2: ML classifier (5), active anomaly blocking (2), eval harness (3) — 10 SP · E3: graph validation API (3), WebSocket server + protocol lock (3) — 6 SP · E8: FA-4 department budgeting (5) — 5 SP |
| **S17** | 2026-05-06 → 2026-05-20 | **22** | **Case tracking + Domain delivery** | E4: CT-1 Ticket CRUD API (3), CT-2 SLA engine (2), CT-3 escalation (3), CT-4 reporting queries (2) — 10 SP · E5: MOD-02 contract validation (3), HR onboarding (4), crypto live-trading (5) — 12 SP |
| **S18** | 2026-05-20 → 2026-06-03 | **16** | **Integrations + Compliance close** | E6: Stripe (3), HubSpot (5), Asana (2), Toggl (1) — 11 SP · E7: consent API hardening (1), Push/FCM backend (2), SMS backend (2) — 5 SP |
| **S19** | 2026-06-03 → 2026-06-17 | **0 planned** | **Contingency / Phase 3.5 runway** | Buffer for S16-S18 slippage. If unused → designer onboarding, UX discovery kickoff (Phase 3.5 F-1/F-2), OpenAPI v1.2.0+ final publication, event schema finalisation |

**Total planned**: 59 SP across S16-S18 · **Buffer**: ~15-25 SP capacity in S19 if needed.

### Sequencing rationale

- **S16** front-loads the two gate epics (E2, E3) in parallel so S17 has an unblocked runway. E8 fills the remaining capacity as an independent, low-risk win that exercises the LLM budget service in a new domain.
- **S17** executes domain workflows and case tracking with gates cleared. MOD-02 contract validation lands here (not S18) so vendor integrations in S18 bind to a stable contract surface.
- **S18** is intentionally light (16 SP) to absorb any vendor-sandbox calendar slippage from S16-S17 procurement. The 4 SP of float can be used for OpenAPI finalisation and WebSocket spec publication.
- **S19** is explicit contingency. No planned scope. If S16-S18 deliver on time, use S19 for Phase 3.5 pre-work (designer onboarding, UX discovery) per existing roadmap.

### Cross-sprint acceptance criteria (definition of done for Phase 3 exit)

Apply to every sprint's definition of done, not as separate tasks:

- [ ] OpenAPI v1.2.0+ published with all S16-S18 endpoints documented (required arrays, Sunset headers, error schemas)
- [ ] WebSocket protocol spec locked by end of S16 (connection lifecycle, auth, event schemas, reconnect, error codes)
- [ ] Event schemas for real-time UI subscriptions published to `packages/types`
- [ ] Integration test coverage ≥ 80% on new code per sprint
- [ ] No regressions in Phase 2 or Sprint 15 test suites

---

## Risk Register (Phase 3 remaining)

| # | Risk | Likelihood | Impact | Mitigation | Owner sprint |
|---|---|---|---|---|---|
| 1 | ML injection classifier fails >90% precision / >80% recall target | Medium | High | Preserve rule-based fallback from S15; crypto live-trading ships paper-trade + quorum only if classifier misses target; eval harness runs in parallel with manual verification for first 100 crypto trades | S16 |
| 2 | Vendor sandbox procurement delay (Stripe, HubSpot, Asana, Toggl) | Medium | Medium | Start procurement S16 day 0 (Senior Dev); implement against interface mocks if sandbox access slips; S18 float absorbs up to 5 SP of replay work | S16→S18 |
| 3 | OpenAPI contract churn cascades into Phase 3.5 UI rework | Medium | High | Treat OpenAPI stability as cross-sprint DoD; freeze v1.2.0+ contract by end of S18; any v1.3 changes require Phase 3.5 UI impact assessment | S16-S18 |
| 4 | Crypto live-trading operational risk (real money) | Low | High | Kill-switch + HITL quorum enforced; paper-trade validation precedes live enablement; MFA step-up required per transaction | S17 |
| 5 | WebSocket protocol underspecified for Phase 3.5 UI-F (cursors, live status) | Medium | Medium | Spec review in S16 includes Phase 3.5 UI surface requirements from phase-3.5-ui-roadmap.md UI-F; reconnect + back-pressure documented before server ships | S16 |
| 6 | S19 contingency gets quietly consumed by scope creep | Medium | Medium | Treat S19 as contingency-only — no new backend scope added without explicit Phase 3 exit review; UI work stays out of Phase 3 per 2026-04-20 decision | S19 |

---

## Actionable Recommendations (to user)

1. **Adopt the S16-S18 plan above**; formally reserve S19 as contingency. Update `phase-3-roadmap.md` §3 Sprint Overview to reflect 3 planned sprints + 1 buffer instead of 4 equally-loaded sprints.
2. **Begin vendor procurement on S16 Day 0**, not S18 Day 0. Stripe/HubSpot/Asana/Toggl sandbox access is calendar-driven. The Senior Dev should open these tickets alongside starting ML classifier work.
3. **Write `docs/06-sprints/sprint-16-plan.md`** using the Sprint 15 plan as the template. Micro-tasks for Epic 2 (ML classifier + eval harness) will dominate — invest time here on TDD structure since classifier accuracy is the #1 risk.
4. **Treat OpenAPI v1.2.0+ as a cross-sprint artefact**, not a dedicated task. Add "OpenAPI spec updated" as a DoD item in every S16-S18 task acceptance criteria.
5. **Do not absorb design system token work** into Phase 3 even though capacity exists. Start designer contracting in S17 per existing roadmap; tokens land in Phase 3.5 Sprint 20 with F-1 active.
6. **Lock WebSocket protocol spec by end of S16.** Review against `phase-3.5-ui-roadmap.md` UI-F requirements (cursors, live status, collaboration) so the protocol is fit for downstream consumers before the server implementation solidifies.
7. **Publish a named Phase 3 exit review at end of S18** (analogous to `phase-2-delivery-review.md`) that declares API-complete state, documents OpenAPI frozen version, and formally hands artefacts to Phase 3.5.

---

## Provenance

- **Claude (Lead)**: Independent analysis of roadmap + S15 plan + descope commit
- **Codex**: Full brief via `mcp__codex__codex` — see conversation `019daabf-0148-7d83-aaf8-1718637936c9`
- **Gemini**: Full brief via `mcp__pal__clink` role=planner (ran on `gemini-3-flash-preview` — Gemini 3 Pro preview was not reached via clink routing)

Note on Gemini model: the PAL clink routing used `gemini-3-flash-preview` rather than `gemini-3-pro-preview` for the substantive response. Flash tier answers were still structurally aligned with Codex's analysis, but the lead reviewer weighted Codex's response more heavily on Debate D1 and D4 given the tier difference.
