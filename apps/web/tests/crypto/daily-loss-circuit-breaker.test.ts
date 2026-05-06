/**
 * S18-B1: Daily-loss circuit breaker tests — FR-CRYPTO-RISK-002.
 *
 * Coverage:
 *   - Threshold null → allowed with zero telemetry
 *   - Sum loss below threshold → allowed
 *   - Sum loss equals threshold → blocked (>= comparison; `>` would
 *     leak one trade past the limit)
 *   - Sum loss exceeds threshold → blocked with reason text populated
 *   - Profitable closes don't subtract from loss accumulator
 *   - Threshold lookup throws → CircuitBreakerStoreUnavailable
 *   - Position store throws → CircuitBreakerStoreUnavailable
 *   - UTC day rollover: positions that closed yesterday don't count
 *   - Multiple closed positions: losses accumulate correctly
 */

import { describe, it, expect } from 'vitest';
import {
  createDailyLossCircuitBreaker,
  type DailyLossCircuitBreakerDeps,
} from '../../src/lib/crypto/daily-loss-circuit-breaker.js';
import type { CryptoPositionRecord } from '@aptivo/database/adapters';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const FROZEN_NOW = () => new Date('2026-04-29T15:30:00Z');
const TODAY_START = new Date('2026-04-29T00:00:00.000Z');

function makeClosedPosition(opts: {
  pnlUsd: string;
  closedAt?: Date;
  departmentId?: string;
}): CryptoPositionRecord {
  return {
    id: `pos-${Math.random().toString(36).slice(2, 8)}`,
    signalId: null,
    departmentId: opts.departmentId ?? 'dept-1',
    token: 'ETH',
    direction: 'long',
    exchange: 'in-memory',
    entryPrice: '3000.00',
    sizeUsd: '1000.00',
    slPrice: '2950.00',
    tpPrice: '3100.00',
    exitPrice: '2950.00',
    pnlUsd: opts.pnlUsd,
    exitReason: parseFloat(opts.pnlUsd) < 0 ? 'sl' : 'tp',
    executedBy: 'user-1',
    openedAt: new Date('2026-04-29T08:00:00Z'),
    closedAt: opts.closedAt ?? new Date('2026-04-29T12:00:00Z'),
  };
}

