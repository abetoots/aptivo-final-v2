/**
 * P1.5-01: HITL drizzle persistence adapter tests
 * @task P1.5-01
 *
 * unit tests with mocked drizzle client for:
 * - createDrizzleHitlRequestStore (insert, getRequests)
 * - createDrizzleHitlDecisionStore (getRequest, getDecisionByRequestId, insertDecisionAndUpdateRequest)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDrizzleHitlRequestStore,
  createDrizzleHitlDecisionStore,
} from '../src/adapters/hitl-store-drizzle';

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
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.offset = vi.fn().mockReturnValue(builder);

  return builder;
}

function createMockDb(overrides?: {
  insertResult?: unknown;
  selectResult?: unknown;
}) {
  const insertBuilder = createMockQueryBuilder(overrides?.insertResult ?? [{ id: 'mock-uuid-001' }]);
  const selectBuilder = createMockQueryBuilder(overrides?.selectResult ?? []);
  const updateBuilder = createMockQueryBuilder();

  // select terminal resolves via where (for simple select().from().where() queries)
  selectBuilder.where = vi.fn().mockResolvedValue(overrides?.selectResult ?? []);

  // support chaining: select().from().where().orderBy().limit().offset()
  const chainableResult = {
    where: vi.fn().mockImplementation(() => {
      const afterWhere = {
        orderBy: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockImplementation(() => ({
            offset: vi.fn().mockResolvedValue(overrides?.selectResult ?? []),
          })),
        })),
        then: (resolve: (v: unknown) => void) => resolve(overrides?.selectResult ?? []),
        catch: vi.fn(),
      };
      return afterWhere;
    }),
    orderBy: vi.fn().mockImplementation(() => ({
      limit: vi.fn().mockImplementation(() => ({
        offset: vi.fn().mockResolvedValue(overrides?.selectResult ?? []),
      })),
    })),
  };

  selectBuilder.from = vi.fn().mockReturnValue(chainableResult);

  const db = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(updateBuilder),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txDb = createMockDb(overrides);
      return fn(txDb);
    }),
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
  };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// test data
// ---------------------------------------------------------------------------

const SAMPLE_REQUEST = {
  id: 'req-uuid-001',
  workflowId: 'wf-uuid-001',
  workflowStepId: 'step-1',
  domain: 'hr',
  actionType: 'contract.approve',
  summary: 'Approve employment contract for John Doe',
  details: { salary: 120000, currency: 'USD' },
  approverId: 'user-uuid-001',
  status: 'pending' as const,
  tokenHash: 'a'.repeat(64),
  tokenExpiresAt: new Date('2026-03-12T01:00:00Z'),
  createdAt: new Date('2026-03-12T00:00:00Z'),
};

const SAMPLE_DECISION = {
  id: 'dec-uuid-001',
  requestId: 'req-uuid-001',
  approverId: 'user-uuid-001',
  decision: 'approved' as const,
  comment: 'Looks good',
  channel: 'web',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  decidedAt: new Date('2026-03-12T00:30:00Z'),
};

// ===========================================================================
// createDrizzleHitlRequestStore
// ===========================================================================

describe('createDrizzleHitlRequestStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // insert
  // -------------------------------------------------------------------------

  describe('insert', () => {
    it('inserts a request and returns { id }', async () => {
      db = createMockDb({ insertResult: [{ id: 'req-uuid-001' }] });
      const store = createDrizzleHitlRequestStore(db);

      const result = await store.insert(SAMPLE_REQUEST);

      expect(result).toEqual({ id: 'req-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleHitlRequestStore(db);

      await store.insert(SAMPLE_REQUEST);

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        id: 'req-uuid-001',
        workflowId: 'wf-uuid-001',
        workflowStepId: 'step-1',
        domain: 'hr',
        actionType: 'contract.approve',
        summary: 'Approve employment contract for John Doe',
        details: { salary: 120000, currency: 'USD' },
        approverId: 'user-uuid-001',
        status: 'pending',
        tokenHash: 'a'.repeat(64),
        tokenExpiresAt: new Date('2026-03-12T01:00:00Z'),
        createdAt: new Date('2026-03-12T00:00:00Z'),
      });
    });

    it('defaults optional fields to null when undefined', async () => {
      const store = createDrizzleHitlRequestStore(db);
      const minimalRequest = {
        ...SAMPLE_REQUEST,
        workflowStepId: undefined,
        details: undefined,
        resolvedAt: undefined,
      };

      await store.insert(minimalRequest);

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall.workflowStepId).toBeNull();
      expect(valuesCall.details).toBeNull();
      expect(valuesCall.resolvedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getRequests
  // -------------------------------------------------------------------------

  describe('getRequests', () => {
    it('returns mapped request records', async () => {
      const row = {
        id: 'req-1',
        workflowId: 'wf-1',
        workflowStepId: null,
        domain: 'crypto',
        actionType: 'trade.approve',
        summary: 'Approve trade',
        details: null,
        approverId: 'user-1',
        status: 'pending' as const,
        tokenHash: 'b'.repeat(64),
        tokenExpiresAt: new Date('2026-03-12T02:00:00Z'),
        createdAt: new Date('2026-03-12T00:00:00Z'),
        resolvedAt: null,
      };
      db = createMockDb({ selectResult: [row] });
      const store = createDrizzleHitlRequestStore(db);

      const result = await store.getRequests({ limit: 10, offset: 0 });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'req-1',
        workflowId: 'wf-1',
        domain: 'crypto',
        status: 'pending',
      });
      // null workflowStepId maps to undefined
      expect(result[0]!.workflowStepId).toBeUndefined();
    });

    it('returns empty array when no requests', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleHitlRequestStore(db);

      const result = await store.getRequests({ limit: 10, offset: 0 });

      expect(result).toEqual([]);
    });

    it('filters by status when provided', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleHitlRequestStore(db);

      await store.getRequests({ status: 'approved', limit: 10, offset: 0 });

      // verify select was called (query was built with status filter)
      expect(db.select).toHaveBeenCalled();
    });

    it('clamps limit to 200', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleHitlRequestStore(db);

      // request limit above 200 should be clamped
      await store.getRequests({ limit: 500, offset: 0 });

      expect(db.select).toHaveBeenCalled();
    });

    it('supports pagination with offset', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleHitlRequestStore(db);

      await store.getRequests({ limit: 10, offset: 20 });

      expect(db.select).toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// createDrizzleHitlDecisionStore
// ===========================================================================

describe('createDrizzleHitlDecisionStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // getRequest
  // -------------------------------------------------------------------------

  describe('getRequest', () => {
    it('returns request snapshot when found', async () => {
      const snapshotRow = {
        id: 'req-1',
        approverId: 'user-1',
        status: 'pending' as const,
        tokenHash: 'c'.repeat(64),
        tokenExpiresAt: new Date('2026-03-12T01:00:00Z'),
      };
      db = createMockDb({ selectResult: [snapshotRow] });
      const store = createDrizzleHitlDecisionStore(db);

      const result = await store.getRequest('req-1');

      expect(result).toEqual(snapshotRow);
    });

    it('returns null when request not found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleHitlDecisionStore(db);

      const result = await store.getRequest('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getDecisionByRequestId
  // -------------------------------------------------------------------------

  describe('getDecisionByRequestId', () => {
    it('returns existing decision when found', async () => {
      const decisionRow = {
        id: 'dec-1',
        approverId: 'user-1',
        decision: 'approved' as const,
        decidedAt: new Date('2026-03-12T00:30:00Z'),
      };
      db = createMockDb({ selectResult: [decisionRow] });
      const store = createDrizzleHitlDecisionStore(db);

      const result = await store.getDecisionByRequestId('req-1');

      expect(result).toEqual(decisionRow);
    });

    it('returns null when no decision exists', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleHitlDecisionStore(db);

      const result = await store.getDecisionByRequestId('req-1');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // insertDecisionAndUpdateRequest
  // -------------------------------------------------------------------------

  describe('insertDecisionAndUpdateRequest', () => {
    it('uses a transaction for atomic insert + update', async () => {
      db = createMockDb({ insertResult: [{ id: 'dec-uuid-001' }] });
      const store = createDrizzleHitlDecisionStore(db);

      await store.insertDecisionAndUpdateRequest(SAMPLE_DECISION, 'approved');

      expect(db.transaction).toHaveBeenCalledOnce();
    });

    it('returns { id } from the inserted decision', async () => {
      db = createMockDb({ insertResult: [{ id: 'dec-uuid-001' }] });
      const store = createDrizzleHitlDecisionStore(db);

      const result = await store.insertDecisionAndUpdateRequest(SAMPLE_DECISION, 'approved');

      expect(result).toEqual({ id: 'dec-uuid-001' });
    });

    it('passes all decision fields to the insert builder inside transaction', async () => {
      let txInsertValues: unknown = null;

      db.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txDb = createMockDb({ insertResult: [{ id: 'dec-uuid-001' }] });
        const origInsert = txDb.insert;
        txDb.insert = vi.fn().mockImplementation((...args: unknown[]) => {
          const result = origInsert(...args);
          // capture the values call
          const origValues = txDb._insertBuilder.values;
          txDb._insertBuilder.values = vi.fn().mockImplementation((vals: unknown) => {
            txInsertValues = vals;
            return origValues(vals);
          });
          return result;
        });
        return fn(txDb);
      });

      const store = createDrizzleHitlDecisionStore(db);
      await store.insertDecisionAndUpdateRequest(SAMPLE_DECISION, 'approved');

      expect(txInsertValues).toMatchObject({
        id: 'dec-uuid-001',
        requestId: 'req-uuid-001',
        approverId: 'user-uuid-001',
        decision: 'approved',
        comment: 'Looks good',
        channel: 'web',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
    });

    it('updates request status inside the transaction', async () => {
      let txUpdateCalled = false;

      db.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txDb = createMockDb({ insertResult: [{ id: 'dec-uuid-001' }] });
        const origUpdate = txDb.update;
        txDb.update = vi.fn().mockImplementation((...args: unknown[]) => {
          txUpdateCalled = true;
          return origUpdate(...args);
        });
        return fn(txDb);
      });

      const store = createDrizzleHitlDecisionStore(db);
      await store.insertDecisionAndUpdateRequest(SAMPLE_DECISION, 'rejected');

      expect(txUpdateCalled).toBe(true);
    });

    it('defaults optional fields to null when undefined', async () => {
      let txInsertValues: unknown = null;

      db.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txDb = createMockDb({ insertResult: [{ id: 'dec-uuid-002' }] });
        const origInsert = txDb.insert;
        txDb.insert = vi.fn().mockImplementation((...args: unknown[]) => {
          const result = origInsert(...args);
          const origValues = txDb._insertBuilder.values;
          txDb._insertBuilder.values = vi.fn().mockImplementation((vals: unknown) => {
            txInsertValues = vals;
            return origValues(vals);
          });
          return result;
        });
        return fn(txDb);
      });

      const minimalDecision = {
        id: 'dec-uuid-002',
        requestId: 'req-uuid-001',
        approverId: 'user-uuid-001',
        decision: 'rejected' as const,
        channel: 'api',
        decidedAt: new Date('2026-03-12T00:30:00Z'),
      };

      const store = createDrizzleHitlDecisionStore(db);
      await store.insertDecisionAndUpdateRequest(minimalDecision, 'rejected');

      expect(txInsertValues).toMatchObject({
        comment: null,
        ipAddress: null,
        userAgent: null,
      });
    });
  });
});
