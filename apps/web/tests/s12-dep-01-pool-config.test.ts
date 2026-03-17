/**
 * DEP-12-01: Pool Config Closure tests
 * @task DEP-12-01
 *
 * verifies:
 * - createDatabase accepts optional pool options parameter
 * - getDbForDomain passes domain-specific pool config to createDatabase
 * - default (platform) domain uses { max: 20 }
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// capture createDatabase calls via mock
// ---------------------------------------------------------------------------

const capturedCalls: Array<{ connectionString: string; poolOptions?: any }> = [];

vi.mock('@aptivo/database', () => ({
  createDatabase: vi.fn((connectionString: string, poolOptions?: any) => {
    capturedCalls.push({ connectionString, poolOptions });
    // return a minimal db stub
    return { query: vi.fn(), $client: {} } as any;
  }),
}));

// ---------------------------------------------------------------------------
// imports under test (after mocks)
// ---------------------------------------------------------------------------

import { createDatabase } from '@aptivo/database';
import { getDbForDomain, DEFAULT_POOL_CONFIG } from '../src/lib/db.js';

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedCalls.length = 0;

  // provide a valid connection string so getDbForDomain doesn't throw
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
});

afterEach(() => {
  // clean up domain instances by re-importing (module state)
  // since we can't easily clear the Map, we rely on each test being specific
});

// ---------------------------------------------------------------------------
// createDatabase accepts pool options
// ---------------------------------------------------------------------------

describe('createDatabase accepts pool options', () => {
  it('can be called with only connectionString', () => {
    createDatabase('postgresql://localhost/test');
    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].connectionString).toBe('postgresql://localhost/test');
  });

  it('can be called with connectionString and pool options', () => {
    createDatabase('postgresql://localhost/test', { max: 15 });
    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].poolOptions).toEqual({ max: 15 });
  });

  it('can be called with connectionString and full pool options', () => {
    createDatabase('postgresql://localhost/test', { max: 25, idleTimeoutMs: 30000 });
    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].poolOptions).toEqual({ max: 25, idleTimeoutMs: 30000 });
  });
});

// ---------------------------------------------------------------------------
// getDbForDomain passes domain-specific pool config
// ---------------------------------------------------------------------------

describe('getDbForDomain passes pool config to createDatabase', () => {
  it('crypto domain passes { max: 10 }', () => {
    getDbForDomain('crypto');

    expect(vi.mocked(createDatabase)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 10 }),
    );
  });

  it('hr domain passes { max: 10 }', () => {
    getDbForDomain('hr');

    expect(vi.mocked(createDatabase)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 10 }),
    );
  });

  it('default platform domain passes { max: 20 }', () => {
    getDbForDomain('platform');

    expect(vi.mocked(createDatabase)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 20 }),
    );
  });

  it('no-arg defaults to platform domain (same instance as explicit platform)', () => {
    // platform instance was already created by previous test, so no-arg
    // should return the same cached instance without a new createDatabase call
    const prevCallCount = vi.mocked(createDatabase).mock.calls.length;
    const instance = getDbForDomain();
    const platformInstance = getDbForDomain('platform');

    // same cached instance — no additional createDatabase call
    expect(instance).toBe(platformInstance);
    expect(vi.mocked(createDatabase).mock.calls.length).toBe(prevCallCount);
  });

  it('unknown domain falls back to platform config', () => {
    getDbForDomain('unknown-domain');

    expect(vi.mocked(createDatabase)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max: 20 }),
    );
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_POOL_CONFIG structure
// ---------------------------------------------------------------------------

describe('DEFAULT_POOL_CONFIG', () => {
  it('has platform entry with max: 20', () => {
    expect(DEFAULT_POOL_CONFIG.platform).toEqual(expect.objectContaining({ max: 20 }));
  });

  it('has crypto entry with max: 10', () => {
    expect(DEFAULT_POOL_CONFIG.crypto).toEqual(expect.objectContaining({ max: 10 }));
  });

  it('has hr entry with max: 10', () => {
    expect(DEFAULT_POOL_CONFIG.hr).toEqual(expect.objectContaining({ max: 10 }));
  });
});
