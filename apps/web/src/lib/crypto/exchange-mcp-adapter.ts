/**
 * S18-B1: Exchange MCP adapter contract for live-trade execution.
 *
 * Two distinct call surfaces from B1:
 *   - Order execution (entry + exit fills) — `executeOrder`
 *   - Price polling for the position monitor cron — `getCurrentPrice`
 *     for one symbol, `getCurrentPrices` for batch lookup
 *
 * Per AD-S18-4 of sprint-18-plan §8: S18 ships the contract + an
 * in-memory impl that validates the workflow loop end-to-end. Real
 * venue impls (Binance, Coinbase, decentralized exchanges) are S20+
 * work — they require vendor-specific MCP servers, sandbox
 * credentials, and per-venue compliance review. Production live-trade
 * flag flips wait for real venue implementations.
 *
 * Why batch in addition to single-symbol price reads (post-Gemini
 * round-1 review of the plan): the 30-second monitor cron may iterate
 * many open positions across distinct tokens. Single-symbol calls in
 * a loop would multiply request counts against rate-limited venues;
 * the batch method lets the monitor coalesce reads and venues that
 * support batch quotes can answer in one round-trip.
 *
 * Honest fallback semantics: when an in-memory impl is wired, the
 * workflow operates on synthetic price walks — useful for tests and
 * local development but explicitly NOT a production substitute. The
 * `live-trade-enabled` feature flag guards activation; flipping it on
 * in production without a real venue impl is a deployment-config bug
 * that should be caught at the runbook level.
 */

import { Result, type Result as ResultT } from '@aptivo/types';

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type ExchangeMcpError =
  | { readonly _tag: 'ExchangeUnavailable'; readonly exchange: string; readonly cause?: unknown }
  | { readonly _tag: 'SymbolNotFound'; readonly symbol: string; readonly exchange: string }
  | { readonly _tag: 'OrderRejected'; readonly reason: string; readonly exchange: string }
  | { readonly _tag: 'InsufficientLiquidity'; readonly symbol: string; readonly requestedSizeUsd: string }
  | { readonly _tag: 'RateLimited'; readonly exchange: string; readonly retryAfterMs?: number };

// ---------------------------------------------------------------------------
// order execution types
// ---------------------------------------------------------------------------

export interface ExecuteOrderInput {
  readonly exchange: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly sizeUsd: string;
  /**
   * Optional limit price as a string (preserved precision). When
   * absent the adapter places a market order; in-memory impl returns
   * a deterministic fill computed from the current price walk.
   */
  readonly limitPrice?: string;
  /** idempotency key — workflow step IDs are a good source */
  readonly clientOrderId: string;
}

export interface ExecuteOrderResult {
  /** venue-side order id; useful for reconciliation and audit */
  readonly orderId: string;
  /** fill price as a string (preserved precision) */
  readonly fillPrice: string;
  /** fill size in USD as a string */
  readonly filledUsd: string;
  /** ISO timestamp the venue reported as the fill time */
  readonly filledAt: string;
}

// ---------------------------------------------------------------------------
// price polling types
// ---------------------------------------------------------------------------

export interface PriceQuote {
  readonly symbol: string;
  readonly price: string;
  /** ISO timestamp of the venue's tick */
  readonly observedAt: string;
}

// ---------------------------------------------------------------------------
// adapter contract
// ---------------------------------------------------------------------------

export interface ExchangeMcpAdapter {
  /**
   * Place an order. Returns the fill metadata or a tagged error;
   * never throws — workflow code handles the Result branch.
   */
  executeOrder(input: ExecuteOrderInput): Promise<ResultT<ExecuteOrderResult, ExchangeMcpError>>;

  /**
   * Single-symbol price quote. Used by code paths that already know
   * exactly one symbol is in scope.
   */
  getCurrentPrice(symbol: string): Promise<ResultT<PriceQuote, ExchangeMcpError>>;

  /**
   * Batch price quote — returns one PriceQuote per requested symbol,
   * or fails the whole call if any symbol can't be resolved. Real
   * venue impls should issue a single round-trip when the venue API
   * supports it.
   */
  getCurrentPrices(symbols: readonly string[]): Promise<ResultT<readonly PriceQuote[], ExchangeMcpError>>;
}

