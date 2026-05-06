/**
 * S18-B1: Position monitor cron tests.
 *
 * Two layers:
 *   1. Pure-function tests for `decideExit` and `computePnl` — the
 *      heart of the cross-detection + PnL logic. These are
 *      deterministic and the most valuable to lock down.
 *   2. Orchestration tests via the inngest test engine — verify the
 *      tick path: empty open set, price-batch failure, individual
 *      position close, mixed open + close on the same tick, exchange
 *      rejection isolated to one position, audit attribution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';
import {
  decideExit,
  computePnl,
  createPositionMonitorFn,
} from '../../src/lib/jobs/crypto-position-monitor.js';
import type { CryptoPositionRecord } from '@aptivo/database/adapters';

// ---------------------------------------------------------------------------
// pure-function tests
// ---------------------------------------------------------------------------

describe('S18-B1: decideExit (pure)', () => {
  describe('long position', () => {
    const longPos = { direction: 'long' as const, slPrice: '2950.00', tpPrice: '3100.00' };

    it('does not close when current price is between SL and TP', () => {
      expect(decideExit(longPos, '3000.00')).toEqual({ close: false });
      expect(decideExit(longPos, '2960.00')).toEqual({ close: false });
      expect(decideExit(longPos, '3090.00')).toEqual({ close: false });
    });

    it('closes with reason=tp when current >= tp', () => {
      expect(decideExit(longPos, '3100.00')).toEqual({
        close: true,
        reason: 'tp',
        fillPrice: '3100.00',
      });
      expect(decideExit(longPos, '3150.00')).toMatchObject({ close: true, reason: 'tp' });
    });

    it('closes with reason=sl when current <= sl', () => {
      expect(decideExit(longPos, '2950.00')).toEqual({
        close: true,
        reason: 'sl',
        fillPrice: '2950.00',
      });
      expect(decideExit(longPos, '2900.00')).toMatchObject({ close: true, reason: 'sl' });
    });
  });

  describe('short position', () => {
    const shortPos = { direction: 'short' as const, slPrice: '3100.00', tpPrice: '2950.00' };

    it('does not close when current price is between TP and SL', () => {
      expect(decideExit(shortPos, '3000.00')).toEqual({ close: false });
      expect(decideExit(shortPos, '2960.00')).toEqual({ close: false });
      expect(decideExit(shortPos, '3090.00')).toEqual({ close: false });
    });

    it('closes with reason=tp when current <= tp (price moved favorably for short)', () => {
      expect(decideExit(shortPos, '2950.00')).toEqual({
        close: true,
        reason: 'tp',
        fillPrice: '2950.00',
      });
      expect(decideExit(shortPos, '2900.00')).toMatchObject({ close: true, reason: 'tp' });
    });

    it('closes with reason=sl when current >= sl (price moved against short)', () => {
      expect(decideExit(shortPos, '3100.00')).toEqual({
        close: true,
        reason: 'sl',
        fillPrice: '3100.00',
      });
      expect(decideExit(shortPos, '3150.00')).toMatchObject({ close: true, reason: 'sl' });
    });
  });

  it('SL takes precedence on a long-position gap that crosses both thresholds', () => {
    // physically impossible to be at both, but defensive — gapping
    // tick that reports a price below SL still gets sl semantics
    // even though it's also far above TP from the "did we hit" sense.
    // Long: only one direction can be true at a time (current <= sl
    // AND current >= tp would require sl >= tp which is invalid). So
    // this is more about ordering when both branches *could* match
    // (e.g. malformed sl >= tp). With sl=2950, tp=3100, current=2900:
    // current<=sl matches; current<tp doesn't match the >= guard.
    // The behaviour we lock down: sl branch is checked first.
    const malformed = { direction: 'long' as const, slPrice: '3100.00', tpPrice: '2950.00' };
    expect(decideExit(malformed, '3000.00')).toMatchObject({ reason: 'sl' });
  });

  it('returns no-close on NaN inputs (defensive)', () => {
    expect(decideExit({ direction: 'long', slPrice: 'abc', tpPrice: '3100' }, '3000')).toEqual({
      close: false,
    });
    expect(decideExit({ direction: 'long', slPrice: '2950', tpPrice: '3100' }, 'NaN')).toEqual({
      close: false,
    });
  });
});

describe('S18-B1: computePnl (pure)', () => {
  it('long position with profit', () => {
    const pos = { direction: 'long' as const, entryPrice: '3000.00', sizeUsd: '1000.00' };
    expect(computePnl(pos, '3100.00')).toBe('33.33');
  });

  it('long position with loss', () => {
    const pos = { direction: 'long' as const, entryPrice: '3000.00', sizeUsd: '1000.00' };
    expect(computePnl(pos, '2950.00')).toBe('-16.67');
  });

  it('short position with profit (price drops) — linear formula', () => {
    // size * (1 - exit/entry) = 1000 * (1 - 2950/3000) = 1000 * 0.01666 = 16.67
    // (Previously asserted 16.95 — that was the inverse-contract formula
    // for coin-margined positions, which is wrong for USD-denominated
    // positions. Fixed in round-2 review.)
    const pos = { direction: 'short' as const, entryPrice: '3000.00', sizeUsd: '1000.00' };
    expect(computePnl(pos, '2950.00')).toBe('16.67');
  });

  it('short position with loss (price rises) — linear formula', () => {
    // size * (1 - exit/entry) = 1000 * (1 - 3100/3000) = 1000 * -0.0333 = -33.33
    const pos = { direction: 'short' as const, entryPrice: '3000.00', sizeUsd: '1000.00' };
    expect(computePnl(pos, '3100.00')).toBe('-33.33');
  });

  it('short position with 50% price drop returns linear (not inverse) PnL', () => {
    // Worked example from the multi-review: previously over-reported as
    // $1000 (inverse-contract result); correct linear result is $500.
    const pos = { direction: 'short' as const, entryPrice: '3000.00', sizeUsd: '1000.00' };
    expect(computePnl(pos, '1500.00')).toBe('500.00');
  });

  it('zero PnL when exit equals entry', () => {
    const pos = { direction: 'long' as const, entryPrice: '3000.00', sizeUsd: '1000.00' };
    expect(computePnl(pos, '3000.00')).toBe('0.00');
  });

  it('returns 0 on NaN entry', () => {
    const pos = { direction: 'long' as const, entryPrice: 'bad', sizeUsd: '1000' };
    expect(computePnl(pos, '3000')).toBe('0.00');
  });
});

// ---------------------------------------------------------------------------
// orchestration tests
// ---------------------------------------------------------------------------

function makePosition(overrides: Partial<CryptoPositionRecord> = {}): CryptoPositionRecord {
  return {
    id: 'pos-1',
    signalId: 'sig-1',
    departmentId: 'dept-1',
    token: 'ETH',
    direction: 'long',
    exchange: 'in-memory',
    entryPrice: '3000.00',
    sizeUsd: '1000.00',
    slPrice: '2950.00',
    tpPrice: '3100.00',
    exitPrice: null,
    pnlUsd: null,
    exitReason: null,
    executedBy: 'approver-1',
    openedAt: new Date('2026-04-29T08:00:00Z'),
    closedAt: null,
    ...overrides,
  };
}

describe('S18-B1: position monitor cron — orchestration', () => {
  let mockStore: ReturnType<typeof makeMockStore>;
  let mockMcp: ReturnType<typeof makeMockMcp>;
  let auditEmits: ReturnType<typeof vi.fn>;

  function makeMockStore() {
    return {
      create: vi.fn(),
      findById: vi.fn(),
      findOpen: vi.fn(),
      findClosedSince: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }

  function makeMockMcp() {
    return {
      executeOrder: vi.fn(),
      getCurrentPrice: vi.fn(),
      getCurrentPrices: vi.fn(),
    };
  }

  beforeEach(() => {
    mockStore = makeMockStore();
    mockMcp = makeMockMcp();
    auditEmits = vi.fn().mockResolvedValue(undefined);
  });

  function buildEngine() {
    const inngest = new Inngest({ id: 'test-monitor' });
    const fn = createPositionMonitorFn(
      inngest,
      {
        positionStore: mockStore as never,
        exchangeMcp: mockMcp as never,
        emitAudit: auditEmits,
      },
      { cron: '* * * * *', id: 'test-monitor' },
    );
    return new InngestTestEngine({
      function: fn,
      events: [{ name: 'inngest/scheduled-function.triggered', data: {} }],
    });
  }

  it('returns evaluated=0 when no positions are open', async () => {
    mockStore.findOpen.mockResolvedValue([]);

    const { result } = await buildEngine().execute();

    expect(result).toMatchObject({ evaluated: 0, closed: 0 });
    expect(mockMcp.getCurrentPrices).not.toHaveBeenCalled();
  });

  it('exits early with priceFetchFailed=true when batch price call rejects', async () => {
    mockStore.findOpen.mockResolvedValue([makePosition()]);
    mockMcp.getCurrentPrices.mockResolvedValue(
      Result.err({ _tag: 'RateLimited' as const, exchange: 'in-memory' }),
    );

    const { result } = await buildEngine().execute();

    expect(result).toMatchObject({ priceFetchFailed: true, closed: 0 });
    expect(mockStore.close).not.toHaveBeenCalled();
    expect(auditEmits).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'crypto.position-monitor.price-fetch-failed' }),
    );
  });

  it('does NOT close when current price is between SL and TP', async () => {
    mockStore.findOpen.mockResolvedValue([makePosition()]);
    mockMcp.getCurrentPrices.mockResolvedValue(
      Result.ok([{ symbol: 'ETH', price: '3000.00', observedAt: '2026-04-29T12:00:00Z' }]),
    );

    const { result } = await buildEngine().execute();

    expect(result).toMatchObject({ evaluated: 1, closed: 0 });
    expect(mockMcp.executeOrder).not.toHaveBeenCalled();
    expect(mockStore.close).not.toHaveBeenCalled();
  });

  it('closes a long position when TP is crossed and emits audit attributed to executedBy', async () => {
    mockStore.findOpen.mockResolvedValue([makePosition({ executedBy: 'approver-9' })]);
    mockMcp.getCurrentPrices.mockResolvedValue(
      Result.ok([{ symbol: 'ETH', price: '3120.00', observedAt: '2026-04-29T12:00:00Z' }]),
    );
    mockMcp.executeOrder.mockResolvedValue(
      Result.ok({
        orderId: 'exit-1',
        fillPrice: '3100.00',
        filledUsd: '1000.00',
        filledAt: '2026-04-29T12:00:00Z',
      }),
    );

    const { result } = await buildEngine().execute();

    expect(result).toMatchObject({ evaluated: 1, closed: 1 });

    // exit order placed with sell side, MARKET order (no limitPrice).
    // Round-1 multi-model fix: dropping limitPrice avoids the SL
    // gap-fill bug where a sell-limit above market would sit unfilled.
    expect(mockMcp.executeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        side: 'sell',
        symbol: 'ETH',
        sizeUsd: '1000.00',
        clientOrderId: 'exit-pos-1-tp',
      }),
    );
    const exitCall = mockMcp.executeOrder.mock.calls[0]![0];
    expect(exitCall).not.toHaveProperty('limitPrice');

    // store.close called with computed PnL
    expect(mockStore.close).toHaveBeenCalledWith(
      'pos-1',
      expect.objectContaining({
        exitPrice: '3100.00',
        exitReason: 'tp',
        pnlUsd: '33.33',
      }),
    );

    // audit attributed to executedBy with type='user' (S18-A1)
    expect(auditEmits).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: 'approver-9', type: 'user' },
        action: 'crypto.position.closed',
        metadata: expect.objectContaining({
          reason: 'tp',
          pnlUsd: '33.33',
        }),
      }),
    );
  });

  it('closes a short position when its TP (price drop) is crossed', async () => {
    mockStore.findOpen.mockResolvedValue([
      makePosition({
        direction: 'short',
        entryPrice: '3000.00',
        slPrice: '3100.00',
        tpPrice: '2950.00',
      }),
    ]);
    mockMcp.getCurrentPrices.mockResolvedValue(
      Result.ok([{ symbol: 'ETH', price: '2940.00', observedAt: '2026-04-29T12:00:00Z' }]),
    );
    mockMcp.executeOrder.mockResolvedValue(
      Result.ok({
        orderId: 'exit-2',
        fillPrice: '2950.00',
        filledUsd: '1000.00',
        filledAt: '2026-04-29T12:00:00Z',
      }),
    );

    const { result } = await buildEngine().execute();

    expect(result).toMatchObject({ closed: 1 });
    // short exit order is buy-side, market order (no limitPrice)
    expect(mockMcp.executeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'buy' }),
    );
    const exitCall = mockMcp.executeOrder.mock.calls[0]![0];
    expect(exitCall).not.toHaveProperty('limitPrice');
    // PnL for short (linear): (1 - 2950/3000) * 1000 = 16.67
    expect(mockStore.close).toHaveBeenCalledWith(
      'pos-1',
      expect.objectContaining({ pnlUsd: '16.67', exitReason: 'tp' }),
    );
  });

  it('isolates exchange-rejection failures to a single position; tick continues', async () => {
    const failing = makePosition({ id: 'pos-fail' });
    const succeeding = makePosition({ id: 'pos-ok', token: 'BTC' });
    mockStore.findOpen.mockResolvedValue([failing, succeeding]);

    mockMcp.getCurrentPrices.mockResolvedValue(
      Result.ok([
        { symbol: 'ETH', price: '3120.00', observedAt: '2026-04-29T12:00:00Z' },
        { symbol: 'BTC', price: '3120.00', observedAt: '2026-04-29T12:00:00Z' },
      ]),
    );

    // first executeOrder rejects, second succeeds
    mockMcp.executeOrder
      .mockResolvedValueOnce(
        Result.err({ _tag: 'RateLimited' as const, exchange: 'in-memory' }),
      )
      .mockResolvedValueOnce(
        Result.ok({
          orderId: 'exit-ok',
          fillPrice: '3100.00',
          filledUsd: '1000.00',
          filledAt: '2026-04-29T12:00:00Z',
        }),
      );

    const { result } = await buildEngine().execute();

    expect(result).toMatchObject({ evaluated: 2, closed: 1 });
    // position store.close was called once (for the succeeding one)
    expect(mockStore.close).toHaveBeenCalledTimes(1);
    expect(mockStore.close).toHaveBeenCalledWith('pos-ok', expect.any(Object));
    // failure audit emitted for the failing one
    expect(auditEmits).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'crypto.position.exit-failed',
        resource: { type: 'crypto-position', id: 'pos-fail' },
      }),
    );
  });

  it('batches getCurrentPrices on distinct tokens only (no duplicate calls)', async () => {
    mockStore.findOpen.mockResolvedValue([
      makePosition({ id: 'pos-1', token: 'ETH' }),
      makePosition({ id: 'pos-2', token: 'ETH' }),
      makePosition({ id: 'pos-3', token: 'BTC' }),
    ]);
    mockMcp.getCurrentPrices.mockResolvedValue(
      Result.ok([
        { symbol: 'ETH', price: '3000.00', observedAt: 't' },
        { symbol: 'BTC', price: '60000.00', observedAt: 't' },
      ]),
    );

    await buildEngine().execute();

    expect(mockMcp.getCurrentPrices).toHaveBeenCalledTimes(1);
    const tokens = mockMcp.getCurrentPrices.mock.calls[0]![0] as readonly string[];
    expect(tokens).toEqual(expect.arrayContaining(['ETH', 'BTC']));
    expect(tokens).toHaveLength(2); // not 3 — distinct
  });

  it('skips a position when its token has no quote in the batch', async () => {
    mockStore.findOpen.mockResolvedValue([makePosition({ token: 'XRP' })]);
    // batch returns an unrelated token (defensive scenario)
    mockMcp.getCurrentPrices.mockResolvedValue(
      Result.ok([{ symbol: 'ETH', price: '3000.00', observedAt: 't' }]),
    );

    const { result } = await buildEngine().execute();

    expect(result).toMatchObject({ closed: 0 });
    expect(mockMcp.executeOrder).not.toHaveBeenCalled();
    expect(auditEmits).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'crypto.position-monitor.price-missing' }),
    );
  });
});
