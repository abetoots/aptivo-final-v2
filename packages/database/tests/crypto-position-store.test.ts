/**
 * S18-B1: Crypto position store adapter tests.
 *
 * Verifies the adapter's CRUD shape against a chained-mock Drizzle
 * client. Mirrors the pattern in `int-w1-audit-adapters.test.ts` so the
 * tests stay self-contained without spinning up Postgres; the actual
 * query semantics are covered by the integration suite when the live
 * tree is available.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleCryptoPositionStore } from '../src/adapters/crypto-position-store-drizzle.js';

// ---------------------------------------------------------------------------
// chained-builder mock — same shape as int-w1
// ---------------------------------------------------------------------------

function createMockBuilder(resolvedValue: unknown = []) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.returning = vi.fn().mockResolvedValue(resolvedValue);
  builder.values = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockResolvedValue(undefined);
  // select chain: .select().from(table).where(...) returns rows
  builder.from = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(resolvedValue),
  });
  return builder;
}

function createMockDb(opts?: {
  insertReturn?: unknown;
  selectRows?: unknown[];
}) {
  const insertBuilder = createMockBuilder(opts?.insertReturn ?? [{ id: 'pos-uuid-001' }]);
  // separate select builder so each call gets fresh rows
  const selectBuilder = {
    from: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockResolvedValue(opts?.selectRows ?? []),
    })),
  };
  const updateBuilder = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  // make set chain back to itself for `.set(...).where(...)`
  updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);

  return {
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(updateBuilder),
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
  };
}

// ---------------------------------------------------------------------------
// fixture data
// ---------------------------------------------------------------------------

const SAMPLE_INPUT = {
  signalId: 'signal-1',
  departmentId: 'dept-1',
  token: 'ETH',
  direction: 'long' as const,
  exchange: 'binance',
  entryPrice: '3000.12345678',
  sizeUsd: '1000.00',
  slPrice: '2950.00000000',
  tpPrice: '3100.00000000',
  executedBy: 'user-approver-1',
};

const SAMPLE_OPEN_ROW = {
  id: 'pos-1',
  signalId: 'signal-1',
  departmentId: 'dept-1',
  token: 'ETH',
  direction: 'long',
  exchange: 'binance',
  entryPrice: '3000.12345678',
  sizeUsd: '1000.00',
  slPrice: '2950.00000000',
  tpPrice: '3100.00000000',
  exitPrice: null,
  pnlUsd: null,
  exitReason: null,
  executedBy: 'user-approver-1',
  openedAt: new Date('2026-04-29T10:00:00Z'),
  closedAt: null,
};

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S18-B1: createDrizzleCryptoPositionStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('create', () => {
    it('inserts the position with all required fields and returns the new id', async () => {
      const store = createDrizzleCryptoPositionStore(db as never);

      const result = await store.create(SAMPLE_INPUT);

      expect(result.id).toBe('pos-uuid-001');
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db._insertBuilder.values).toHaveBeenCalledWith({
        signalId: 'signal-1',
        departmentId: 'dept-1',
        token: 'ETH',
        direction: 'long',
        exchange: 'binance',
        entryPrice: '3000.12345678',
        sizeUsd: '1000.00',
        slPrice: '2950.00000000',
        tpPrice: '3100.00000000',
        executedBy: 'user-approver-1',
      });
    });

    it('passes signalId as null when omitted (signal-less manual position)', async () => {
      const store = createDrizzleCryptoPositionStore(db as never);

      await store.create({ ...SAMPLE_INPUT, signalId: undefined });

      expect(db._insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ signalId: null }),
      );
    });
  });

  describe('findById', () => {
    it('returns the mapped record when a row matches', async () => {
      db = createMockDb({ selectRows: [SAMPLE_OPEN_ROW] });
      const store = createDrizzleCryptoPositionStore(db as never);

      const result = await store.findById('pos-1');

      expect(result).toEqual({
        id: 'pos-1',
        signalId: 'signal-1',
        departmentId: 'dept-1',
        token: 'ETH',
        direction: 'long',
        exchange: 'binance',
        entryPrice: '3000.12345678',
        sizeUsd: '1000.00',
        slPrice: '2950.00000000',
        tpPrice: '3100.00000000',
        exitPrice: null,
        pnlUsd: null,
        exitReason: null,
        executedBy: 'user-approver-1',
        openedAt: new Date('2026-04-29T10:00:00Z'),
        closedAt: null,
      });
    });

    it('returns null when no row matches', async () => {
      db = createMockDb({ selectRows: [] });
      const store = createDrizzleCryptoPositionStore(db as never);

      expect(await store.findById('missing')).toBeNull();
    });
  });

  describe('findOpen', () => {
    it('returns rows where closedAt IS NULL — empty when none open', async () => {
      db = createMockDb({ selectRows: [] });
      const store = createDrizzleCryptoPositionStore(db as never);

      const result = await store.findOpen();

      expect(result).toEqual([]);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('maps multiple open rows', async () => {
      const second = { ...SAMPLE_OPEN_ROW, id: 'pos-2', token: 'BTC' };
      db = createMockDb({ selectRows: [SAMPLE_OPEN_ROW, second] });
      const store = createDrizzleCryptoPositionStore(db as never);

      const result = await store.findOpen();

      expect(result).toHaveLength(2);
      expect(result[0]!.token).toBe('ETH');
      expect(result[1]!.token).toBe('BTC');
    });
  });

  describe('close', () => {
    it('updates the position with exit metadata and exitReason=tp', async () => {
      const store = createDrizzleCryptoPositionStore(db as never);

      await store.close('pos-1', {
        exitPrice: '3100.00000000',
        pnlUsd: '33.32',
        exitReason: 'tp',
      });

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          exitPrice: '3100.00000000',
          pnlUsd: '33.32',
          exitReason: 'tp',
          closedAt: expect.any(Date),
        }),
      );
    });

    it('exitReason="sl" stops out and writes the SL fill price', async () => {
      const store = createDrizzleCryptoPositionStore(db as never);

      await store.close('pos-1', {
        exitPrice: '2950.00000000',
        pnlUsd: '-16.66',
        exitReason: 'sl',
      });

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ exitReason: 'sl' }),
      );
    });

    it('exitReason="manual" supports admin override path', async () => {
      const store = createDrizzleCryptoPositionStore(db as never);

      await store.close('pos-1', {
        exitPrice: '3050.00000000',
        pnlUsd: '16.62',
        exitReason: 'manual',
      });

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ exitReason: 'manual' }),
      );
    });
  });
});
