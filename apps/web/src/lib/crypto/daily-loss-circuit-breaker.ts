/**
 * S18-B1: Daily-loss circuit breaker — FR-CRYPTO-RISK-002.
 *
 * Blocks new live-trade entries when realized losses for a department
 * within the current UTC day exceed a configured threshold. Existing
 * positions are NOT force-closed — the breaker only rejects new
 * entries; the position-monitor cron continues to manage open
 * positions through their SL/TP exits.
 *
 * Why UTC day boundaries:
 *   - Crypto markets trade 24/7; there's no natural session close to
 *     anchor a "trading day".
 *   - All venue order timestamps are UTC, so a UTC day window
 *     produces stable losses regardless of where the dept's HQ is.
 *   - DST shifts on local-time windows would create spurious
 *     boundaries the limit could re-open or close across.
 *
 * Reset at UTC day rollover happens implicitly via the WHERE clause —
 * yesterday's losses fall outside `closed_at >= startOfUtcDay(now)`
 * once the date advances. No explicit reset job needed.
 *
 * Honest failure semantics:
 *   - When the threshold lookup or position scan fails, the breaker
 *     returns a tagged error so the caller can decide. The
 *     live-trade workflow's policy is to FAIL CLOSED (reject the
 *     entry) on a breaker error — losing visibility into realized
 *     losses is the riskier failure mode than blocking a legitimate
 *     trade.
 *   - When `getThresholdUsd` returns null, no limit is configured →
 *     allowed.
 *   - Open positions don't count toward the loss sum (no realized
 *     pnl); their closure on SL/TP rolls into the running total at
 *     that point and may flip the breaker for subsequent entries.
 */

import { Result, type Result as ResultT } from '@aptivo/types';
import type { CryptoPositionStore, CryptoPositionRecord } from '@aptivo/database/adapters';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export type CircuitBreakerError =
  | { readonly _tag: 'CircuitBreakerStoreUnavailable'; readonly cause: unknown };

export interface CircuitBreakerCheck {
  /** true → entry is allowed; false → blocked by daily-loss limit */
  readonly allowed: boolean;
  /** total realized losses for the dept today, as a string for precision */
  readonly realizedLossUsd: string;
  /** the configured threshold — useful for telemetry on close calls */
  readonly thresholdUsd: string;
  /** ISO timestamp of the UTC-day window start used for this calc */
  readonly windowStart: string;
  /** when allowed=false, a human-readable reason for the audit emit */
  readonly reason?: string;
}

export interface CircuitBreakerService {
  /**
   * Check whether a new live-trade entry for the given department is
   * allowed under today's loss budget. Returns Result so the caller
   * can distinguish "store unavailable" (caller's policy) from
   * "blocked" (deterministic threshold cross).
   */
  checkEntry(departmentId: string): Promise<ResultT<CircuitBreakerCheck, CircuitBreakerError>>;
}

// ---------------------------------------------------------------------------
// deps + factory
// ---------------------------------------------------------------------------

export interface DailyLossCircuitBreakerDeps {
  positionStore: Pick<CryptoPositionStore, 'findClosedSince'>;
  /**
   * Per-department daily loss threshold lookup, in USD as a string
   * (preserved precision through the pg NUMERIC type). Returning
   * `null` means "no threshold configured" and the breaker allows.
   *
   * Implementations typically read from a per-department config table;
   * the test impl supplies a static map. Decoupling lookup from the
   * breaker keeps this service free of DB-schema concerns.
   */
  getThresholdUsd(departmentId: string): Promise<string | null>;
  /** clock injection — defaults to `new Date()` when absent */
  now?: () => Date;
}

function startOfUtcDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(0, 0, 0, 0);
  return r;
}

/**
 * Sum realized losses (negative pnl_usd) for the supplied closed
 * positions. Returns the absolute loss as a non-negative number;
 * stringification happens at the boundary.
 */
function sumRealizedLosses(positions: readonly CryptoPositionRecord[]): number {
  let lossSum = 0;
  for (const pos of positions) {
    if (pos.pnlUsd === null) continue;
    const pnl = parseFloat(pos.pnlUsd);
    if (Number.isNaN(pnl)) continue;
    if (pnl < 0) lossSum += -pnl;
  }
  return lossSum;
}

export function createDailyLossCircuitBreaker(
  deps: DailyLossCircuitBreakerDeps,
): CircuitBreakerService {
  const now = deps.now ?? (() => new Date());

  return {
    async checkEntry(departmentId) {
      const windowStart = startOfUtcDay(now());
      const windowStartIso = windowStart.toISOString();

      let threshold: string | null;
      try {
        threshold = await deps.getThresholdUsd(departmentId);
      } catch (err) {
        return Result.err({ _tag: 'CircuitBreakerStoreUnavailable', cause: err });
      }

      // null threshold = no limit configured; allow honestly with
      // zeroed loss telemetry so the caller's audit emit can record
      // "no threshold configured" via the reason field if desired.
      if (threshold === null) {
        return Result.ok({
          allowed: true,
          realizedLossUsd: '0.00',
          thresholdUsd: '0.00',
          windowStart: windowStartIso,
        });
      }

      let positions: readonly CryptoPositionRecord[];
      try {
        positions = await deps.positionStore.findClosedSince(departmentId, windowStart);
      } catch (err) {
        return Result.err({ _tag: 'CircuitBreakerStoreUnavailable', cause: err });
      }

      const lossNumber = sumRealizedLosses(positions);
      const thresholdNumber = parseFloat(threshold);
      const allowed = lossNumber < thresholdNumber;

      return Result.ok({
        allowed,
        realizedLossUsd: lossNumber.toFixed(2),
        thresholdUsd: threshold,
        windowStart: windowStartIso,
        reason: allowed
          ? undefined
          : `daily-loss limit exceeded: realized $${lossNumber.toFixed(2)} >= threshold $${threshold} for dept ${departmentId} since ${windowStartIso}`,
      });
    },
  };
}
