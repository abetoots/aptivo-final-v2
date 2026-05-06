/**
 * S18-B1: Crypto position monitor cron — FR-CRYPTO-TRD-004.
 *
 * Polls open positions on a schedule, fetches current prices via the
 * exchange MCP adapter, and closes any position whose price has
 * crossed its SL or TP. Closing means:
 *   1. Issue an exit order via the same exchange adapter (executeOrder
 *      with the opposite side from the entry)
 *   2. Compute realized PnL from entry/exit/size
 *   3. Persist the close on the position store (idempotent)
 *   4. Emit a `crypto.position.closed` audit row attributed to the
 *      original `executedBy` (the HITL approver) — so audit_logs.user_id
 *      populates and the anomaly aggregate matches per-user volume
 *
 * Cross detection rules:
 *   - For long positions: close on `current >= tp` OR `current <= sl`
 *   - For short positions: close on `current <= tp` OR `current >= sl`
 *
 * The "exitReason" is determined by which threshold was crossed:
 *   - tp first → 'tp'
 *   - sl first → 'sl'
 *   - both true (gap through both) → 'sl' wins, since stop-loss is
 *     the safety boundary; treating a single tick that gapped past
 *     both thresholds as a TP would underreport the risk-tracking.
 *     Documented in the comparator below.
 *
 * Fault tolerance:
 *   - One position's failure to close (e.g. venue rejection on the
 *     exit order) does NOT abort the whole tick — the cron continues
 *     evaluating remaining positions. Failures emit an audit row and
 *     leave the position open for the next tick to retry.
 *   - Price-batch failure (the venue call rejects the whole list)
 *     emits a single audit row and exits the tick early; positions
 *     stay open and the next tick retries.
 *
 * Schedule: defaults to `* * * * *` (every minute). Inngest's standard
 * cron parser doesn't accept sub-minute schedules in 5-field syntax;
 * tighter cadence (~30s) requires Inngest's `@every 30s` form which
 * varies by deployment. The schedule is therefore configurable so the
 * operator can flip it once the deployment supports the tighter
 * schedule. The plan's "30s" target is captured as a config knob, not
 * a code-baked constant.
 */

import type { Inngest } from 'inngest';
import type { AuditEventInput } from '@aptivo/audit';
import type { ExchangeMcpAdapter } from '../crypto/exchange-mcp-adapter.js';
import type {
  CryptoPositionStore,
  CryptoPositionRecord,
  PositionExitReason,
} from '@aptivo/database/adapters';

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

export interface PositionMonitorConfig {
  /** Inngest cron expression. Default `* * * * *` (every minute). */
  readonly cron?: string;
  /** Inngest function id. Default `crypto-position-monitor`. */
  readonly id?: string;
}

export interface PositionMonitorDeps {
  readonly positionStore: CryptoPositionStore;
  readonly exchangeMcp: ExchangeMcpAdapter;
  readonly emitAudit: (input: AuditEventInput) => Promise<unknown>;
}

const DEFAULT_CRON = '* * * * *';
const DEFAULT_ID = 'crypto-position-monitor';

// ---------------------------------------------------------------------------
// pure cross detection
// ---------------------------------------------------------------------------

export type ExitDecision =
  | { readonly close: true; readonly reason: PositionExitReason; readonly fillPrice: string }
  | { readonly close: false };

/**
 * Decide whether a position should close at the supplied current
 * price. Pure function — testable in isolation, no I/O.
 *
 * Returns the fill price equal to the threshold that was crossed
 * (rather than the observed current price) — this matches typical
 * exchange behaviour where SL/TP fills at the trigger price during
 * normal conditions. Real venue fills will differ on gap moves;
 * those edge cases are handled by the exchange adapter and
 * reconciled at close time.
 */
