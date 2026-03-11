/**
 * S7-INF-01: schema additions + store adapter tests
 * @task S7-INF-01
 *
 * unit tests with mocked drizzle client for:
 * - createDrizzleSecurityReportStore (create, findByToken, findRecent)
 * - createDrizzleContractStore (create, findById, updateStatus)
 * - createDrizzlePositionStore (create, findById, findOpen)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleSecurityReportStore } from '../src/adapters/security-report-store';
import {
  createDrizzleContractStore,
  createDrizzlePositionStore,
} from '../src/adapters/hr-stores';

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

  return builder;
}

function createMockDb(overrides?: {
  insertResult?: unknown;
  selectResult?: unknown;
}) {
  const insertBuilder = createMockQueryBuilder(overrides?.insertResult ?? [{ id: 'mock-uuid-001' }]);
  const selectBuilder = createMockQueryBuilder(overrides?.selectResult ?? []);
  const updateBuilder = createMockQueryBuilder();

  // select terminal resolves via where
  selectBuilder.where = vi.fn().mockResolvedValue(overrides?.selectResult ?? []);

  // support chaining: select().from().where().orderBy().limit()
  const chainableResult = {
    where: vi.fn().mockImplementation(() => {
      const afterWhere = {
        orderBy: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockResolvedValue(overrides?.selectResult ?? []),
        })),
        // also resolve directly for simple where-only queries
        then: (resolve: (v: unknown) => void) => resolve(overrides?.selectResult ?? []),
        catch: vi.fn(),
      };
      return afterWhere;
    }),
  };

  selectBuilder.from = vi.fn().mockReturnValue(chainableResult);

  const db = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(updateBuilder),
    transaction: vi.fn(),
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
  };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// createDrizzleSecurityReportStore
// ===========================================================================

describe('createDrizzleSecurityReportStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('inserts a security report and returns { id }', async () => {
      db = createMockDb({ insertResult: [{ id: 'report-uuid-001' }] });
      const store = createDrizzleSecurityReportStore(db);

      const result = await store.create({
        tokenAddress: '0xabc123',
        chain: 'base',
        isHoneypot: false,
        isMintable: false,
        riskScore: 25,
      });

      expect(result).toEqual({ id: 'report-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleSecurityReportStore(db);

      await store.create({
        tokenAddress: '0xdef456',
        chain: 'arbitrum',
        liquidityUsd: '50000.00',
        isHoneypot: true,
        isMintable: false,
        ownershipRenounced: true,
        riskScore: 85,
        reasons: ['low liquidity', 'honeypot detected'],
        status: 'completed',
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        tokenAddress: '0xdef456',
        chain: 'arbitrum',
        liquidityUsd: '50000.00',
        isHoneypot: true,
        isMintable: false,
        ownershipRenounced: true,
        riskScore: 85,
        reasons: ['low liquidity', 'honeypot detected'],
        status: 'completed',
      });
    });
  });

  // -------------------------------------------------------------------------
  // findByToken
  // -------------------------------------------------------------------------

  describe('findByToken', () => {
    it('returns latest report for token+chain', async () => {
      const reportRow = {
        id: 'r-1',
        tokenAddress: '0xabc',
        chain: 'base',
        liquidityUsd: '100000.00',
        isHoneypot: false,
        isMintable: false,
        ownershipRenounced: true,
        riskScore: 15,
        reasons: [],
        status: 'completed',
        scannedAt: new Date('2026-03-11T00:00:00Z'),
      };
      db = createMockDb({ selectResult: [reportRow] });
      const store = createDrizzleSecurityReportStore(db);

      const result = await store.findByToken('0xabc', 'base');

      expect(result).toEqual(reportRow);
    });

    it('returns null when no report exists', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleSecurityReportStore(db);

      const result = await store.findByToken('0xnonexistent', 'base');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findRecent
  // -------------------------------------------------------------------------

  describe('findRecent', () => {
    it('returns report within TTL window', async () => {
      const reportRow = {
        id: 'r-2',
        tokenAddress: '0xabc',
        chain: 'base',
        liquidityUsd: '80000.00',
        isHoneypot: false,
        isMintable: false,
        ownershipRenounced: false,
        riskScore: 30,
        reasons: ['new contract'],
        status: 'completed',
        scannedAt: new Date(),
      };
      db = createMockDb({ selectResult: [reportRow] });
      const store = createDrizzleSecurityReportStore(db);

      const result = await store.findRecent('0xabc', 'base', 3600_000);

      expect(result).toEqual(reportRow);
    });

    it('returns null when report is expired', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleSecurityReportStore(db);

      const result = await store.findRecent('0xabc', 'base', 1000);

      expect(result).toBeNull();
    });
  });
});

// ===========================================================================
// createDrizzleContractStore
// ===========================================================================

describe('createDrizzleContractStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('inserts a contract and returns { id }', async () => {
      db = createMockDb({ insertResult: [{ id: 'contract-uuid-001' }] });
      const store = createDrizzleContractStore(db);

      const result = await store.create({
        candidateId: 'cand-1',
        templateSlug: 'employment-standard',
      });

      expect(result).toEqual({ id: 'contract-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleContractStore(db);

      await store.create({
        candidateId: 'cand-1',
        templateSlug: 'contractor-agreement',
        terms: { salary: 120000, currency: 'USD' },
        version: 2,
        status: 'review',
        complianceFlags: ['gdpr-consent'],
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        candidateId: 'cand-1',
        templateSlug: 'contractor-agreement',
        terms: { salary: 120000, currency: 'USD' },
        version: 2,
        status: 'review',
        complianceFlags: ['gdpr-consent'],
      });
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns contract record when found', async () => {
      const contractRow = {
        id: 'c-1',
        candidateId: 'cand-1',
        templateSlug: 'employment-standard',
        terms: { salary: 100000 },
        version: 1,
        status: 'drafting',
        complianceFlags: [],
        createdAt: new Date('2026-03-10'),
      };
      db = createMockDb({ selectResult: [contractRow] });
      const store = createDrizzleContractStore(db);

      const result = await store.findById('c-1');

      expect(result).toEqual(contractRow);
    });

    it('returns null when not found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleContractStore(db);

      const result = await store.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateStatus
  // -------------------------------------------------------------------------

  describe('updateStatus', () => {
    it('updates status and updatedAt for the given id', async () => {
      const store = createDrizzleContractStore(db);

      await store.updateStatus('c-1', 'signed');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.status).toBe('signed');
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });
  });
});

// ===========================================================================
// createDrizzlePositionStore
// ===========================================================================

describe('createDrizzlePositionStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('inserts a position and returns { id }', async () => {
      db = createMockDb({ insertResult: [{ id: 'pos-uuid-001' }] });
      const store = createDrizzlePositionStore(db);

      const result = await store.create({
        title: 'Senior Engineer',
      });

      expect(result).toEqual({ id: 'pos-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzlePositionStore(db);

      await store.create({
        title: 'Product Manager',
        clientId: 'client-1',
        requirements: ['5+ years PM', 'B2B SaaS'],
        status: 'open',
        slaBusinessDays: 20,
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        title: 'Product Manager',
        clientId: 'client-1',
        requirements: ['5+ years PM', 'B2B SaaS'],
        status: 'open',
        slaBusinessDays: 20,
      });
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns position record when found', async () => {
      const positionRow = {
        id: 'pos-1',
        title: 'Senior Engineer',
        clientId: 'client-1',
        requirements: ['typescript', 'node'],
        status: 'open',
        slaBusinessDays: 30,
      };
      db = createMockDb({ selectResult: [positionRow] });
      const store = createDrizzlePositionStore(db);

      const result = await store.findById('pos-1');

      expect(result).toEqual(positionRow);
    });

    it('returns null when not found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzlePositionStore(db);

      const result = await store.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findOpen
  // -------------------------------------------------------------------------

  describe('findOpen', () => {
    it('returns open positions only', async () => {
      const rows = [
        { id: 'pos-1', title: 'Engineer', clientId: null, requirements: [], status: 'open', slaBusinessDays: 30 },
        { id: 'pos-2', title: 'Designer', clientId: 'c-1', requirements: ['figma'], status: 'open', slaBusinessDays: 20 },
      ];
      db = createMockDb({ selectResult: rows });
      const store = createDrizzlePositionStore(db);

      const result = await store.findOpen();

      expect(result).toHaveLength(2);
      expect(result[0]!.title).toBe('Engineer');
      expect(result[1]!.title).toBe('Designer');
    });

    it('returns empty array when no open positions', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzlePositionStore(db);

      const result = await store.findOpen();

      expect(result).toEqual([]);
    });
  });
});
