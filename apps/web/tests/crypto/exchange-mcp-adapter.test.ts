/**
 * S18-B1: Exchange MCP adapter tests — contract + in-memory impl.
 *
 * Tests cover the in-memory adapter's deterministic behaviour because
 * that's what the workflow tests will rely on. Real venue impls land
 * post-S18 and will have their own integration tests against
 * sandboxed credentials.
 *
 * Three behaviours under test:
 *   1. Price polling — seed + drift produces predictable walks; fixed
 *      price overrides drift; unknown symbol → SymbolNotFound.
 *   2. Order execution — fills at the current price (or limit when
 *      supplied); allowlist + rejection injector exercise the error
 *      branches.
 *   3. Batch price reads — round-trips one quote per requested symbol;
 *      partial failure propagates the first error.
 */

import { describe, it, expect } from 'vitest';
import {
  createInMemoryExchangeMcp,
  type ExchangeMcpError,
} from '../../src/lib/crypto/exchange-mcp-adapter.js';

const FROZEN_CLOCK = () => new Date('2026-04-29T12:00:00Z');

describe('S18-B1: createInMemoryExchangeMcp — price polling', () => {
  it('returns the seed price on the first call, with drift advancing thereafter', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000', driftPerCall: '5.00000000' } },
      now: FROZEN_CLOCK,
    });

    const first = await adapter.getCurrentPrice('ETH');
    const second = await adapter.getCurrentPrice('ETH');
    const third = await adapter.getCurrentPrice('ETH');

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.price).toBe('3000.00000000');

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.price).toBe('3005.00000000');

    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.value.price).toBe('3010.00000000');
  });

  it('drift defaults to 0 when not supplied — flat price walk', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { BTC: { price: '60000.00000000' } },
      now: FROZEN_CLOCK,
    });

    const first = await adapter.getCurrentPrice('BTC');
    const second = await adapter.getCurrentPrice('BTC');

    if (first.ok && second.ok) {
      expect(first.value.price).toBe('60000.00000000');
      expect(second.value.price).toBe('60000.00000000');
    }
  });

  it('fixed price overrides drift (useful for asserting SL/TP cross at thresholds)', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000', driftPerCall: '5.00000000' } },
      fixedPrice: { ETH: '2950.00000000' },
      now: FROZEN_CLOCK,
    });

    const r1 = await adapter.getCurrentPrice('ETH');
    const r2 = await adapter.getCurrentPrice('ETH');
    if (r1.ok && r2.ok) {
      expect(r1.value.price).toBe('2950.00000000');
      expect(r2.value.price).toBe('2950.00000000');
    }
  });

  it('unknown symbol returns SymbolNotFound', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
    });

    const result = await adapter.getCurrentPrice('UNKNOWN');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SymbolNotFound');
    expect((result.error as Extract<ExchangeMcpError, { _tag: 'SymbolNotFound' }>).symbol).toBe('UNKNOWN');
  });

  it('observedAt uses the injected clock', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const result = await adapter.getCurrentPrice('ETH');

    if (result.ok) {
      expect(result.value.observedAt).toBe('2026-01-01T00:00:00.000Z');
    }
  });
});

