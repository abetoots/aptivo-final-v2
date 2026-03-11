/**
 * S6-INF-CRY: Crypto domain Drizzle adapter tests
 * @task S6-INF-CRY
 *
 * unit tests with mocked drizzle client for:
 * - createDrizzleWalletStore (create, findById, findAll, setEnabled)
 * - createDrizzleTradeSignalStore (create, findPending, updateStatus, findById)
 * - createDrizzleTradeExecutionStore (create, findOpen, close, findById)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDrizzleWalletStore,
  createDrizzleTradeSignalStore,
  createDrizzleTradeExecutionStore,
} from '../src/adapters/crypto-stores.js';

// ---------------------------------------------------------------------------
// mock drizzle builder helpers
// ---------------------------------------------------------------------------

function createMockQueryBuilder(resolvedValue: unknown = []) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};

  // terminal: returning resolves with value
  builder.returning = vi.fn().mockResolvedValue(resolvedValue);

  // chaining methods
  builder.values = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);

  return builder;
}

function createMockDb(overrides?: {
  insertResult?: unknown;
  selectResult?: unknown;
}) {
  const insertBuilder = createMockQueryBuilder(overrides?.insertResult ?? [{ id: 'mock-uuid-001' }]);
  const selectBuilder = createMockQueryBuilder(overrides?.selectResult ?? []);
  const updateBuilder = createMockQueryBuilder();

  // select().from() chain should resolve with selectResult when awaited
  selectBuilder.from = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(overrides?.selectResult ?? []),
  });

  // select().from() without where (findAll) should resolve directly
  const fromMock = selectBuilder.from as ReturnType<typeof vi.fn>;
  fromMock.mockImplementation(() => {
    const chainable = {
      where: vi.fn().mockResolvedValue(overrides?.selectResult ?? []),
      then: (resolve: (v: unknown) => void) => resolve(overrides?.selectResult ?? []),
    };
    return chainable;
  });

  const db = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(updateBuilder),
    transaction: vi.fn(),
    // expose builders for assertions
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
  };

  return db;
}

// ===========================================================================
// createDrizzleWalletStore
// ===========================================================================

describe('createDrizzleWalletStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('inserts a wallet and returns { id }', async () => {
      db = createMockDb({ insertResult: [{ id: 'wallet-uuid-001' }] });
      const store = createDrizzleWalletStore(db);

      const result = await store.create({
        address: '0xabc123',
        chain: 'base',
        label: 'hot wallet',
      });

      expect(result).toEqual({ id: 'wallet-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleWalletStore(db);

      await store.create({
        address: '0xdef456',
        chain: 'arbitrum',
        label: 'cold wallet',
        thresholdUsd: '50000',
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        address: '0xdef456',
        chain: 'arbitrum',
        label: 'cold wallet',
        thresholdUsd: '50000',
      });
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns wallet record when found', async () => {
      const walletRow = {
        id: 'w-1',
        address: '0xabc',
        chain: 'base',
        label: 'main',
        thresholdUsd: '10000',
        isEnabled: true,
      };
      db = createMockDb({ selectResult: [walletRow] });
      const store = createDrizzleWalletStore(db);

      const result = await store.findById('w-1');

      expect(result).toEqual(walletRow);
    });

    it('returns null when not found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleWalletStore(db);

      const result = await store.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns all wallet records', async () => {
      const rows = [
        { id: 'w-1', address: '0xabc', chain: 'base', label: null, thresholdUsd: '10000', isEnabled: true },
        { id: 'w-2', address: '0xdef', chain: 'arbitrum', label: 'cold', thresholdUsd: '50000', isEnabled: false },
      ];
      db = createMockDb({ selectResult: rows });
      const store = createDrizzleWalletStore(db);

      const result = await store.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]!.address).toBe('0xabc');
      expect(result[1]!.chain).toBe('arbitrum');
    });

    it('returns empty array when no wallets exist', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleWalletStore(db);

      const result = await store.findAll();

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // setEnabled
  // -------------------------------------------------------------------------

  describe('setEnabled', () => {
    it('updates isEnabled and updatedAt for the given id', async () => {
      const store = createDrizzleWalletStore(db);

      await store.setEnabled('w-1', false);

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.isEnabled).toBe(false);
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });

    it('sets isEnabled to true when re-enabling', async () => {
      const store = createDrizzleWalletStore(db);

      await store.setEnabled('w-1', true);

      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.isEnabled).toBe(true);
    });
  });
});

// ===========================================================================
// createDrizzleTradeSignalStore
// ===========================================================================

describe('createDrizzleTradeSignalStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('inserts a signal and returns { id }', async () => {
      db = createMockDb({ insertResult: [{ id: 'signal-uuid-001' }] });
      const store = createDrizzleTradeSignalStore(db);

      const result = await store.create({
        token: 'ETH',
        direction: 'long',
        entryZone: '3200.50000000',
        stopLoss: '3100.00000000',
        takeProfit: '3500.00000000',
        reasoning: 'breakout pattern',
        confidenceScore: '85.00',
        status: 'pending',
      });

      expect(result).toEqual({ id: 'signal-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleTradeSignalStore(db);

      await store.create({
        token: 'BTC',
        direction: 'short',
        status: 'pending',
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        token: 'BTC',
        direction: 'short',
        status: 'pending',
      });
    });
  });

  // -------------------------------------------------------------------------
  // findPending
  // -------------------------------------------------------------------------

  describe('findPending', () => {
    it('returns signals with status = pending', async () => {
      const signalRow = {
        id: 's-1',
        token: 'ETH',
        direction: 'long',
        entryZone: '3200.00000000',
        stopLoss: null,
        takeProfit: null,
        reasoning: null,
        confidenceScore: '80.00',
        status: 'pending',
        expiresAt: null,
        createdAt: new Date('2026-03-11T00:00:00Z'),
      };
      db = createMockDb({ selectResult: [signalRow] });
      const store = createDrizzleTradeSignalStore(db);

      const results = await store.findPending();

      expect(results).toHaveLength(1);
      expect(results[0]!.token).toBe('ETH');
      expect(results[0]!.status).toBe('pending');
    });

    it('returns empty array when no pending signals', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleTradeSignalStore(db);

      const results = await store.findPending();

      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // updateStatus
  // -------------------------------------------------------------------------

  describe('updateStatus', () => {
    it('updates status to approved for the given id', async () => {
      const store = createDrizzleTradeSignalStore(db);

      await store.updateStatus('s-1', 'approved');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.status).toBe('approved');
    });

    it('updates status to rejected for the given id', async () => {
      const store = createDrizzleTradeSignalStore(db);

      await store.updateStatus('s-2', 'rejected');

      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.status).toBe('rejected');
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns signal record when found', async () => {
      const signalRow = {
        id: 's-1',
        token: 'SOL',
        direction: 'long',
        entryZone: '150.00000000',
        stopLoss: '140.00000000',
        takeProfit: '180.00000000',
        reasoning: 'momentum play',
        confidenceScore: '72.50',
        status: 'approved',
        expiresAt: new Date('2026-03-12T00:00:00Z'),
        createdAt: new Date('2026-03-11T00:00:00Z'),
      };
      db = createMockDb({ selectResult: [signalRow] });
      const store = createDrizzleTradeSignalStore(db);

      const result = await store.findById('s-1');

      expect(result).toEqual(signalRow);
    });

    it('returns null when not found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleTradeSignalStore(db);

      const result = await store.findById('nonexistent');

      expect(result).toBeNull();
    });
  });
});

// ===========================================================================
// createDrizzleTradeExecutionStore
// ===========================================================================

describe('createDrizzleTradeExecutionStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('inserts an execution and returns { id }', async () => {
      db = createMockDb({ insertResult: [{ id: 'exec-uuid-001' }] });
      const store = createDrizzleTradeExecutionStore(db);

      const result = await store.create({
        signalId: 's-1',
        exchange: 'hyperliquid',
        entryPrice: '3200.50000000',
        sizeUsd: '1000.00',
        status: 'open',
        isPaper: true,
      });

      expect(result).toEqual({ id: 'exec-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields including riskData to the insert builder', async () => {
      const store = createDrizzleTradeExecutionStore(db);

      await store.create({
        signalId: 's-2',
        exchange: 'binance',
        status: 'open',
        isPaper: false,
        riskData: { leverage: 2, maxLoss: '500' },
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        signalId: 's-2',
        exchange: 'binance',
        status: 'open',
        isPaper: false,
        riskData: { leverage: 2, maxLoss: '500' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // findOpen
  // -------------------------------------------------------------------------

  describe('findOpen', () => {
    it('returns executions with status = open', async () => {
      const execRow = {
        id: 'e-1',
        signalId: 's-1',
        exchange: 'hyperliquid',
        entryPrice: '3200.00000000',
        exitPrice: null,
        sizeUsd: '1000.00',
        pnlUsd: null,
        status: 'open',
        isPaper: true,
        riskData: null,
        openedAt: new Date('2026-03-11T00:00:00Z'),
        closedAt: null,
      };
      db = createMockDb({ selectResult: [execRow] });
      const store = createDrizzleTradeExecutionStore(db);

      const results = await store.findOpen();

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('open');
      expect(results[0]!.isPaper).toBe(true);
    });

    it('returns empty array when no open executions', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleTradeExecutionStore(db);

      const results = await store.findOpen();

      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // close
  // -------------------------------------------------------------------------

  describe('close', () => {
    it('updates execution with exitPrice, pnlUsd, closed status, and closedAt', async () => {
      const store = createDrizzleTradeExecutionStore(db);

      await store.close('e-1', '3400.00000000', '200.00');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.exitPrice).toBe('3400.00000000');
      expect(setCall.pnlUsd).toBe('200.00');
      expect(setCall.status).toBe('closed');
      expect(setCall.closedAt).toBeInstanceOf(Date);
    });

    it('sets negative pnlUsd for losing trades', async () => {
      const store = createDrizzleTradeExecutionStore(db);

      await store.close('e-2', '3000.00000000', '-200.00');

      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.pnlUsd).toBe('-200.00');
      expect(setCall.status).toBe('closed');
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns execution record when found', async () => {
      const execRow = {
        id: 'e-1',
        signalId: 's-1',
        exchange: 'hyperliquid',
        entryPrice: '3200.00000000',
        exitPrice: '3400.00000000',
        sizeUsd: '1000.00',
        pnlUsd: '200.00',
        status: 'closed',
        isPaper: true,
        riskData: { leverage: 1 },
        openedAt: new Date('2026-03-11T00:00:00Z'),
        closedAt: new Date('2026-03-11T12:00:00Z'),
      };
      db = createMockDb({ selectResult: [execRow] });
      const store = createDrizzleTradeExecutionStore(db);

      const result = await store.findById('e-1');

      expect(result).toEqual(execRow);
    });

    it('returns null when not found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleTradeExecutionStore(db);

      const result = await store.findById('nonexistent');

      expect(result).toBeNull();
    });
  });
});
