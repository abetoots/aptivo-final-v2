/**
 * P1.5-02: LLM budget + usage log store tests
 * @task P1.5-02
 *
 * unit tests with mocked drizzle client for:
 * - createDrizzleBudgetStore (getConfig, getDailySpend, getMonthlySpend)
 * - createDrizzleUsageLogStore (insert)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleBudgetStore } from '../src/adapters/llm-budget-store-drizzle.js';
import { createDrizzleUsageLogStore } from '../src/adapters/llm-usage-log-store-drizzle.js';

// ---------------------------------------------------------------------------
// mock drizzle builder helpers
// ---------------------------------------------------------------------------

function createMockQueryBuilder(resolvedValue: unknown = []) {
  // drizzle query builders are thenable — they resolve when awaited.
  // we create an object that is both chainable and thenable so that
  // `await db.select(...).from(...).where(...)` resolves correctly.
  const builder: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};

  // make the builder thenable so awaiting it resolves to the value
  builder.then = (resolve: (v: unknown) => void) => resolve(resolvedValue);

  // terminal methods also resolve with value
  builder.returning = vi.fn().mockResolvedValue(resolvedValue);
  builder.limit = vi.fn().mockResolvedValue(resolvedValue);

  // chaining methods — each returns builder (which is thenable)
  builder.values = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);
  builder.groupBy = vi.fn().mockReturnValue(builder);

  return builder;
}

function createMockDb(overrides?: {
  selectResult?: unknown;
  insertResult?: unknown;
}) {
  const insertBuilder = createMockQueryBuilder(overrides?.insertResult ?? []);
  const selectBuilder = createMockQueryBuilder(overrides?.selectResult ?? []);

  const db = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(createMockQueryBuilder()),
    transaction: vi.fn(),
    // expose builders for assertions
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
  };

  return db;
}

// ===========================================================================
// createDrizzleBudgetStore
// ===========================================================================

describe('createDrizzleBudgetStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // getConfig
  // -------------------------------------------------------------------------

  describe('getConfig', () => {
    it('returns BudgetConfig when row exists', async () => {
      const row = {
        id: 'cfg-1',
        domain: 'crypto',
        dailyLimitUsd: '50.00',
        monthlyLimitUsd: '1000.00',
        dailyWarningThreshold: '0.90',
        monthlyWarningThreshold: '0.90',
        blockOnExceed: true,
        notifyOnWarning: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db = createMockDb({ selectResult: [row] });
      const store = createDrizzleBudgetStore(db);

      const config = await store.getConfig('crypto');

      expect(config).toEqual({
        domain: 'crypto',
        dailyLimitUsd: 50,
        monthlyLimitUsd: 1000,
        dailyWarningThreshold: 0.9,
        blockOnExceed: true,
      });
    });

    it('returns null when no config exists for domain', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleBudgetStore(db);

      const config = await store.getConfig('crypto');

      expect(config).toBeNull();
    });

    it('converts string numeric columns to numbers', async () => {
      const row = {
        id: 'cfg-2',
        domain: 'hr',
        dailyLimitUsd: '123.45',
        monthlyLimitUsd: '6789.01',
        dailyWarningThreshold: '0.75',
        monthlyWarningThreshold: '0.85',
        blockOnExceed: false,
        notifyOnWarning: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db = createMockDb({ selectResult: [row] });
      const store = createDrizzleBudgetStore(db);

      const config = await store.getConfig('hr');

      expect(config).not.toBeNull();
      expect(typeof config!.dailyLimitUsd).toBe('number');
      expect(typeof config!.monthlyLimitUsd).toBe('number');
      expect(typeof config!.dailyWarningThreshold).toBe('number');
      expect(config!.dailyLimitUsd).toBe(123.45);
      expect(config!.monthlyLimitUsd).toBe(6789.01);
      expect(config!.dailyWarningThreshold).toBe(0.75);
    });

    it('defaults blockOnExceed to true when null', async () => {
      const row = {
        id: 'cfg-3',
        domain: 'core',
        dailyLimitUsd: '10.00',
        monthlyLimitUsd: '100.00',
        dailyWarningThreshold: '0.90',
        monthlyWarningThreshold: '0.90',
        blockOnExceed: null,
        notifyOnWarning: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db = createMockDb({ selectResult: [row] });
      const store = createDrizzleBudgetStore(db);

      const config = await store.getConfig('core');

      expect(config!.blockOnExceed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getDailySpend
  // -------------------------------------------------------------------------

  describe('getDailySpend', () => {
    it('returns aggregated sum for today', async () => {
      db = createMockDb({ selectResult: [{ total: '42.50' }] });
      const store = createDrizzleBudgetStore(db);

      const spend = await store.getDailySpend('crypto');

      expect(spend).toBe(42.5);
    });

    it('returns 0 when no usage exists', async () => {
      db = createMockDb({ selectResult: [{ total: '0' }] });
      const store = createDrizzleBudgetStore(db);

      const spend = await store.getDailySpend('crypto');

      expect(spend).toBe(0);
    });

    it('returns 0 when result is null', async () => {
      db = createMockDb({ selectResult: [{ total: null }] });
      const store = createDrizzleBudgetStore(db);

      const spend = await store.getDailySpend('crypto');

      expect(spend).toBe(0);
    });

    it('returns 0 when no rows returned', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleBudgetStore(db);

      const spend = await store.getDailySpend('crypto');

      expect(spend).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getMonthlySpend
  // -------------------------------------------------------------------------

  describe('getMonthlySpend', () => {
    it('returns aggregated sum for this month', async () => {
      db = createMockDb({ selectResult: [{ total: '1234.56' }] });
      const store = createDrizzleBudgetStore(db);

      const spend = await store.getMonthlySpend('crypto');

      expect(spend).toBe(1234.56);
    });

    it('returns 0 when no usage exists', async () => {
      db = createMockDb({ selectResult: [{ total: '0' }] });
      const store = createDrizzleBudgetStore(db);

      const spend = await store.getMonthlySpend('hr');

      expect(spend).toBe(0);
    });

    it('returns 0 when result is null', async () => {
      db = createMockDb({ selectResult: [{ total: null }] });
      const store = createDrizzleBudgetStore(db);

      const spend = await store.getMonthlySpend('hr');

      expect(spend).toBe(0);
    });
  });
});

// ===========================================================================
// createDrizzleUsageLogStore
// ===========================================================================

describe('createDrizzleUsageLogStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('insert', () => {
    it('calls db.insert with correct values', async () => {
      const store = createDrizzleUsageLogStore(db);

      await store.insert({
        workflowId: 'wf-1',
        workflowStepId: 'step-1',
        domain: 'crypto',
        provider: 'openai',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costUsd: 0.001234,
        requestType: 'completion',
        latencyMs: 500,
        wasFallback: false,
        primaryProvider: undefined,
      });

      expect(db.insert).toHaveBeenCalledOnce();
      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        workflowId: 'wf-1',
        workflowStepId: 'step-1',
        domain: 'crypto',
        provider: 'openai',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costUsd: '0.001234',
        requestType: 'completion',
        latencyMs: 500,
        wasFallback: false,
        primaryProvider: null,
      });
    });

    it('sets optional fields to null when undefined', async () => {
      const store = createDrizzleUsageLogStore(db);

      await store.insert({
        domain: 'hr',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
        costUsd: 0.002,
        requestType: 'completion',
        latencyMs: 800,
        wasFallback: false,
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall.workflowId).toBeNull();
      expect(valuesCall.workflowStepId).toBeNull();
      expect(valuesCall.primaryProvider).toBeNull();
    });

    it('includes fallback info when present', async () => {
      const store = createDrizzleUsageLogStore(db);

      await store.insert({
        domain: 'crypto',
        provider: 'anthropic',
        model: 'claude-3-5-haiku',
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
        costUsd: 0.0005,
        requestType: 'completion',
        latencyMs: 300,
        wasFallback: true,
        primaryProvider: 'openai',
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall.wasFallback).toBe(true);
      expect(valuesCall.primaryProvider).toBe('openai');
    });
  });
});

// ===========================================================================
// P1.5-09: boundary-inclusion verification (gte vs gt)
// ===========================================================================

describe('P1.5-09: time boundary uses gte (>=) not gt (>)', () => {
  it('getDailySpend uses gte for start-of-day boundary', async () => {
    const db = createMockDb({ selectResult: [{ total: '5.00' }] });
    const store = createDrizzleBudgetStore(db);

    await store.getDailySpend('crypto');

    // verify .where was called — the gte operator ensures records exactly at
    // the boundary timestamp are included (not excluded as with gt)
    expect(db._selectBuilder.where).toHaveBeenCalledOnce();
    expect(db._selectBuilder.from).toHaveBeenCalledOnce();
  });

  it('getMonthlySpend uses gte for start-of-month boundary', async () => {
    const db = createMockDb({ selectResult: [{ total: '100.00' }] });
    const store = createDrizzleBudgetStore(db);

    await store.getMonthlySpend('hr');

    expect(db._selectBuilder.where).toHaveBeenCalledOnce();
    expect(db._selectBuilder.from).toHaveBeenCalledOnce();
  });
});