describe('S18-B1: createInMemoryExchangeMcp — batch price polling', () => {
  it('returns one quote per requested symbol in order', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: {
        ETH: { price: '3000.00000000' },
        BTC: { price: '60000.00000000' },
        SOL: { price: '150.00000000' },
      },
      now: FROZEN_CLOCK,
    });

    const result = await adapter.getCurrentPrices(['ETH', 'BTC', 'SOL']);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]!.symbol).toBe('ETH');
    expect(result.value[1]!.symbol).toBe('BTC');
    expect(result.value[2]!.symbol).toBe('SOL');
  });

  it('propagates SymbolNotFound when any symbol in the batch is unknown', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
    });

    const result = await adapter.getCurrentPrices(['ETH', 'UNKNOWN', 'BTC']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SymbolNotFound');
  });

  it('empty input returns an empty quote list', async () => {
    const adapter = createInMemoryExchangeMcp({ seedPrices: {} });

    const result = await adapter.getCurrentPrices([]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

describe('S18-B1: createInMemoryExchangeMcp — order execution', () => {
  it('fills at the seed price when no limit is supplied', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
      now: FROZEN_CLOCK,
    });

    const result = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '1000.00',
      clientOrderId: 'cli-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fillPrice).toBe('3000.00000000');
    expect(result.value.filledUsd).toBe('1000.00');
    expect(result.value.orderId).toMatch(/^inmem-order-\d+$/);
  });

  it('fills at the supplied limit price when present', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
      now: FROZEN_CLOCK,
    });

    const result = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'sell',
      sizeUsd: '1000.00',
      limitPrice: '2950.00000000',
      clientOrderId: 'cli-2',
    });

    if (result.ok) {
      expect(result.value.fillPrice).toBe('2950.00000000');
    }
  });

  it('returns SymbolNotFound when the symbol is outside the executable allowlist', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' }, BTC: { price: '60000.00000000' } },
      executableSymbols: ['ETH'], // BTC excluded
    });

    const result = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'BTC',
      side: 'buy',
      sizeUsd: '1000.00',
      clientOrderId: 'cli-3',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SymbolNotFound');
  });

  it('rejection injector forces OrderRejected', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
      rejectIf: (input) =>
        parseFloat(input.sizeUsd) > 5000
          ? { _tag: 'OrderRejected', reason: 'size-cap', exchange: input.exchange }
          : null,
    });

    const ok = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '1000.00',
      clientOrderId: 'cli-ok',
    });
    expect(ok.ok).toBe(true);

    const rejected = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '6000.00',
      clientOrderId: 'cli-too-big',
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.error._tag).toBe('OrderRejected');
  });

  it('rejection injector can simulate RateLimited', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
      rejectIf: () => ({ _tag: 'RateLimited', exchange: 'in-memory', retryAfterMs: 5000 }),
    });

    const result = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '500.00',
      clientOrderId: 'cli-rl',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('RateLimited');
  });

  it('rejection injector can simulate InsufficientLiquidity', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
      rejectIf: (input) => ({
        _tag: 'InsufficientLiquidity',
        symbol: input.symbol,
        requestedSizeUsd: input.sizeUsd,
      }),
    });

    const result = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '1000.00',
      clientOrderId: 'cli-il',
    });

    if (!result.ok) {
      expect(result.error._tag).toBe('InsufficientLiquidity');
    }
  });

  it('duplicate clientOrderId returns the original fill (idempotency contract)', async () => {
    // Round-1 multi-model review fix (Codex HIGH): the contract now
    // requires venue impls to dedupe by clientOrderId. The in-memory
    // impl honours the same semantic so workflow + cron retry paths
    // can't produce duplicate venue orders.
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
      now: FROZEN_CLOCK,
    });

    const first = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '1000.00',
      clientOrderId: 'dedupe-key-1',
    });
    const replay = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '1000.00',
      clientOrderId: 'dedupe-key-1', // same key → original fill
    });

    if (!first.ok || !replay.ok) throw new Error('expected both ok');
    expect(replay.value).toEqual(first.value);
    expect(replay.value.orderId).toBe(first.value.orderId);
  });

  it('different clientOrderIds produce different orders (negative case)', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
    });

    const a = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '100',
      clientOrderId: 'key-a',
    });
    const b = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '100',
      clientOrderId: 'key-b',
    });

    if (a.ok && b.ok) {
      expect(a.value.orderId).not.toBe(b.value.orderId);
    }
  });

  it('orderId monotonically increments per adapter instance', async () => {
    const adapter = createInMemoryExchangeMcp({
      seedPrices: { ETH: { price: '3000.00000000' } },
    });

    const a = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '100',
      clientOrderId: 'a',
    });
    const b = await adapter.executeOrder({
      exchange: 'in-memory',
      symbol: 'ETH',
      side: 'buy',
      sizeUsd: '100',
      clientOrderId: 'b',
    });

    if (a.ok && b.ok) {
      expect(a.value.orderId).toBe('inmem-order-1');
      expect(b.value.orderId).toBe('inmem-order-2');
    }
  });
});
