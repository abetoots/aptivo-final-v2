# S18-B3 Multi-Model Review — Budget Threshold Notifications + HITL Escalation

**Task**: S18-B3 (3 SP, Web Dev 2)
**Goal**: Wire `checkBudget` to fire (a) one threshold-warning notification per `(deptId, period)` and (b) one HITL escalation chain per `(deptId, period)` on monthly limit breach — across multi-instance apps/web replicas. Establishes the AD-S18-6 Redis SET-NX-EX dedupe template that S18-C1c (ticket escalation notifications) replicates.
**Date**: 2026-05-07 (Sprint 18 Day 3)
**Reviewers**: Codex MCP (thread `019e0125-dd7c-7f63-84c7-815e0454bda7`) + Gemini PAL clink — both invoked via tool calls in this session
**Plan reference**: `docs/06-sprints/sprint-18-plan.md` §B3 (AD-S18-6)

---

## Executive Summary

Two-round review with parallel Codex + Gemini reviewers. **Round 1**: Codex NO-GO (4 findings: 2 HIGH, 2 MEDIUM); Gemini GO with same trade-offs flagged informationally. **Round 2**: Codex GO with one Low-severity comment cleanup; Gemini GO with positive sign-off on race-window assessment.

The pattern from A2 + S17 holds: Codex catches state-machine + lifecycle defects (slot-burn-on-failure, off-by-one threshold, ignored config flag, misleading message values) that surface review can miss; Gemini provides a cross-check on the redesign and operational implications.

**Final verdict: GO.** B3 ships the dedupe template the rest of S18 (C1c) and Phase 3.5+ notification surfaces will replicate.

---

## Files Reviewed (10)

```
packages/budget/src/budget-dedupe-store.ts            (NEW, AD-S18-6 primitive)
packages/budget/src/budget-notification-service.ts    (NEW, NotificationAdapter wrapper)
packages/budget/src/budget-hitl-escalation.ts         (NEW, HITL chain wrapper)
packages/budget/src/department-budget-service.ts      (MOD, threshold callbacks in checkBudget)
packages/budget/src/index.ts                          (MOD, barrel exports)
packages/budget/package.json                          (MOD, +@aptivo/notifications dep)
packages/budget/tests/budget-dedupe-store.test.ts     (NEW, 14 tests)
packages/budget/tests/budget-notification-service.test.ts (NEW, 7 tests)
packages/budget/tests/budget-hitl-escalation.test.ts  (NEW, 6 tests)
packages/budget/tests/department-budget-service.test.ts (MOD, +6 callback tests = 20 total)
apps/web/src/lib/services.ts                          (MOD, lazy getters + Upstash adapter)
```

---

## Round 1 — Codex NO-GO (4 findings) / Gemini GO (informational concerns matched 2)

### Codex round 1 findings

#### #1 [HIGH] Lossy dedupe — first-crossing failure suppresses entire period

> Transient downstream failures are blackholed for the rest of the period because dedupe is claimed before the side-effect, and the caller never retries. The notification path claims the key before `adapter.send()` and returns an error after failure, but the key remains set. The HITL path does the same before `triggerChain()`. Then `checkBudget()` fire-and-forgets and only logs rejections. **Net effect: one Novu/SMTP/HITL hiccup on the first crossing can suppress all further alerts/escalations until the next month.**

#### #2 [HIGH] `notifyOnWarning` config flag was ignored

> The config exposes it as a first-class flag, but warning callbacks are fired solely on `projected >= warningLimit` with no `notifyOnWarning` guard. As wired, any configured notification service will still send warnings even when the budget config says not to.

#### #3 [MEDIUM] `>=` vs `>` mismatch causes false-positive EXCEEDED on exact-cap

> `onExceeded` fires at `projected >= monthlyLimitUsd`, but the blocking verdict only happens at `projected > monthlyLimitUsd`. That means a request landing exactly at 100% can emit an `EXCEEDED` notification and create a HITL exception path even though no request has been denied yet.

#### #4 [MEDIUM] Pre-request spend reported in messages