export function decideExit(
  position: Pick<CryptoPositionRecord, 'direction' | 'slPrice' | 'tpPrice'>,
  currentPrice: string,
): ExitDecision {
  const current = parseFloat(currentPrice);
  const sl = parseFloat(position.slPrice);
  const tp = parseFloat(position.tpPrice);

  if (Number.isNaN(current) || Number.isNaN(sl) || Number.isNaN(tp)) {
    return { close: false };
  }

  if (position.direction === 'long') {
    // SL takes precedence on simultaneous cross — gap-through-both
    // tick should report as a stop-loss (risk-conservative
    // accounting) not a take-profit win.
    if (current <= sl) return { close: true, reason: 'sl', fillPrice: position.slPrice };
    if (current >= tp) return { close: true, reason: 'tp', fillPrice: position.tpPrice };
  } else {
    // short
    if (current >= sl) return { close: true, reason: 'sl', fillPrice: position.slPrice };
    if (current <= tp) return { close: true, reason: 'tp', fillPrice: position.tpPrice };
  }

  return { close: false };
}

/**
 * Compute realized PnL in USD given the position size and entry/exit
 * prices. Returns a string for precision parity with NUMERIC columns.
 *
 * `sizeUsd` is the USD notional at entry — these are LINEAR
 * USD-denominated positions. Both reviewers (Codex round-1 + Gemini
 * round-1) flagged that the prior formula `size * (entry/exit - 1)`
 * for shorts was inverse-contract math (coin-margined, where size is
 * denominated in the base asset). For linear contracts, the symmetric
 * pair is:
 *
 *   long:  pnl = sizeUsd * (exit / entry - 1)
 *   short: pnl = sizeUsd * (1 - exit / entry)
 *
 * Worked example to lock the difference: short $1000 @ entry=3000,
 * exit=1500 (50% drop).
 *   inverse (wrong): 1000 * (3000/1500 - 1) = 1000 * 1     = $1000
 *   linear (correct): 1000 * (1 - 1500/3000) = 1000 * 0.5  = $500
 *
 * The inverse formula over-reports gains and under-reports losses
 * non-linearly; would have led to incorrect daily-loss-circuit-breaker
 * thresholds and reporting drift. Tests in computePnl() lock the
 * corrected math.
 *
 * Fees are NOT subtracted here — exchange-specific fee rates aren't
 * yet in the adapter contract. Tracked as a Low carry-forward in
 * S18_B1_MULTI_REVIEW.md; fee subtraction lands when real venue impls
 * arrive in S20+.
 */
export function computePnl(
  position: Pick<CryptoPositionRecord, 'direction' | 'entryPrice' | 'sizeUsd'>,
  exitPriceStr: string,
): string {
  const entry = parseFloat(position.entryPrice);
  const exit = parseFloat(exitPriceStr);
  const size = parseFloat(position.sizeUsd);

  if (entry === 0 || Number.isNaN(entry) || Number.isNaN(exit) || Number.isNaN(size)) {
    return '0.00';
  }

  const pct = position.direction === 'long' ? exit / entry - 1 : 1 - exit / entry;
  return (size * pct).toFixed(2);
}

// ---------------------------------------------------------------------------
// inngest factory
// ---------------------------------------------------------------------------

