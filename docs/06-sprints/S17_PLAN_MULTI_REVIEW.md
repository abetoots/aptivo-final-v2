# Sprint 17 Plan — Multi-Model Review

**Date**: 2026-04-22
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019db3fe-d9c4-7dc1-be86-676db00ed1e8`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `a2b5f297-2ea3-462e-9666-89facd6715d4`).
**Subject**: `docs/06-sprints/sprint-17-plan.md` — the Sprint 17 design artifact. Produced in plan mode and approved after two rounds of multi-model review.
**Scope**: scope tension (Epic 5 inclusion), task list + estimation, starting order, merged-stream sizing, owner allocation, enablement-gate verification, DoD carry-overs.

---

## Executive Summary

Two rounds of review.

**Round 1** tackled the *scope tension* — the Phase-3 roadmap said S17 = Epic 4 only (~10 SP), the S16 plan §9 preview said S17 = Case Tracking + Domain Workflows + residuals (~24-26 SP), and the S16 delivery review's Appendix B (Codex's prior writing) said blockers-first with Epic 5 only if capacity allowed. Codex (GPT-5) argued for 21 SP gate-first with **NO Epic 5**; Gemini argued for 31 SP with **Crypto live-trading included**. Lead cast tie-breaker: middle shape (~24 SP) — Codex's gate composition plus the WS Redis publisher (Gemini's pull), Epic 5 entirely deferred to S18.

**Round 2** was a sign-off review of the *written plan*. Both models returned CONDITIONAL on first read, with nine concrete findings (four from Codex, three from Gemini, two shared). All nine were either applied or explicitly accepted as documented risk. Second pass from both models: unconditional **GO**.

Final shape: **23 SP across 9 tasks**, Senior 8 SP / Web Dev 1 8 SP / Web Dev 2 7 SP, all 5 S17-implementation enablement gates (#2-#6) in delivery-review §6 scoped to clear. Gate #1 (Replicate procurement) remains a calendar/finance item outside S17 implementation scope.

---

## Round 1 — Scope Tension

### Codex (GPT-5) — committed to 21 SP, NO-GO on Epic 5

Citing `docs/06-sprints/sprint-16-delivery-review.md:64-65,80-100,188-197` and `docs/06-sprints/SPRINT_16_WRAP_MULTI_REVIEW.md:66-89`:

> The defensible S17 commit is Epic 2/8 enablement gates explicitly called "must ship" for S17, plus Epic 4 Case Tracking. The docs already say Epic 2 is only "API-complete," not operationally closed; production still requires gates 2-5, with ~8-10 SP of blocker work before flags can be enabled, and Appendix B places those blockers ahead of case tracking and Epic 5 for exactly that reason.

Core arithmetic: blocker trio + baseline + flag wiring + alerting is 8-10 SP; case tracking is 10 SP; Epic 5 is 12 SP; **total would be 30-32 SP before FA3-02, outside honest envelope**. Codex also re-estimated CT-2 from 2 SP → 3 SP after auditing `apps/web/src/lib/observability/approval-sla-service.ts:49-57,75-154` and finding the existing approval-SLA service is a stub returning `[]`.

### Gemini — committed to 31 SP, GO-partial on Epic 5

Citing a "partial Epic 5" pattern — Crypto live-trading (5 SP) in, HR onboarding + MOD-02 deferred:

> Epic 5 depends on Epic 2 being production-enabled. Crypto is the highest-value domain and the primary reason we built the ML safety pipeline. Delivering it in S17 validates the blocker-clearing work.

Gemini also pulled in WS Redis publisher (2 SP) and a tech-debt bundle (3 SP including safe-logger migration + UsageRecord consolidation). Merged-stream sizing matched Codex at 6 SP.

### Lead resolution — middle shape, 23 SP

| Item | Codex | Gemini | Lead |
|---|---|---|---|
| Epic 5 Crypto in S17 | NO | GO-partial | **NO** — gates need observation, not same-sprint consume |
| WS Redis publisher in S17 | Defer | Include | **Include** — 2 SP, Phase 3.5 UI-F depends on it, Gate #6 clearance |
| CT-2 sizing | 3 SP (stub audit) | 2 SP | **3 SP** per Codex |
| Tech debt bundle (UsageRecord consolidation) | Defer | Include (3 SP) | **Defer** — not gate-critical, keeps sprint honest at 23 SP |

The user (Lead) cast the Epic 5 tie-break explicitly via AskUserQuestion, confirming the conservative option: "**Middle (~24 SP)** — clears all 6 gates, Epic 5 → S18."

Rationale for the resolution:
- Flipping Epic 2 safety flags on Monday and exercising them via Crypto on Friday is not defensible — gates need staging observation time before a real domain consumes them.
- WS publisher is a discrete 2-SP task with a frozen contract (`packages/types/src/websocket-events.ts`), so including it costs little and unblocks Phase 3.5 designer engagement against a real ws-server, not an "isolated island".
- CT-2 at 2 SP was a paper estimate; Codex's stub audit exposed real plumbing work.
- Tech-debt consolidation is not a gate — S18 picks it up cleanly.

---

## Round 2 — Finished-Plan Sign-Off

Both models were asked to stress-test the written plan as a *delivery artifact* (not re-litigate scope). Both returned CONDITIONAL on first read with concrete findings. All resolutions are cited against the final plan at `docs/06-sprints/sprint-17-plan.md`.

### Findings and resolutions

| Finding | Source | Resolution |
|---|---|---|
| **Gate numbering swapped** — B1 said "Gate #2 actor, #3 dept," but delivery-review §6 defines #2 = aggregate-key alignment, #3 = request→actor plumbing | Codex | Fixed: B1 "Unlocks: Gate #2 + Gate #3" with citation to `sprint-16-delivery-review.md §6` |
| **Stale `coverageLevel: 'partial'` AC** — S16 shipped binary `'none' \| 'full'` (per `packages/budget/src/types.ts:47`) but the plan reintroduced `'partial'`; would create review churn | Codex | Fixed: AC now `'none' → 'full'` with code citation |
| **Test path off-convention** — `apps/web/src/lib/feature-flags/tests/peek.test.ts`; repo places tests under `apps/web/tests/` | Codex | Fixed: `apps/web/tests/feature-flags/peek.test.ts` |
| **Missing package barrel exports** — new schema + adapter files wouldn't be importable without updates to `packages/database/src/schema/index.ts` + `packages/database/src/adapters/index.ts` | Codex | Added to both B1 and CT-1 file lists |
| **Missing Inngest event schema file** — DoD called for event schemas in `packages/types` but no concrete file listed | Codex | Added: `packages/types/src/events/ticket.ts` (ticket lifecycle events) |
| **`UsageRecord` interface coherence risk** — B1 threads `departmentId` through the gateway+adapter without requiring field-level agreement; runtime drift risk | Gemini | Added to B1 AC: field-level coherence required in S17; full consolidation remains S18 |
| **B3 sequencing vs B1 key alignment** — B3 impl runs without B1, but baseline numbers are only meaningful post-B1 alignment | Gemini | Added sequencing note to B3: WD2 builds Days 1-3; one follow-up commit switches to aligned keys post-B1 merge |
| **Safe-logger split creates broken-window drift** — deferring 3 legacy `console.warn` sites while requiring DI for new code leaves the package half-migrated | Gemini | Absorbed into S17-B4 (no SP bump — 3 sites: `rate-limit/redis-rate-limit-store.ts`, `gateway/llm-gateway.ts`, `cost/pricing.ts`; ~30 min additive edits) |
| **Gate #1 Replicate procurement omitted from audit** — plan claimed "all 6 gates cleared" but verification §1 listed only 5 checks | Codex | Fixed: Gate #1 explicitly called out as calendar/finance item; all 6 gates listed with explicit check criteria; "all 6" phrasing tightened to "all 5 S17-implementation gates + Gate #1 calendar-reported" |

### Fact-checks Lead verified before applying

- **Gate numbering**: `sed -n '80,105p' docs/06-sprints/sprint-16-delivery-review.md` — confirmed Codex's reading. Gate #2 = aggregate-key, Gate #3 = request→actor.
- **`coverageLevel` shape**: `rg 'coverageLevel' packages/budget/` — confirmed `'none' | 'full'` binary at `packages/budget/src/types.ts:47`. Pre-commit comment explicitly drops `'partial'`.
- **Test convention**: `fd -t d tests apps/web` — `apps/web/tests` exists; no `tests/` directories under `apps/web/src`. Codex right.
- **`console.warn` site count**: `rg -l 'console\.warn' packages/llm-gateway/src` — 3 files, not 7 (Gemini was high on this count but the broken-window argument stands). Absorbing 3 sites comfortably fits in B4's 1 SP.

### Round-2, pass 2 — both models signed off after edits

Codex: *"GO. The prior blockers are resolved in the written artifact... Nothing in the revised plan is still blocking sign-off."* (verbatim, 119 words)

Gemini: *"The plan is now structurally sound and operationally honest... GO. Sprint 17 is ready for execution."* (verbatim, 89 words)

---

## Debated Items — Lead's Casting Votes Explained

### Debated: B1 sizing (5 SP vs 6 SP)

Both models landed at 6 SP after auditing `apps/web/src/lib/services.ts` and the gateway pipeline. Lead kept the commit at **5 SP with a documented 6 SP ceiling**. Rationale: the total sprint is 23 SP in a 27-30 velocity band; if B1 lands at 6 SP, the remaining 22 SP of work absorbs the overage comfortably, and treating 5 SP as the estimate preserves the "stretch into 6" risk signal for daily standups. If B1 had been the only headroom lever, the 6 SP commit would have won.

### Debated: Tech-debt bundle inclusion

Gemini wanted the UsageRecord consolidation (~1 SP in the observability package refactor bundle) in S17 for the same broken-window argument that won on safe-logger. Lead disagreed — the consolidation is a cross-package interface move that touches gateway + adapter + types, and has zero gate-clearing value. Deferred to S18 where it pairs with other refactors in scope there.

### Debated: Epic 5 Crypto inclusion

Gemini's argument ("Crypto validates the safety gates") is rhetorically valid but operationally risky — the Epic 2 flags would be *freshly flipped* in S17 and `ml_classifier_timeout` alert thresholds aren't yet field-tuned. S18 with one sprint of staging observation is the defensible sequence. Both the user (AskUserQuestion selection) and Codex's arithmetic agreed with this call.

---

## Consensus Findings (unchanged through both rounds)

- Merged actor/dept/key stream is 5-6 SP, not 3-4 (both models audited code and agreed)
- Senior owns the safety enablement stream end-to-end; splitting across owners triples review cost
- Epic 4 track (CT-1 → CT-2 → CT-4) is strictly sequential within WD1; CT-3 on WD2 is independent
- Appendix B blocker-first starting order is directionally correct
- DoD carry-overs apply (OpenAPI v1.2.x, Drizzle, RFC 7807, audit events, admin rate-limit, 80% coverage)
- WS-PUB's frozen-contract premise makes 2 SP defensible (`packages/types/src/websocket-events.ts` was ratified v1.0 in S16)

---

## Actionable Recommendations — Applied Before Execution

All Round-2 findings now reflected in `docs/06-sprints/sprint-17-plan.md`:

1. ✅ Gate numbering aligned with delivery-review §6 (#2 = aggregate-key, #3 = actor plumbing)
2. ✅ `coverageLevel` AC fixed to binary `'none' → 'full'`
3. ✅ Test path corrected to `apps/web/tests/feature-flags/peek.test.ts`
4. ✅ Barrel exports added to B1 and CT-1 file lists
5. ✅ `packages/types/src/events/ticket.ts` listed in CT-1
6. ✅ `UsageRecord` field coherence added to B1 AC (full consolidation stays S18)
7. ✅ B3 sequencing note added (impl-independent, numbers post-B1)
8. ✅ Legacy `console.warn` migration absorbed into S17-B4 (no SP bump, 3 sites)
9. ✅ Gate #1 explicitly scoped as calendar item; verification §1 covers all 6 gates; "all 6 cleared" phrasing tightened to "all 5 S17-implementation gates + Gate #1 calendar-reported"

---

## Provenance

- **Codex via MCP thread `019db3fe-d9c4-7dc1-be86-676db00ed1e8`** (GPT-5, sandbox read-only, approval-policy never, cwd `/home/anon/aptivo-final-v2`). Delivered ~1,100-word scope analysis with file:line citations and counter-arguments against the S16 plan §9 preview. Round 2 delivered concrete fixes with file-line references to the plan itself.
- **Gemini via `mcp__pal__clink`** (`gemini-3-flash-preview`, continuation `a2b5f297-2ea3-462e-9666-89facd6715d4`). Delivered ~900-word Round 1 opinion + conditional sign-off on Round 2. Gemini routed through `utility_router` for auxiliary calls and `main` for the primary planning role. One `read_file` workspace-boundary error on the plan file path (file lived outside `/home/anon/aptivo-final-v2`), resolved by passing the absolute path explicitly via `absolute_file_paths`.
- **Lead (Claude Opus 4.7)**: direct verification of gate numbering (`sed` against delivery-review §6), `coverageLevel` shape (grep of `packages/budget/`), test-convention (fd search), console.warn site count (`rg` of llm-gateway src). Final plan written to `/home/anon/.claude/plans/resilient-baking-shamir.md` in plan mode, approved via ExitPlanMode, committed to `docs/06-sprints/sprint-17-plan.md` alongside this synthesis.
- **User (caymo.abesuni@gmail.com)**: cast tie-breaker on Epic 5 scope via AskUserQuestion ("Middle ~24 SP"). Explicitly requested this second-round multi-model sign-off before plan approval — that workflow preference is now saved to persistent memory as a feedback rule.