> `checkBudget()` passes `spend.totalUsd` into both callbacks; the notification template and escalation summary render that value directly. **A 950 → 1050 crossing will message "spent $950"**, which is misleading.

### Gemini round 1 (GO with same trade-offs flagged informationally)

Gemini flagged the same suppression-on-failure mode but accepted the burn-first design as "correct under thundering-herd" — a classic difference in framing. Codex's NO-GO drove the fix; Gemini's framing on stampede protection drove the chosen mitigation (release-on-failure, not no-claim-before-send).

---

## Round 1 fixes applied

### Fix HIGH #1 — release dedupe slot on side-effect failure

`budget-dedupe-store.ts`:
- Added `del(key): Promise<number>` to `BudgetDedupeRedis` interface.
- Added `releaseSlot(input): Promise<void>` to `BudgetDedupeStore`. Idempotent; release-failure is logged via `budget_dedupe_release_failed` and not propagated (worst-case-degradation = original lossy behavior, but only when Redis is also down).

`budget-notification-service.ts`: missing-adapter case AND adapter send-failure case both call `releaseSlot` after the failed claim — pre-claiming preserves stampede protection during normal operation; releasing on failure preserves retry-ability across the period.

`budget-hitl-escalation.ts`: missing-trigger-callable case AND chain-rejection case both call `releaseSlot` (with the `'escalation'` threshold tag).

Race window: bounded by `adapter_call_latency + del_latency`. Worst case under sustained adapter outage: one suppressed observation per release-window per replica until adapter recovers — orders of magnitude better than the pre-R1 "suppressed for the rest of the month" mode.

### Fix HIGH #2 — honor `notifyOnWarning`

`department-budget-service.ts:215`: `if (projected >= warningLimit && config.notifyOnWarning && deps.onWarningCrossed)`. The `onExceeded` callback is intentionally NOT gated by this flag — exceeded notifications accompany a blocking verdict and should fire for audit + ops alert reasons even when warnings are opted out.

### Fix MEDIUM #3 — `>` strict for exceeded

`department-budget-service.ts:228`: `if (projected > config.monthlyLimitUsd && deps.onExceeded)`. Now matches the blocking verdict at `projected > limit`. Exact-cap requests no longer trigger EXCEEDED side-effects.

### Fix MEDIUM #4 — projected spend in messages

`department-budget-service.ts:217-225`: Both callbacks receive `currentSpendUsd: projected` (post-this-request value). A 950 → 1050 crossing now reads "spent $1050".

### Tests added (4 new)

- `releaseSlot lets a subsequent shouldFire win the same key` — recovery path
- `releaseSlot is idempotent` — double-release safety
- `releaseSlot failure is logged but not propagated` — graceful degradation under Redis outage
- `does NOT fire onWarningCrossed when notifyOnWarning is false`

Plus updated existing failure-path tests in notification + escalation to assert `releaseSlot` was called.

Total: 47/47 passing in `@aptivo/budget` (was 43; +4 R1-coverage).

---

## Round 2 — Codex GO + Gemini GO

### Codex round 2

> No blocking findings in R2. The four R1 issues are addressed correctly. `releaseSlot` closes the month-long suppression hole on adapter/HITL failure. `notifyOnWarning` is now honored. Exceeded side-effects now match the strict `>` verdict. Callback payloads now use projected spend.

One Low-severity comment cleanup: the `apps/web` composition comment claimed "no session Redis degrades to passthrough duplicate notifications" but the code actually returns null and silently disables the side-effect services. Fixed in the same commit.

### Gemini round 2

> Round 2 review confirms all 4 Codex (R1) findings are resolved. Race-window during `releaseSlot` is minimal and acceptable for the domain. Policy alignment (critical exceeded notifications are non-optional) is sound. Tests cover recovery paths and idempotent releases. **GO**.

Gemini's race-window analysis:
- Window duration = `adapter_latency + del_latency` (sub-second under normal operation).
- Crash between claim and release leaves the slot claimed until TTL — same as the original lossy mode but only on the rare process-crash race.
- Significantly better than the original "never retry" behavior.

