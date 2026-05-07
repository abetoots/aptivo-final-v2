# Sprint 18 B1 — Multi-Model Review

**Date**: 2026-05-07
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dfd35-07f5-7ca0-be3f-c3881802469b`), Gemini via PAL clink (`gemini-3-flash-preview`).
**Subject**: Sprint 18 B1 implementation batch — Crypto live-trading workflow (FR-CRYPTO-TRD-001..004 + FR-CRYPTO-RISK-001..003).
**Outcome**: Three rounds. Both reviewers NO-GO at round 1 with substantial overlap. Round 2 — Codex GO-conditional after a critical ordering fix; Gemini NO-GO with a NEW HIGH (signal_id uniqueness). Round 3 — **GO from both** after the unique-index fix.

---

## Executive Summary

Sprint 18 B1 ships Epic 5 Crypto live-trading: a HITL-gated workflow that takes a `crypto/live-trade.requested` event through LLM analyze → risk-check → daily-loss circuit breaker → HITL single-approver → exchange MCP execute → position record, plus a position-monitor cron that polls every minute and closes on SL/TP cross. Per AD-S18-4, real venue MCP impls (Binance, Coinbase) are S20+ work; B1 lands the contract + in-memory impl that operates the workflow loop end-to-end for tests + local dev. Production `CRYPTO_LIVE_TRADE_ENABLED` flag flip waits for venue impls.

**The reviews mattered.** Round 1 caught two critical financial-correctness bugs that would have shipped:

1. **Short PnL formula was inverse-contract math** — `size * (entry/exit - 1)` over-reports gains and under-reports losses non-linearly for USD-denominated positions. Worked example: short $1000 @ entry=3000 → exit=1500 (50% drop) reported $1000 profit (wrong) vs the correct linear $500. Both reviewers flagged this critical; Gemini's framing distinguishing inverse (coin-margined) vs linear (USD) contract math was the clearest articulation of why the formula was wrong.

2. **Stop-loss exits were sent as limit orders at the trigger price** — a long-position SL would become a sell-LIMIT above the current market on a gap-down, sitting unfilled while the losing position remained open. Codex caught this; the in-memory impl masked it by always filling supplied limit prices.

Plus a third financial-correctness bug surfaced in round 2:

3. **Missing unique constraint on `signal_id`** — workflow re-run dedupes the venue entry fill via `clientOrderId='live-${signalId}'` but the position store creates a SECOND row with a fresh UUID. The cron then generates DIFFERENT exit `clientOrderId`s (because `positionId` differs), and the venue sees two distinct exit orders → DOUBLE-SELL. Gemini caught this in round 2.

Plus an audit-accountability hole both reviewers caught:

4. **Approver fallback `approverId ?? requestedBy`** attributed live trades to people who didn't approve them. Round 1 fixed this by removing the fallback. Round 2 (Codex) caught that the new check ran AFTER `execute-live`, so a malformed approval still produced a venue fill followed by an orphan-reconcile audit. Round 3 fixed by moving the check BEFORE execute-live.

---

## Round 1 Findings

### Codex — NO-GO (7 findings)

#### 🚨 HIGH #1 — SL exits as limit orders at trigger price (financial-harm)

> Every exit is sent as `executeOrder(..., limitPrice: decision.fillPrice)` regardless of whether the exit is an SL or TP. For a long SL that becomes a sell limit above the market after a gap-down; for a short SL it becomes a buy limit below the market after a gap-up. Both can sit unfilled while the losing position remains open.

**Fix applied (round 1)**: Cron drops `limitPrice` from exit-order calls — market-order semantics. The actual venue fill price populates `exitPrice` and feeds `computePnl`. Real venue impls supporting server-side stop-market primitives can extend the contract; left open for that future.

#### 🚨 HIGH #2 — Idempotency gap around venue execution (financial-harm)

> Entry execution happens before the position row is written. Exit execution happens before `positionStore.close()`. `clientOrderId` is present, but the contract does not require dedupe behavior, the in-memory impl ignores it, and the schema has no uniqueness on `signalId` or persisted venue order id to reconcile duplicates.

**Fix applied (round 1)**: `ExecuteOrderInput.clientOrderId` JSDoc now documents the contractual requirement — real venue impls MUST dedupe. In-memory impl honours via `filledByClientId` map. Two tests cover positive (replay returns original fill) and negative (different keys produce different orders).

#### 🚨 CRITICAL #3 — Short PnL formula inverse-contract (financial-correctness)

> The implementation uses `size * (entry/exit - 1)` for shorts. For a USD-denominated position sized at entry, the consistent formula is `size * (1 - exit/entry)`. Tests currently lock in the wrong math.

**Same finding from Gemini at CRITICAL severity** with cleaner framing — inverse-contract (coin-margined) vs linear (USD) math.

**Fix applied (round 1)**: Corrected formula in `computePnl`. Test fixtures updated: short 3000→2950 = 16.67 (was 16.95); short 3000→3100 = -33.33 (was -32.26). Added worked-example test asserting the $500 linear vs $1000 inverse divergence on a 50% drop.

#### 🟡 MEDIUM #4 — Malformed SL/TP not validated

> "Simultaneous cross" only really occurs when the thresholds are malformed (`sl >= tp` for long, `sl <= tp` for short). Neither the workflow nor the schema validates those invariants before storing a live position.

**Same finding from Gemini at MEDIUM severity** with a sharper framing — fat-finger swap of slPrice/tpPrice could pass through to a distracted HITL approver.

**Fix applied (round 1)**: Workflow validates `slNum < tpNum` (long) or `tpNum < slNum` (short) before any LLM cost. Three new tests.

**Fix expanded (round 2 Gemini LOW)**: Added positivity (`> 0`) and finiteness checks for slPrice, tpPrice, and sizeUsd. Two more tests cover negative-price and zero-size branches.

#### 🚨 HIGH #5 — Production wiring placeholder safety

> The breaker is bound with `getThresholdUsd: async () => null` (always allow). The exchange binding is the in-memory adapter with empty seeds. That prevents accidental real fills today, but it is still a dangerous production default: once a real adapter is swapped in, forgetting the threshold config silently disables FR-CRYPTO-RISK-002.

**Fix applied (round 1)**: `isLiveTradeEnabled()` env-var (`CRYPTO_LIVE_TRADE_ENABLED`) gate. Both lazy getters throw at first use when the flag is set AND placeholders are still bound. Surfaces misconfiguration loudly.

#### 🟡 MEDIUM #6 — Index/query mismatch

> The store filters by `closedAt >= since`, but the schema index is on `(departmentId, openedAt)`. Performance bug, not correctness — under load it increases the chance of slow breaker checks and fail-closed blocks.

**Fix applied (round 1)**: Changed index to `(departmentId, closedAt)` to match the breaker's filter.

#### 🚨 HIGH #7 — Approver fallback (audit-accountability)

> The fallback `decisionData.approverId ?? requestedBy` is not honest for post-HITL attribution. That should fail closed or emit as `system` plus an error.

**Same finding from Gemini at HIGH severity**.

**Fix applied (round 1)**: Removed fallback. Missing `approverId` post-HITL → emit `execution-orphaned` audit (with `clientOrderId` for ops reconciliation) → exit `execution-failed`.

**Fix corrected (round 2 Codex)**: The round-1 fix ran AFTER `execute-live`, so a venue fill still happened followed by an orphan-reconcile audit. Codex caught this in round 2 — moved the check BEFORE execute-live so a malformed HITL payload never reaches the venue.

### Gemini — NO-GO (4 findings)

Gemini caught:
- **CRITICAL** — short PnL formula (overlap with Codex #3, with the inverse-vs-linear contract framing that was the clearest articulation of WHY the formula was wrong)
- **HIGH** — approver fallback (overlap with Codex #7, framed as "accountability for real capital execution must be absolute")
- **MEDIUM** — SL/TP band validation (overlap with Codex #4)
- **LOW** — fees missing from PnL (deferred to S20+; needs venue-specific fee rates)

Gemini missed Codex's HIGH #1 (SL-as-limit-order semantic bug), HIGH #2 (idempotency gap), HIGH #5 (production wiring guard), and MEDIUM #6 (index/query mismatch). Gemini's strength on this review was the clarity of the linear-vs-inverse framing for the PnL bug.

---

## Round 2 — Codex GO-conditional, Gemini NEW HIGH

After applying all round-1 fixes (commit `9e7135b`):

### Codex round-2 finding (HIGH — ordering bug in the round-1 fix)

> The new missing-`approverId` path still allows a real venue fill and then leaves the position unrecorded and unmonitored. The workflow does the `approverId` check only after `execute-live` succeeds. That means the system can hold an actual live position with no row for the cron to monitor and no executed state for operators to discover normally.

**Fix applied (round 2, commit `27a2374`)**: Moved the `approverId` check immediately after `waitForEvent` and BEFORE `execute-live`. Returns `{ status: 'rejected', reason: 'malformed approval payload (missing approverId)' }` with a `crypto.trade.live-malformed-approval` audit attributed to system. Test rewritten to assert: NO venue call, NO position record, NO signal flip.

Codex round-2 verdict after fix: **GO-conditional** (live-trade flag stays off until real venue + threshold config land in S20+).

### Gemini round-2 finding (NEW HIGH — duplicate position ghosting)

> Missing unique constraint on `crypto_positions.signal_id`. If the workflow re-runs (manually or via Inngest retry), the entry `clientOrderId='live-${signalId}'` correctly dedupes the venue fill, but the workflow creates a second position row with a different UUID. The monitor cron sees two open positions and generates two DIFFERENT exit `clientOrderId`s — venue sees two distinct exit orders → DOUBLE-SELL.

**Same severity as Codex round-2 finding — financial-harm.** Gemini's catch here was the most consequential of the round.

**Fix applied (round 3, commit `3510ebf`)**: `uniqueIndex('crypto_positions_signal_unique_idx').on(table.signalId)` added. PostgreSQL UNIQUE allows multiple NULLs by default, so admin-driven manual positions without a backing signal can still coexist; only repeat-signalId rows are blocked. The store's `create()` surfaces the unique violation as an error to the workflow's `store-position` step — defensive constraint at the right layer.

### Gemini round-2 MEDIUM (test integrity)

> Running `crypto-position-monitor.test.ts` produces a `TypeError` in stderr for the "batches getCurrentPrices" test because `executeOrder` is not mocked for the token that triggers a close. While the test passes, it masks potential execution failures.

**Fix applied (round 3)**: Changed BTC seed price from $60000 (above TP) to $3000 (between SL and TP) so no position triggers close in this test. Added explicit `executeOrder not called` assertion.

### Gemini round-2 LOWs

- **Missing positivity check on SL/TP/sizeUsd**: applied in round 3 — band validation now also rejects non-positive numbers and non-finite values. Two new tests.

---

## Round 3 — GO from both reviewers

After applying Gemini's round-2 findings (commit `3510ebf`):

### Codex round-3
> These round-3 fixes are correct. The unique index on `signalId` closes a real duplicate-position/double-exit path at the DB layer. The expanded input validation is sensible and still happens before LLM cost. The monitor batching test fix is clean.
>
> Final verdict: **GO** for Sprint 18 B1 as shipped behind the disabled live-trade gate. Not GO to turn on production live trading yet, which is consistent with the sprint plan and service guards.

### Gemini round-3
> All Round 2 findings have been successfully addressed. The implementation of the unique constraint on `signal_id` and the corrected PnL math now provide a robust safety envelope for live trading.
>
> Final verdict: **GO**. The combination of venue-level idempotency (`clientOrderId`) and database-level uniqueness (`signal_id`) provides the defense-in-depth required for real capital handling.

---

## Carry-Forwards (non-blocking, deferred to S20+)

1. **Fees in PnL** (Gemini round-1 LOW): `computePnl` doesn't subtract exchange fees. Needs venue-specific fee rates in the adapter contract; lands when real venue impls arrive in S20+.

2. **Native stop-market order types in adapter contract** (Codex round-1 context): the contract supports market + limit orders. Real venue impls supporting server-side stop-market primitives could push stops to the venue directly for lower-latency exit; the contract leaves OrderType open for that future widening. Today's client-side polling cron is the documented trade-off.

3. **Persisting venue `orderId` on position row for ops queries** (Codex round-1 context): `clientOrderId` provides dedupe; `orderId` persistence is admin-tooling polish — useful for ops reconciliation queries but not safety-critical.

4. **Partial fills, fee reporting, position queries** (Codex round-1 context): real venue contracts need richer semantics — partial fills, per-order fee reporting, venue-side position queries. Land alongside the first real venue impl.

5. **Migration artifact for the new unique index**: not separately verified by Codex (only the schema change). When the real DB migrations are generated via `drizzle-kit generate`, the artifact should be reviewed for ON CONFLICT semantics on the existing data.

---

## Reviewer Calibration

| Round | Codex unique catches | Gemini unique catches | Overlap |
|---|---|---|---|
| 1 | SL-as-limit-order semantic bug, idempotency gap, production wiring guard, index/query mismatch | Linear-vs-inverse contract framing for PnL | Short PnL bug, approver fallback, SL/TP band validation |
| 2 | Ordering bug in round-1 approver fix | Unique constraint on signal_id | — |
| 3 | confirms GO | confirms GO | — |

**Pattern observations**:
- **Codex** continues to catch system-semantic + state-machine + ordering defects that require tracing through multi-step workflow logic. The round-2 ordering bug is a particularly sharp catch — it required reasoning about the EXACT sequence of `await step.run(...)` calls in the workflow.
- **Gemini** caught the most consequential financial-correctness bug of the review (the inverse-vs-linear PnL framing that made the math error impossible to miss) AND the round-2 unique-constraint finding that prevented a double-sell. The unique-constraint finding required reasoning about how `clientOrderId` dedupe interacts with database-level uniqueness — the kind of cross-layer thinking Gemini sometimes produces sharply.
- **Overlap on round 1**: both reviewers caught short PnL, approver fallback, and SL/TP band validation. Different framings; the combination was stronger than either alone.

This is the most expensive review cycle of the sprint so far (3 rounds × 2 reviewers each). The cost was justified by the financial-correctness stakes — three real bugs would have shipped without this multi-model gate.

---

## Provenance

- **Codex via MCP thread `019dfd35-07f5-7ca0-be3f-c3881802469b`** (GPT-5, sandbox read-only). Round 1: 7 findings (3 HIGH financial-harm + 1 CRITICAL + 1 HIGH + 2 MEDIUM). Round 2: 1 HIGH ordering bug. Round 3: GO-conditional.
- **Gemini via `mcp__pal__clink`** (`gemini-3-flash-preview`). Round 1: 4 findings (1 CRITICAL + 1 HIGH + 1 MEDIUM + 1 LOW). Round 2: 1 NEW HIGH (signal_id uniqueness) + 1 MEDIUM + 1 LOW. Round 3: GO.
- **Lead (Claude Opus 4.7)**: applied all in-scope fixes across 3 rounds; deferred fees + venue richness to S20+ when real venue impls arrive; documented the deferred items as carry-forwards.

---

## Commits (in order)

| Commit | Description |
|---|---|
| `62895a1` | B1 foundation — `crypto_positions` schema + Drizzle store adapter |
| `9ce61e1` | B1 exchange MCP adapter contract + in-memory impl |
| `86b03a1` | B1 daily-loss circuit breaker (FR-CRYPTO-RISK-002) |
| `5594102` | B1 live-trade workflow + service wiring |
| `e8aa07a` | B1 position monitor cron (FR-CRYPTO-TRD-004) |
| `9e7135b` | B1 round-1 review fixes (short PnL linear, market-order SL exits, idempotency contract, band validation, env-var guard, index alignment, approver fail-closed) |
| `27a2374` | B1 round-2 ordering fix (Codex: pre-execute approverId check) |
| `3510ebf` | B1 round-2 follow-up (Gemini: signal_id unique constraint, test stderr cleanup, positivity checks) |
| `<this commit>` | This multi-review doc |

---

## Closure

B1 ships with `CRYPTO_LIVE_TRADE_ENABLED=false`. The mechanism is correct, the safety envelope is robust, and the production guards fail loudly on misconfiguration. Real venue MCP implementations + per-department threshold config land in S20+ before the production flag flip.

**Test totals**: 124 S18 tests across 12 files (A1 12 foundation + 1 grep gate + 3 actor-propagation integration + 42 workflow + 36 B1 crypto + 23 B1 monitor cron + 7 misc). 196 database tests still green. monitor stderr clean.