function makeDeps(opts: {
  threshold: string | null;
  closedPositions: CryptoPositionRecord[];
  thresholdThrows?: unknown;
  positionsThrows?: unknown;
}): DailyLossCircuitBreakerDeps {
  return {
    positionStore: {
      findClosedSince: async (deptId, since) => {
        if (opts.positionsThrows !== undefined) throw opts.positionsThrows;
        // mirror the production WHERE clause: filter by deptId + closedAt
        return opts.closedPositions.filter(
          (p) => p.departmentId === deptId && p.closedAt !== null && p.closedAt >= since,
        );
      },
    },
    getThresholdUsd: async () => {
      if (opts.thresholdThrows !== undefined) throw opts.thresholdThrows;
      return opts.threshold;
    },
    now: FROZEN_NOW,
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S18-B1: createDailyLossCircuitBreaker', () => {
  it('allows entry with zero telemetry when no threshold is configured', async () => {
    const breaker = createDailyLossCircuitBreaker(
      makeDeps({ threshold: null, closedPositions: [] }),
    );

    const result = await breaker.checkEntry('dept-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allowed).toBe(true);
    expect(result.value.realizedLossUsd).toBe('0.00');
    expect(result.value.thresholdUsd).toBe('0.00');
    expect(result.value.windowStart).toBe(TODAY_START.toISOString());
    expect(result.value.reason).toBeUndefined();
  });

  it('allows entry when realized loss is below the threshold', async () => {
    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '500.00',
        closedPositions: [makeClosedPosition({ pnlUsd: '-100.00' })],
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    if (!result.ok) throw new Error('expected ok');
    expect(result.value.allowed).toBe(true);
    expect(result.value.realizedLossUsd).toBe('100.00');
    expect(result.value.thresholdUsd).toBe('500.00');
    expect(result.value.reason).toBeUndefined();
  });

  it('blocks entry when realized loss equals the threshold (>= comparison)', async () => {
    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '500.00',
        closedPositions: [makeClosedPosition({ pnlUsd: '-500.00' })],
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    if (!result.ok) throw new Error('expected ok');
    expect(result.value.allowed).toBe(false);
    expect(result.value.realizedLossUsd).toBe('500.00');
    expect(result.value.reason).toContain('daily-loss limit exceeded');
    expect(result.value.reason).toContain('$500.00');
    expect(result.value.reason).toContain('dept-1');
  });

  it('blocks entry when realized loss exceeds the threshold', async () => {
    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '500.00',
        closedPositions: [
          makeClosedPosition({ pnlUsd: '-300.00' }),
          makeClosedPosition({ pnlUsd: '-250.00' }),
        ],
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    if (!result.ok) throw new Error('expected ok');
    expect(result.value.allowed).toBe(false);
    expect(result.value.realizedLossUsd).toBe('550.00');
  });

  it('profitable closes do NOT subtract from the loss accumulator', async () => {
    // 200 profit + 150 loss + 100 loss = 250 total loss (NOT 50 net loss)
    // The breaker is loss-only — wins don't offset losses against the
    // daily limit because risk-management semantics treat
    // realized-loss volume as the trigger.
    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '300.00',
        closedPositions: [
          makeClosedPosition({ pnlUsd: '200.00' }),
          makeClosedPosition({ pnlUsd: '-150.00' }),
          makeClosedPosition({ pnlUsd: '-100.00' }),
        ],
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    if (!result.ok) throw new Error('expected ok');
    expect(result.value.realizedLossUsd).toBe('250.00');
    expect(result.value.allowed).toBe(true); // 250 < 300
  });

  it('UTC day rollover excludes yesterday\'s closed positions', async () => {
    // The positionStore mock filters by `closedAt >= since`. If the
    // adapter passed yesterday's date by mistake, yesterday's losses
    // would leak. This test verifies windowStart is start-of-UTC-today.
    const yesterdayClose = makeClosedPosition({
      pnlUsd: '-1000.00',
      closedAt: new Date('2026-04-28T23:00:00Z'),
    });
    const todayClose = makeClosedPosition({
      pnlUsd: '-100.00',
      closedAt: new Date('2026-04-29T08:00:00Z'),
    });

    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '500.00',
        closedPositions: [yesterdayClose, todayClose],
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    if (!result.ok) throw new Error('expected ok');
    expect(result.value.realizedLossUsd).toBe('100.00');
    expect(result.value.allowed).toBe(true);
  });

  it('scopes by department — other depts\' losses don\'t count', async () => {
    const otherDeptLoss = makeClosedPosition({
      pnlUsd: '-1000.00',
      departmentId: 'dept-other',
    });
    const ourLoss = makeClosedPosition({ pnlUsd: '-50.00' });

    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '100.00',
        closedPositions: [otherDeptLoss, ourLoss],
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    if (!result.ok) throw new Error('expected ok');
    expect(result.value.realizedLossUsd).toBe('50.00');
    expect(result.value.allowed).toBe(true);
  });

  it('threshold-lookup error returns CircuitBreakerStoreUnavailable', async () => {
    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '500.00',
        closedPositions: [],
        thresholdThrows: new Error('config service down'),
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CircuitBreakerStoreUnavailable');
  });

  it('position-store error returns CircuitBreakerStoreUnavailable', async () => {
    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '500.00',
        closedPositions: [],
        positionsThrows: new Error('db connection lost'),
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('CircuitBreakerStoreUnavailable');
  });

  it('skips records with null pnl_usd (open positions or in-flight closes)', async () => {
    const inFlightClose: CryptoPositionRecord = {
      ...makeClosedPosition({ pnlUsd: '-100.00' }),
      pnlUsd: null,
    };
    const realLoss = makeClosedPosition({ pnlUsd: '-200.00' });

    const breaker = createDailyLossCircuitBreaker(
      makeDeps({
        threshold: '500.00',
        closedPositions: [inFlightClose, realLoss],
      }),
    );

    const result = await breaker.checkEntry('dept-1');

    if (!result.ok) throw new Error('expected ok');
    expect(result.value.realizedLossUsd).toBe('200.00');
  });

  it('windowStart is start-of-UTC-day regardless of clock time within the day', async () => {
    const breaker = createDailyLossCircuitBreaker({
      positionStore: { findClosedSince: async () => [] },
      getThresholdUsd: async () => null,
      now: () => new Date('2026-04-29T23:59:59.999Z'),
    });

    const result = await breaker.checkEntry('dept-1');

    if (!result.ok) throw new Error('expected ok');
    expect(result.value.windowStart).toBe('2026-04-29T00:00:00.000Z');
  });
});
