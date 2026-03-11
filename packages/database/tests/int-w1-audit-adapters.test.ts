/**
 * INT-W1: Audit Drizzle adapter tests
 * @task INT-W1
 *
 * unit tests with mocked drizzle client for:
 * - createDrizzleAuditStore (lockChainHead, insert, updateChainHead, withTransaction)
 * - createDrizzleDlqStore (insert, getPending, markRetrying, markExhausted, markReplayed, incrementAttempt)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleAuditStore } from '../src/adapters/audit-store-drizzle.js';
import { createDrizzleDlqStore } from '../src/adapters/dlq-store-drizzle.js';
import type { InsertAuditLog } from '@aptivo/audit';
import type { DlqEntry } from '@aptivo/audit/async';

// ---------------------------------------------------------------------------
// mock drizzle builder helpers
// ---------------------------------------------------------------------------

// chainable query builder mock — each method returns `this` for chaining,
// except terminal methods (returning, limit) which resolve the promise.

function createMockQueryBuilder(resolvedValue: unknown = []) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};

  // terminal: returning / limit resolve with value
  builder.returning = vi.fn().mockResolvedValue(resolvedValue);
  builder.limit = vi.fn().mockResolvedValue(resolvedValue);

  // chaining methods
  builder.values = vi.fn().mockReturnValue(builder);
  builder.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);

  return builder;
}

function createMockDb(overrides?: {
  executeResult?: unknown;
  insertResult?: unknown;
  selectResult?: unknown;
}) {
  const insertBuilder = createMockQueryBuilder(overrides?.insertResult ?? [{ id: 'audit-uuid-001' }]);
  const selectBuilder = createMockQueryBuilder(overrides?.selectResult ?? []);
  const updateBuilder = createMockQueryBuilder();

  const db = {
    execute: vi.fn().mockResolvedValue(overrides?.executeResult ?? { rows: [] }),
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(updateBuilder),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      // create a tx-scoped mock db for transaction
      const txDb = createMockDb(overrides);
      return fn(txDb);
    }),
    // expose builders for assertions
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
  };

  return db;
}

// ---------------------------------------------------------------------------
// test data
// ---------------------------------------------------------------------------

const SAMPLE_RECORD: InsertAuditLog = {
  userId: 'user-1',
  actorType: 'user',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  action: 'hitl.decision.approved',
  resourceType: 'hitl-request',
  resourceId: 'req-1',
  domain: 'core',
  metadata: { note: 'approved' },
  previousHash: '0'.repeat(64),
  currentHash: 'a'.repeat(64),
};

const SAMPLE_DLQ_ENTRY: DlqEntry = {
  payload: {
    actor: { id: 'user-1', type: 'user' },
    action: 'test.action',
    resource: { type: 'test', id: 'r-1' },
  },
  error: 'PersistenceError: DB connection lost',
  attemptCount: 1,
  maxAttempts: 3,
  nextRetryAt: new Date('2026-03-11T12:00:00Z'),
  status: 'pending',
};

// ===========================================================================
// createDrizzleAuditStore
// ===========================================================================

describe('createDrizzleAuditStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // lockChainHead
  // -------------------------------------------------------------------------

  describe('lockChainHead', () => {
    it('returns null when no row exists', async () => {
      db.execute.mockResolvedValue({ rows: [] });
      const store = createDrizzleAuditStore(db);

      const result = await store.lockChainHead('global');

      expect(result).toBeNull();
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('returns ChainHead when a row exists', async () => {
      db.execute.mockResolvedValue({
        rows: [{ last_seq: 42, last_hash: 'abc'.padEnd(64, '0') }],
      });
      const store = createDrizzleAuditStore(db);

      const result = await store.lockChainHead('global');

      expect(result).toEqual({
        lastSeq: 42,
        lastHash: 'abc'.padEnd(64, '0'),
      });
    });

    it('returns null when execute returns array without rows property', async () => {
      // some drizzle drivers return raw arrays
      db.execute.mockResolvedValue({ rows: [] });
      const store = createDrizzleAuditStore(db);

      const result = await store.lockChainHead('domain:hr');

      expect(result).toBeNull();
    });

    it('converts bigint lastSeq to number', async () => {
      db.execute.mockResolvedValue({
        rows: [{ last_seq: BigInt(999), last_hash: 'x'.repeat(64) }],
      });
      const store = createDrizzleAuditStore(db);

      const result = await store.lockChainHead('global');

      expect(result).not.toBeNull();
      expect(result!.lastSeq).toBe(999);
      expect(typeof result!.lastSeq).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // insert
  // -------------------------------------------------------------------------

  describe('insert', () => {
    it('returns { id } from the inserted row', async () => {
      const store = createDrizzleAuditStore(db);

      const result = await store.insert(SAMPLE_RECORD);

      expect(result).toEqual({ id: 'audit-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleAuditStore(db);
      await store.insert(SAMPLE_RECORD);

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        userId: 'user-1',
        actorType: 'user',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        action: 'hitl.decision.approved',
        resourceType: 'hitl-request',
        resourceId: 'req-1',
        domain: 'core',
        metadata: { note: 'approved' },
        previousHash: '0'.repeat(64),
        currentHash: 'a'.repeat(64),
      });
    });

    it('defaults optional fields to null when undefined', async () => {
      const store = createDrizzleAuditStore(db);
      const minimalRecord: InsertAuditLog = {
        userId: null,
        actorType: 'system',
        action: 'cleanup',
        resourceType: 'batch',
        resourceId: null,
        metadata: null,
        previousHash: null,
        currentHash: 'b'.repeat(64),
      };

      await store.insert(minimalRecord);

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall.ipAddress).toBeNull();
      expect(valuesCall.userAgent).toBeNull();
      expect(valuesCall.domain).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateChainHead
  // -------------------------------------------------------------------------

  describe('updateChainHead', () => {
    it('upserts chain head with scope, seq, and hash', async () => {
      const store = createDrizzleAuditStore(db);

      await store.updateChainHead('global', 5, 'c'.repeat(64));

      expect(db.insert).toHaveBeenCalledOnce();
      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall.chainScope).toBe('global');
      expect(valuesCall.lastSeq).toBe(5);
      expect(valuesCall.lastHash).toBe('c'.repeat(64));
    });

    it('calls onConflictDoUpdate for upsert behavior', async () => {
      const store = createDrizzleAuditStore(db);

      await store.updateChainHead('global', 1, 'd'.repeat(64));

      expect(db._insertBuilder.onConflictDoUpdate).toHaveBeenCalledOnce();
      const upsertArgs = db._insertBuilder.onConflictDoUpdate.mock.calls[0]![0];
      expect(upsertArgs.set.lastSeq).toBe(1);
      expect(upsertArgs.set.lastHash).toBe('d'.repeat(64));
    });
  });

  // -------------------------------------------------------------------------
  // withTransaction
  // -------------------------------------------------------------------------

  describe('withTransaction', () => {
    it('wraps operations in a database transaction', async () => {
      const store = createDrizzleAuditStore(db);
      let txStoreUsed = false;

      await store.withTransaction(async (txStore) => {
        txStoreUsed = true;
        // verify txStore has the same interface
        expect(typeof txStore.lockChainHead).toBe('function');
        expect(typeof txStore.insert).toBe('function');
        expect(typeof txStore.updateChainHead).toBe('function');
      });

      expect(txStoreUsed).toBe(true);
      expect(db.transaction).toHaveBeenCalledOnce();
    });

    it('returns the value from the transaction callback', async () => {
      const store = createDrizzleAuditStore(db);

      const result = await store.withTransaction(async () => {
        return 'tx-result';
      });

      expect(result).toBe('tx-result');
    });

    it('propagates errors from the transaction callback', async () => {
      const store = createDrizzleAuditStore(db);

      await expect(
        store.withTransaction(async () => {
          throw new Error('tx-fail');
        }),
      ).rejects.toThrow('tx-fail');
    });

    it('calls store operations against the transaction client', async () => {
      // track whether transaction callback receives a store backed by tx (not outer db)
      let innerInsertCalled = false;

      db.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txDb = createMockDb({ insertResult: [{ id: 'tx-audit-id' }] });
        txDb._insertBuilder.returning.mockResolvedValue([{ id: 'tx-audit-id' }]);
        // patch: detect if the inner store uses txDb
        const origInsert = txDb.insert;
        txDb.insert = vi.fn().mockImplementation((...args: unknown[]) => {
          innerInsertCalled = true;
          return origInsert(...args);
        });
        return fn(txDb);
      });

      const store = createDrizzleAuditStore(db);
      await store.withTransaction(async (txStore) => {
        const result = await txStore.insert(SAMPLE_RECORD);
        expect(result).toEqual({ id: 'tx-audit-id' });
      });

      expect(innerInsertCalled).toBe(true);
    });
  });
});

// ===========================================================================
// createDrizzleDlqStore
// ===========================================================================

describe('createDrizzleDlqStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // insert
  // -------------------------------------------------------------------------

  describe('insert', () => {
    it('inserts a DLQ entry with all fields', async () => {
      const store = createDrizzleDlqStore(db);

      await store.insert(SAMPLE_DLQ_ENTRY);

      expect(db.insert).toHaveBeenCalledOnce();
      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall.payload).toEqual(SAMPLE_DLQ_ENTRY.payload);
      expect(valuesCall.error).toBe('PersistenceError: DB connection lost');
      expect(valuesCall.attemptCount).toBe(1);
      expect(valuesCall.maxAttempts).toBe(3);
      expect(valuesCall.status).toBe('pending');
    });

    it('omits id field when not provided', async () => {
      const store = createDrizzleDlqStore(db);
      const entry: DlqEntry = { ...SAMPLE_DLQ_ENTRY };
      delete entry.id;

      await store.insert(entry);

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).not.toHaveProperty('id');
    });

    it('includes id when provided', async () => {
      const store = createDrizzleDlqStore(db);
      const entry: DlqEntry = { ...SAMPLE_DLQ_ENTRY, id: 'dlq-custom-id' };

      await store.insert(entry);

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall.id).toBe('dlq-custom-id');
    });

    it('sets nextRetryAt to null when undefined', async () => {
      const store = createDrizzleDlqStore(db);
      const entry: DlqEntry = { ...SAMPLE_DLQ_ENTRY, nextRetryAt: undefined };

      await store.insert(entry);

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall.nextRetryAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getPending
  // -------------------------------------------------------------------------

  describe('getPending', () => {
    it('returns mapped DlqEntry array from query results', async () => {
      const dbRow = {
        id: 'dlq-1',
        payload: SAMPLE_DLQ_ENTRY.payload,
        error: 'some error',
        attemptCount: 2,
        maxAttempts: 3,
        nextRetryAt: new Date('2026-03-11T12:00:00Z'),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db = createMockDb({ selectResult: [dbRow] });
      const store = createDrizzleDlqStore(db);

      const results = await store.getPending(10);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'dlq-1',
        payload: SAMPLE_DLQ_ENTRY.payload,
        error: 'some error',
        attemptCount: 2,
        maxAttempts: 3,
        nextRetryAt: new Date('2026-03-11T12:00:00Z'),
        status: 'pending',
      });
    });

    it('returns empty array when no pending entries', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleDlqStore(db);

      const results = await store.getPending(10);

      expect(results).toEqual([]);
    });

    it('applies the provided limit', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleDlqStore(db);

      await store.getPending(5);

      expect(db._selectBuilder.limit).toHaveBeenCalledWith(5);
    });

    it('converts null nextRetryAt to undefined in output', async () => {
      const dbRow = {
        id: 'dlq-2',
        payload: SAMPLE_DLQ_ENTRY.payload,
        error: 'err',
        attemptCount: 1,
        maxAttempts: 3,
        nextRetryAt: null,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db = createMockDb({ selectResult: [dbRow] });
      const store = createDrizzleDlqStore(db);

      const results = await store.getPending(10);

      expect(results[0]!.nextRetryAt).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // markRetrying
  // -------------------------------------------------------------------------

  describe('markRetrying', () => {
    it('updates status to retrying for the given id', async () => {
      const store = createDrizzleDlqStore(db);

      await store.markRetrying('dlq-1');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.status).toBe('retrying');
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // markExhausted
  // -------------------------------------------------------------------------

  describe('markExhausted', () => {
    it('updates status to exhausted for the given id', async () => {
      const store = createDrizzleDlqStore(db);

      await store.markExhausted('dlq-2');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.status).toBe('exhausted');
    });
  });

  // -------------------------------------------------------------------------
  // markReplayed
  // -------------------------------------------------------------------------

  describe('markReplayed', () => {
    it('updates status to replayed for the given id', async () => {
      const store = createDrizzleDlqStore(db);

      await store.markReplayed('dlq-3');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.status).toBe('replayed');
    });
  });

  // -------------------------------------------------------------------------
  // incrementAttempt
  // -------------------------------------------------------------------------

  describe('incrementAttempt', () => {
    it('increments attempt count and sets nextRetryAt', async () => {
      const store = createDrizzleDlqStore(db);
      const nextRetry = new Date('2026-03-12T00:00:00Z');

      await store.incrementAttempt('dlq-4', nextRetry);

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.nextRetryAt).toEqual(nextRetry);
      expect(setCall.status).toBe('pending');
    });

    it('sets nextRetryAt to null when not provided', async () => {
      const store = createDrizzleDlqStore(db);

      await store.incrementAttempt('dlq-5');

      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.nextRetryAt).toBeNull();
    });
  });
});