---

## Key Design Decisions Reaffirmed

### AD-S18-6 dedupe scope = GLOBAL per `(deptId, period, threshold)`

Opposite of ws-server's per-instance scope (web replicas converge; ws-server replicas broadcast). Dept ID is a UUID so cross-tenant collision is impossible. Period is `YYYY-MM` so natural month rollover. Threshold tag separates pipelines.

### Three threshold tags: `'warning' | 'exceeded' | 'escalation'`

Codex flagged this as "directionally right but muddies the domain" — would prefer `effect: 'warning_notification' | 'exceeded_notification' | 'exceeded_escalation'` or `{ pipeline, threshold }`. Accepted as-is for S18; the simpler tag union keeps the dedupe primitive narrow. Refactor to a richer effect type is a Phase 3.5 follow-up, not a blocker.

### Fire-and-forget `checkBudget` callbacks

Verdict latency must not depend on notification adapter or HITL gateway. `void deps.onX(...).catch(...)` swallows + logs callback rejection without affecting the verdict.

### Release-on-failure, not send-then-claim

Considered alternative: send the side-effect first, then claim the dedupe slot. Rejected because every replica would send before any won the dedupe → guaranteed duplicate sends on every crossing. Claim-then-send + release-on-failure is the correct pattern: stampede protection during normal operation; retry-ability across the period under adapter outages.

### `BUDGET_EXCEPTION_APPROVER_USER_ID` env var

Adequate for S18 / phase-3-exit. Per-tenant approver config deferred to Phase 3.5 admin UI per AD-S18 plan. Codex caveat: "treated as a deployment prerequisite and validated before traffic" — the release-on-failure path now means missing env at boot doesn't suppress the month's escalation after config is fixed.

---

## Test Coverage Summary

| Suite | Pre-B3 | Post-R0 | Post-R1 |
|---|---|---|---|
| `tests/budget-dedupe-store.test.ts` | — | 11 | 14 |
| `tests/budget-notification-service.test.ts` | — | 7 | 7 |
| `tests/budget-hitl-escalation.test.ts` | — | 6 | 6 |
| `tests/department-budget-service.test.ts` | 14 | 19 | 20 |
| **Total** | 14 | 43 | 47 |

apps/web: same baseline as main (1 pre-existing s11-hitl2-07 flake, unrelated to B3).

---

## Pattern Reinforcement

Codex round 1 caught 4 distinct categories of bug:
- **Lifecycle correctness** (claim-before-send leaks; release on failure)
- **Config-flag honoring** (`notifyOnWarning` ignored)
- **Off-by-one on threshold** (`>=` vs `>`)
- **Message accuracy** (projected vs pre-request spend)

Three of these (#1, #2, #4) would have been silent in production for the first observation cycle and only surfaced as user complaints post-release. The rigorous "fire on every crossing observation; dedupe inside the callback" model means small flag-handling defects produce widespread effects — exactly the failure shape multi-model review catches better than single-model review.

---

## Final Verdict: GO (both reviewers, two-round sign-off)

B3 ships:
- **GLOBAL per-(deptId, period, threshold) dedupe primitive** with release-on-failure semantics for retry-ability across the period.
- **NotificationAdapter wrapper** that fires once per crossing, releases the slot on adapter unavailability or send failure.
- **HITL escalation wrapper** that triggers the budget-exception chain via injected callable, releases the slot on missing-callable or chain-trigger failure.
- **`checkBudget` extension** with optional fire-and-forget callbacks honoring `notifyOnWarning`, using strict `>` for exceeded, reporting projected (post-request) spend.
- **Composition root wiring** with Upstash REST → BudgetDedupeRedis adapter, lazy getters that null-degrade gracefully when session-Redis isn't configured.
- **Pattern documented for C1c**: ticket escalation notifications follow the same shape (claim-before-send + release-on-failure, GLOBAL scope, threshold-tagged dedupe).

Carry-forward: per-tenant approver config in Phase 3.5; richer effect-type enum (Codex round-1 design comment) deferred to Phase 3.5 refactor.