// ---------------------------------------------------------------------------
// in-memory impl — deterministic price walks for tests + local dev
// ---------------------------------------------------------------------------

/**
 * Knobs the in-memory adapter exposes for test-time control. None of
 * these are persisted; each adapter instance carries its own state.
 */
export interface InMemoryExchangeMcpOpts {
  /**
   * Per-symbol price seed. Reads the seed price; subsequent
   * `getCurrentPrice` calls return seed + (driftPerCall * callCount)
   * so tests can advance prices toward SL or TP deterministically.
   * Symbols not in the seed map produce `SymbolNotFound`.
   */
  readonly seedPrices: Readonly<Record<string, { readonly price: string; readonly driftPerCall?: string }>>;
  /**
   * Optional override that forces every getCurrentPrice call to
   * return a fixed price (overrides drift). Useful for asserting
   * SL/TP cross detection at exact thresholds.
   */
  readonly fixedPrice?: Readonly<Record<string, string>>;
  /**
   * Optional ISO clock for `observedAt` and `filledAt` fields.
   * Defaults to `new Date()` when absent.
   */
  readonly now?: () => Date;
  /**
   * Optional allowlist for `executeOrder` — when provided, orders for
   * symbols outside the list return `SymbolNotFound` to simulate
   * unsupported markets.
   */
  readonly executableSymbols?: readonly string[];
  /**
   * Optional rejection injector for `executeOrder` — when set,
   * orders matching this predicate return the supplied error
   * instead of filling. Lets tests exercise the OrderRejected /
   * InsufficientLiquidity / RateLimited branches.
   */
  readonly rejectIf?: (input: ExecuteOrderInput) => ExchangeMcpError | null;
}

export function createInMemoryExchangeMcp(opts: InMemoryExchangeMcpOpts): ExchangeMcpAdapter {
  // call counters per symbol for deterministic drift
  const callCounts = new Map<string, number>();
  let orderSeq = 0;

  const now = opts.now ?? (() => new Date());

  function priceFor(symbol: string): ResultT<PriceQuote, ExchangeMcpError> {
    const fixed = opts.fixedPrice?.[symbol];
    if (fixed !== undefined) {
      return Result.ok({
        symbol,
        price: fixed,
        observedAt: now().toISOString(),
      });
    }

    const seed = opts.seedPrices[symbol];
    if (!seed) {
      return Result.err({ _tag: 'SymbolNotFound', symbol, exchange: 'in-memory' });
    }

    const callCount = callCounts.get(symbol) ?? 0;
    callCounts.set(symbol, callCount + 1);

    const drift = parseFloat(seed.driftPerCall ?? '0');
    const seedPrice = parseFloat(seed.price);
    const computed = (seedPrice + drift * callCount).toFixed(8);

    return Result.ok({
      symbol,
      price: computed,
      observedAt: now().toISOString(),
    });
  }

  return {
    async executeOrder(input) {
      // allowlist check first — simulates unsupported markets
      if (opts.executableSymbols && !opts.executableSymbols.includes(input.symbol)) {
        return Result.err({
          _tag: 'SymbolNotFound',
          symbol: input.symbol,
          exchange: input.exchange,
        });
      }

      // injector check — lets tests force any tagged error
      const injected = opts.rejectIf?.(input);
      if (injected) {
        return Result.err(injected);
      }

      // resolve fill price from the price source — limit if supplied,
      // else current price
      let fillPrice: string;
      if (input.limitPrice !== undefined) {
        fillPrice = input.limitPrice;
      } else {
        const priceResult = priceFor(input.symbol);
        if (!priceResult.ok) {
          return Result.err(priceResult.error);
        }
        fillPrice = priceResult.value.price;
      }

      orderSeq += 1;
      return Result.ok({
        orderId: `inmem-order-${orderSeq}`,
        fillPrice,
        filledUsd: input.sizeUsd,
        filledAt: now().toISOString(),
      });
    },

    async getCurrentPrice(symbol) {
      return priceFor(symbol);
    },

    async getCurrentPrices(symbols) {
      const quotes: PriceQuote[] = [];
      for (const symbol of symbols) {
        const r = priceFor(symbol);
        if (!r.ok) return Result.err(r.error);
        quotes.push(r.value);
      }
      return Result.ok(quotes);
    },
  };
}