export function createPositionMonitorFn(
  inngest: Inngest,
  deps: PositionMonitorDeps,
  config: PositionMonitorConfig = {},
) {
  const id = config.id ?? DEFAULT_ID;
  const cron = config.cron ?? DEFAULT_CRON;

  return inngest.createFunction(
    { id, retries: 0 },
    { cron },
    async ({ step }) => {
      // step 1: fetch open positions
      const open = await step.run('find-open-positions', () => deps.positionStore.findOpen());

      if (open.length === 0) {
        return { tickedAt: new Date().toISOString(), evaluated: 0, closed: 0 };
      }

      // step 2: batch price quotes — distinct tokens only, to minimise
      // venue API calls
      const distinctTokens = Array.from(new Set(open.map((p) => p.token)));
      const priceQuotes = await step.run('fetch-prices', async () => {
        const result = await deps.exchangeMcp.getCurrentPrices(distinctTokens);
        if (!result.ok) {
          // emit an audit row for the failure so operators can see it
          // in the audit log; positions stay open for the next tick
          await deps.emitAudit({
            actor: { id: 'system', type: 'system' },
            action: 'crypto.position-monitor.price-fetch-failed',
            resource: { type: 'price-batch', id: distinctTokens.join(',') },
            domain: 'crypto',
            metadata: { error: result.error._tag, tokens: distinctTokens },
          });
          return null;
        }
        return result.value;
      });

      if (priceQuotes === null) {
        return { tickedAt: new Date().toISOString(), evaluated: 0, closed: 0, priceFetchFailed: true };
      }

      const priceByToken = new Map(priceQuotes.map((q) => [q.symbol, q.price]));

      // step 3: per-position decision + close. Each position runs as
      // its own step so a failure on one doesn't abort the rest of
      // the tick.
      let closedCount = 0;
      for (const position of open) {
        const currentPrice = priceByToken.get(position.token);
        if (currentPrice === undefined) {
          // No price for this token in the batch result — shouldn't
          // happen since distinctTokens drove the request, but be
          // defensive. Skip with an audit hint for diagnostics.
          await step.run(`audit-no-price-${position.id}`, () =>
            deps.emitAudit({
              actor: { id: 'system', type: 'system' },
              action: 'crypto.position-monitor.price-missing',
              resource: { type: 'crypto-position', id: position.id },
              domain: 'crypto',
              metadata: { token: position.token },
            }),
          );
          continue;
        }

        const decision = decideExit(position, currentPrice);
        if (!decision.close) continue;

        const closed = await step.run(`close-position-${position.id}`, async () => {
          // exit order: opposite side of entry, MARKET order (no limit
          // price). Round-1 multi-model review (Codex HIGH) caught
          // that the prior `limitPrice: decision.fillPrice` made SL
          // exits unfillable on gap-throughs — a long-position SL
          // becomes a sell-LIMIT above the current market on a
          // gap-down, sitting unfilled while the losing position
          // remains open. Market orders guarantee fill (subject to
          // venue liquidity) at the cost of slippage; for a
          // client-side-stop monitor that has already observed the
          // threshold cross, that's the correct trade-off. The actual
          // fill price returned by the adapter populates exitPrice
          // and feeds into computePnl.
          //
          // Real venue impls supporting server-side stop-market
          // primitives could push the stop to the venue directly for
          // lower-latency exit; the contract leaves the OrderType
          // open for that future widening.
          const exitSide = position.direction === 'long' ? 'sell' : 'buy';
          const exitResult = await deps.exchangeMcp.executeOrder({
            exchange: position.exchange,
            symbol: position.token,
            side: exitSide,
            sizeUsd: position.sizeUsd,
            // intentionally no limitPrice — market order semantics
            clientOrderId: `exit-${position.id}-${decision.reason}`,
          });

          if (!exitResult.ok) {
            // emit failure audit; leave position open for next tick
            await deps.emitAudit({
              actor: { id: position.executedBy, type: 'user' },
              action: 'crypto.position.exit-failed',
              resource: { type: 'crypto-position', id: position.id },
              domain: 'crypto',
              metadata: {
                error: exitResult.error._tag,
                reason: decision.reason,
                token: position.token,
                exchange: position.exchange,
              },
            });
            return false;
          }

          const pnlUsd = computePnl(position, exitResult.value.fillPrice);

          await deps.positionStore.close(position.id, {
            exitPrice: exitResult.value.fillPrice,
            pnlUsd,
            exitReason: decision.reason,
          });

          // S18-A1 attribution: emit attributes to the original
          // executedBy (HITL approver from the entry); user_id
          // populates because actor.type='user'.
          await deps.emitAudit({
            actor: { id: position.executedBy, type: 'user' },
            action: 'crypto.position.closed',
            resource: { type: 'crypto-position', id: position.id },
            domain: 'crypto',
            metadata: {
              reason: decision.reason,
              token: position.token,
              direction: position.direction,
              entryPrice: position.entryPrice,
              exitPrice: exitResult.value.fillPrice,
              pnlUsd,
              departmentId: position.departmentId,
            },
          });

          return true;
        });

        if (closed) closedCount += 1;
      }

      return {
        tickedAt: new Date().toISOString(),
        evaluated: open.length,
        closed: closedCount,
      };
    },
  );
}
