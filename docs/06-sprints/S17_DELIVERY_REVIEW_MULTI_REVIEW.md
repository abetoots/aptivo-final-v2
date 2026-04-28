# Sprint 17 Delivery Review — Multi-Model Review

**Date**: 2026-04-28
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dd22c-efb2-7843-887c-200a5fd20ecd`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `0f3e2f61-e7d8-4a36-83a1-2048a9b3657c`).
**Subject**: `docs/06-sprints/sprint-17-delivery-review.md` — sprint-close gate-decision artifact. Originally committed at `60c5b57`; corrections from this review committed in a follow-up.
**Scope**: honesty of GO/NO-GO call, numerical accuracy, spin check, missing carry-forwards, S18 starting-order optimality, cross-document drift.

---

## Executive Summary

Same pattern as the S16 delivery-review audit. **Codex ran a genuine audit and found seven concrete issues, two HIGH** — including a real typecheck error that I introduced during the CT-4 cleanup pass and missed in the per-task review cycle. **Gemini was sent the corrected document cold (no priming on Codex's findings) and independently confirmed the corrections were complete**, including verifying the typecheck fixes via 12 of its own shell commands.

The most consequential finding: I had framed the safety-stack as "READY FOR PRODUCTION FLAG FLIPS" with all 5 enablement gates "CLEARED". That contradicted the per-task B1 review I had committed days earlier, which explicitly says B1 closed only the **contract layer** — the production paths (Inngest workflow → LLM gateway actor stamping) carry to S18. Without that retraction, the Sprint 17 doc-cascade would have invited a premature `anomaly-blocking` flip that, by design, would have matched zero rows in the audit aggregate query and run silently inert.

This is exactly the failure mode that justifies running a multi-model audit on the gate-decision artifact even after every per-task review has signed off. Per-task reviews validate the per-task code; only the delivery review validates the **synthesis claim** about what the sprint as a whole means for production.

---

## Codex Findings (all Lead-verified and applied)

### 🚨 HIGH #1 — Gates #2/#3 framing was overstated (synthesis error)

- Delivery review §6 said Gates #2 + #3 were "✅ CLEARED in S17-B1". Header status said "READY FOR PRODUCTION FLAG FLIPS — all 5 S17-implementation enablement gates from S16 cleared". §10 said "Epic 2 anomaly-blocking flip: GO from engineering".
- [`S17_B1_MULTI_REVIEW.md` lines 15-21](./S17_B1_MULTI_REVIEW.md) explicitly says: *"the implementation closes the **contract layer** ... but does NOT close those gates in production paths"* — `AuditService.emit()` only writes `user_id` for `actor.type='user'`, all current workflow emitters use `actor.type='system'`, and `requireLlmContext` middleware has no consumer (no `/api/llm/complete` HTTP route exists). *"Production closure of Gates #2 and #3 carries forward to S18."*
- **Fix**: §6 reframed to ⚠ "CONTRACT-LAYER CLEARED" with explicit S18 carry-forward note for both gates. §10 reframed to NO-GO on `anomaly-blocking` until S18 actor-propagation observation. Header status reframed to "Epic 4 production-ready; safety-stack contract layer shipped but production flag flips for `ml-injection-classifier` + `anomaly-blocking` remain conditional". Cascade applied to `sprint-16-delivery-review.md §6` and `platform-core-add.md §14.5` to keep all three documents consistent.

### 🚨 HIGH #2 — "Pre-existing typecheck residuals unchanged" was false

- §3 said the only typecheck residuals are the Sprint 9/10/15 ones. Codex ran `pnpm --filter @aptivo/database typecheck` and `pnpm --filter web typecheck` and found two **new S17-introduced** errors:
  - `packages/database/src/adapters/ticket-report-queries.ts:122` — Drizzle `inArray` overload mismatch on `PgEnumColumn`. Introduced when CT-4 cleanup applied Gemini's "use idiomatic `inArray`" suggestion.
  - `apps/web/src/lib/middleware/require-llm-context.ts:25` — `ActorContext` type used but not exported from `@aptivo/llm-gateway` package barrel (`providers/index.ts` and root `index.ts` both missed it).
- Both errors had been latent since their respective commits; my per-task spot-check pattern (`pnpm typecheck | grep <changed-file>`) missed them because the errors compile in a *different* package than the one that owns the changed file.
- **Fix (code)**: reverted the `inArray` to a SQL template (safe — literal status values, no user input); added `ActorContext` to both `providers/index.ts` and root `index.ts` exports.
- **Fix (doc)**: §3 rewritten to honestly enumerate both new errors, document the cause + fix, and capture the lesson — *"Run full-tree typecheck in delivery review going forward"*.

### 🟡 MEDIUM #1 — WS-PUB framed as production-flippable; multi-instance is broken by design

- Delivery review §4 said Epic 3 ws-server is "Production-flippable (`ws-server-enabled` flag)". §10 said "GO from engineering; pending Railway staging verification".
- [`S17_WS_PUB_MULTI_REVIEW.md` line 14](./S17_WS_PUB_MULTI_REVIEW.md) explicitly says: *"**Multi-instance horizontal scaling is broken by design** — list semantics are single-consumer per item. Documented as an S18 task."* — Upstash REST has no persistent SUBSCRIBE; the chosen list+polling substitute provides FIFO over HTTP but cannot be sharded.
- **Fix**: §6 Gate #6 reframed to ⚠ "CLEARED for single-instance deploys" with explicit multi-instance carry-forward. §10 reframed to "GO from engineering, **single-instance only**". Cascade applied to `sprint-16-delivery-review.md §6`.

### 🟡 MEDIUM #2 — Missing carry-forwards from per-task reviews

- §7 Deferred / Carry-Forward did not list:
  - **Workflow → user actor propagation** (consequence of B1's contract-layer-only closure)
  - **`requireLlmContext` middleware adoption** (no production consumer today)
  - **HR PII bulk-read / export audit instrumentation** (anomaly gate's bulk-access detector relies on these emit sites)
  - **ws-server multi-instance scaling** (consequence of WS-PUB single-consumer design)
- **Fix**: added a new §7 subsection "Operational closure of S17 contract layer (must-do before flag flips)" listing all four. Reordered the Epic 5 / cleanup / operations subsections accordingly.

### 🟡 MEDIUM #3 — S18 starting order was suboptimal

- Original Appendix B started with Epic 5 Crypto live-trading. Codex argued this hides the fact that Epic 5's value (observable LLM safety) depends on the S17 contract-layer being operationally closed first.
- **Fix**: reordered. Now starts with workflow→user actor propagation (3 SP) + HR PII audit instrumentation (1 SP) + ws-server multi-instance scaling (3 SP), THEN Epic 5 Crypto + HR + MOD-02 + cleanup. Front-loading the operational closure means Epic 5's LLM steps emit complete actor context from day one.

### 🟡 MEDIUM #4 — Plan-deviation list was incomplete

- §11 listed 4 deviations (B4 console.warn count, CT-2 stub-replacement path, CT-3 sequential-chain, CT-4 reporting location). Missing:
  - **B1 narrowed to contract-layer closure of Gates #2/#3** rather than full production closure
  - **WS-PUB shipped Redis list + polling, not pub/sub** (Upstash REST limitation)
  - **B4 `console.warn` migration scope was production callsites only** — test-fixture warns left as-is
- **Fix**: added all three to §11.

### 🟡 MEDIUM #5 — Per-task `New Tests` column had wrong numbers

- §2 completion table approximated test counts with `~` markers. Codex cross-checked against per-task multi-review docs:
  - CT-1: doc said 25; per-task review says 31
  - CT-2: doc said 21; per-task review says 30
  - B3: doc said `~18`; per-task review doesn't support that count
- **Fix**: replaced approximations with verified counts from each per-task multi-review for CT-* tasks; for B-* and WS-PUB tasks where the per-task review doesn't enumerate test counts cleanly, marked as "(see review)" rather than fabricating a number. Sprint-cumulative end-suite totals (the verified ones) stay in §3.

### 🟢 LOW — Multi-model review count off by one

- Header said "Multi-model reviews: 9". Actually 10 docs total: 9 task reviews + 1 plan review (`S17_PLAN_MULTI_REVIEW.md`).
- **Fix**: corrected to "Multi-model reviews: 10 docs (9 per-task + 1 plan)".

---

## Numerical Accuracy Confirmed (Codex verified)

- 23 SP arithmetic: correct (B1=5, B2=2, B3=2, B4=1, WS-PUB=2, CT-1=3, CT-2=3, CT-3=3, CT-4=2)
- 10 commits: correct
- `git diff --shortstat ecb4792^..d70b6bd`: correct (85 files, +10,232 / -140)
- End-of-sprint test counts in §3 (apps/web 1924 / llm-gateway 189 / ws-server 55 / database 185 / budget 14 / audit 67 / total 2,434): correct against live `pnpm test --run` outputs
- Cross-link anchor IDs (S16 §6, ADD §14.5): correct

---

## Gemini's Review (independent post-correction read)

After applying all of Codex's findings, Gemini was sent the corrected document with no priming on what Codex had flagged — just the audit task. Gemini ran **12 shell commands** during the review to verify the typecheck fixes are in the actual codebase, confirmed:

- §6 gate framing now accurate (per its own read of the per-task reviews)
- §10 release decision conservative-and-correct
- Code fixes verified (`ActorContext` exported from both barrels; `inArray` reverted to SQL template)
- Numerical deltas mathematically consistent (+148 net new tests across packages)
- Reviewer-attribution framing honest ("diplomatically attributes routing issues but the linked B1 review contains an explicit honesty note about fabricated thread IDs in the original draft")

Verdict: **GO**.

This is a notable contrast to S16 where Gemini rubber-stamped an uncorrected delivery review while missing every concrete defect Codex caught. Two factors likely contributed:
1. The S17 prompt explicitly framed the audit task and listed verifiable claims to check
2. Gemini chose to run shell commands (typecheck verification) rather than just textual cross-reading

Reinforces the standing reviewer-calibration pattern: Gemini engages substantively when the prompt is structured for it; surface-rubber-stamps when the framing is open-ended.

---

## Cross-Document Cascade

Codex's HIGH #1 (Gates #2/#3 framing) had downstream impact. The same overstatement appeared in three documents I had just patched:

1. `sprint-17-delivery-review.md` (§6, §10, header) — corrected
2. `sprint-16-delivery-review.md §6` (gate-status table) — corrected to ⚠ "CONTRACT-LAYER CLEARED" matching new framing
3. `platform-core-add.md §14.5` residual-risk callout — corrected to honestly state which items are fully resolved vs contract-layer-only

All three are now consistent.

---

## Code Changes That Landed With This Review

The HIGH #2 finding required actual code fixes, not just doc edits:

- `packages/database/src/adapters/ticket-report-queries.ts` — reverted `inArray(tickets.status, OPEN_STATUSES as unknown as string[])` to `sql\`${tickets.status} in ('open', 'in_progress', 'escalated')\``. The `inArray` form errored because Drizzle's overload doesn't accept `PgEnumColumn` directly; the SQL template form is safe (literal status values, no user input).
- `packages/llm-gateway/src/providers/index.ts` — added `ActorContext` to the type re-exports.
- `packages/llm-gateway/src/index.ts` — added `ActorContext` to the package-root re-exports.

Verified after fix: `pnpm --filter @aptivo/database typecheck` clean (only pre-existing residuals); `pnpm --filter web typecheck` clean for case-tracking + middleware files. Full test sweep still passes (1924 web / 185 db / 189 llm-gateway).

---

## Provenance

- **Codex via MCP thread `019dd22c-efb2-7843-887c-200a5fd20ecd`** (GPT-5, sandbox read-only). Single audit pass: 2 HIGH + 4 MEDIUM + 1 LOW with explicit file:line citations. Attempted to patch the file but was correctly blocked by sandbox; surfaced findings instead. All findings Lead-verified before applying.
- **Gemini via `mcp__pal__clink`** (continuation `0f3e2f61-e7d8-4a36-83a1-2048a9b3657c`, `gemini-3-flash-preview`). Single post-correction read with no priming on Codex's findings. Ran 12 verification shell commands against the actual codebase. GO with detailed confirmation per-area.
- **Lead (Claude Opus 4.7)**: deferred to Codex on every concrete finding; Gemini's confirmation is corroborating. Reinforces the standing `feedback_honest_reviewer_attribution` memory: when the audit is for a **synthesis claim** (gate-clearance summary, release decision), per-task reviews are necessary but not sufficient — the synthesis itself needs an audit pass.
