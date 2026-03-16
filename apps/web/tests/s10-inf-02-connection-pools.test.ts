/**
 * INF-02: per-domain connection pools
 * @task INF-02
 *
 * verifies:
 * 1. getDbForDomain returns same instance for same domain (caching)
 * 2. getDbForDomain returns different instances for different domains
 * 3. DEFAULT_POOL_CONFIG has correct defaults
 * 4. getPoolStats returns active pools
 * 5. unknown domain falls back to platform config
 * 6. getDbForDomain('platform') works as default
 * 7. composition root exposes domain-scoped getters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock @aptivo/database so createDatabase doesn't need a real pg connection
// ---------------------------------------------------------------------------

vi.mock('@aptivo/database', () => ({
  createDatabase: vi.fn((connectionString: string) => ({
    _mockDb: true,
    _connectionString: connectionString,
    _id: Math.random().toString(36).slice(2),
  })),
}));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const originalEnv = { ...process.env };

function setDbEnv() {
  process.env.DATABASE_URL = 'postgres://localhost:5432/aptivo_test';
}

// ---------------------------------------------------------------------------
// tests: DEFAULT_POOL_CONFIG
// ---------------------------------------------------------------------------

describe('INF-02: DEFAULT_POOL_CONFIG', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('has correct defaults for platform, crypto, and hr', async () => {
    const { DEFAULT_POOL_CONFIG } = await import('../src/lib/db.js');

    expect(DEFAULT_POOL_CONFIG.platform).toEqual({ max: 20 });
    expect(DEFAULT_POOL_CONFIG.crypto).toEqual({ max: 10 });
    expect(DEFAULT_POOL_CONFIG.hr).toEqual({ max: 10 });
  });

  it('contains exactly three domain entries', async () => {
    const { DEFAULT_POOL_CONFIG } = await import('../src/lib/db.js');

    expect(Object.keys(DEFAULT_POOL_CONFIG)).toHaveLength(3);
    expect(Object.keys(DEFAULT_POOL_CONFIG).sort()).toEqual(['crypto', 'hr', 'platform']);
  });
});

// ---------------------------------------------------------------------------
// tests: getDbForDomain caching behavior
// ---------------------------------------------------------------------------

describe('INF-02: getDbForDomain caching', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('returns the same instance for the same domain (memoization)', async () => {
    setDbEnv();
    const { getDbForDomain } = await import('../src/lib/db.js');

    const first = getDbForDomain('crypto');
    const second = getDbForDomain('crypto');

    expect(first).toBe(second);
  });

  it('returns different instances for different domains', async () => {
    setDbEnv();
    const { getDbForDomain } = await import('../src/lib/db.js');

    const cryptoDb = getDbForDomain('crypto');
    const hrDb = getDbForDomain('hr');
    const platformDb = getDbForDomain('platform');

    expect(cryptoDb).not.toBe(hrDb);
    expect(cryptoDb).not.toBe(platformDb);
    expect(hrDb).not.toBe(platformDb);
  });

  it('defaults to platform when no domain is specified', async () => {
    setDbEnv();
    const { getDbForDomain } = await import('../src/lib/db.js');

    const defaultDb = getDbForDomain();
    const platformDb = getDbForDomain('platform');

    // both should resolve to the same cached instance
    expect(defaultDb).toBe(platformDb);
  });
});

// ---------------------------------------------------------------------------
// tests: getDbForDomain with unknown domain
// ---------------------------------------------------------------------------

describe('INF-02: unknown domain fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('creates an instance for unknown domains using platform config', async () => {
    setDbEnv();
    const { getDbForDomain, getPoolStats } = await import('../src/lib/db.js');

    // an unrecognized domain should still work
    const customDb = getDbForDomain('analytics');
    expect(customDb).toBeDefined();

    // the pool stats should show it with platform max (fallback)
    const stats = getPoolStats();
    expect(stats.analytics).toBeDefined();
    expect(stats.analytics!.max).toBe(20); // platform default
    expect(stats.analytics!.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tests: getPoolStats
// ---------------------------------------------------------------------------

describe('INF-02: getPoolStats', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('returns empty stats when no pools have been created', async () => {
    setDbEnv();
    const { getPoolStats } = await import('../src/lib/db.js');

    const stats = getPoolStats();
    expect(Object.keys(stats)).toHaveLength(0);
  });

  it('returns stats for all created pools', async () => {
    setDbEnv();
    const { getDbForDomain, getPoolStats } = await import('../src/lib/db.js');

    // create pools for crypto and hr
    getDbForDomain('crypto');
    getDbForDomain('hr');

    const stats = getPoolStats();
    expect(Object.keys(stats)).toHaveLength(2);

    expect(stats.crypto).toEqual({ domain: 'crypto', max: 10, active: true });
    expect(stats.hr).toEqual({ domain: 'hr', max: 10, active: true });
  });

  it('includes platform pool when explicitly created', async () => {
    setDbEnv();
    const { getDbForDomain, getPoolStats } = await import('../src/lib/db.js');

    getDbForDomain('platform');
    getDbForDomain('crypto');

    const stats = getPoolStats();
    expect(stats.platform).toEqual({ domain: 'platform', max: 20, active: true });
    expect(stats.crypto).toEqual({ domain: 'crypto', max: 10, active: true });
  });
});

// ---------------------------------------------------------------------------
// tests: getDbForDomain uses resolveConnectionString
// ---------------------------------------------------------------------------

describe('INF-02: connection string resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('throws when neither DATABASE_URL_HA nor DATABASE_URL is set', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_HA;

    const { getDbForDomain } = await import('../src/lib/db.js');

    expect(() => getDbForDomain('crypto')).toThrow('DATABASE_URL not set');
  });

  it('uses DATABASE_URL_HA when available', async () => {
    process.env.DATABASE_URL_HA = 'postgres://ha-primary:5432/aptivo';
    process.env.DATABASE_URL = 'postgres://standard:5432/aptivo';

    const { createDatabase } = await import('@aptivo/database');
    const { getDbForDomain } = await import('../src/lib/db.js');

    getDbForDomain('crypto');

    expect(vi.mocked(createDatabase)).toHaveBeenCalledWith(
      'postgres://ha-primary:5432/aptivo',
    );
  });

  it('falls back to DATABASE_URL when HA not set', async () => {
    delete process.env.DATABASE_URL_HA;
    process.env.DATABASE_URL = 'postgres://standard:5432/aptivo';

    const { createDatabase } = await import('@aptivo/database');
    const { getDbForDomain } = await import('../src/lib/db.js');

    getDbForDomain('hr');

    expect(vi.mocked(createDatabase)).toHaveBeenCalledWith(
      'postgres://standard:5432/aptivo',
    );
  });
});

// ---------------------------------------------------------------------------
// tests: domain pools are independent from getDb()
// ---------------------------------------------------------------------------

describe('INF-02: independence from getDb', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('getDbForDomain does not affect getDb singleton', async () => {
    setDbEnv();
    const { getDb, getDbForDomain } = await import('../src/lib/db.js');

    const domainDb = getDbForDomain('crypto');
    const mainDb = getDb();

    // they should be different instances
    expect(domainDb).not.toBe(mainDb);
  });

  it('getDb singleton is unaffected by domain pool creation', async () => {
    setDbEnv();
    const { getDb, getDbForDomain } = await import('../src/lib/db.js');

    // create main singleton first
    const mainDb1 = getDb();

    // create domain pools
    getDbForDomain('crypto');
    getDbForDomain('hr');

    // main singleton should be unchanged
    const mainDb2 = getDb();
    expect(mainDb1).toBe(mainDb2);
  });
});

// ---------------------------------------------------------------------------
// tests: PoolConfig interface shape
// ---------------------------------------------------------------------------

describe('INF-02: PoolConfig interface', () => {
  it('exports PoolConfig type with required max and optional idleTimeoutMs', async () => {
    const { DEFAULT_POOL_CONFIG } = await import('../src/lib/db.js');

    // verify shape via the existing config entries
    for (const config of Object.values(DEFAULT_POOL_CONFIG)) {
      expect(typeof config.max).toBe('number');
      expect(config.max).toBeGreaterThan(0);
      // idleTimeoutMs is optional — not set in defaults
      expect(config.idleTimeoutMs).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// tests: composition root domain-scoped getters
// ---------------------------------------------------------------------------

describe('INF-02: composition root domain-scoped getters', () => {
  it('services.ts exports getCryptoDb and getHrDb', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    // verify domain-scoped getters exist
    expect(source).toContain("getCryptoDb = lazy(() => getDbForDomain('crypto'))");
    expect(source).toContain("getHrDb = lazy(() => getDbForDomain('hr'))");

    // verify getDbForDomain is imported
    expect(source).toContain('getDbForDomain');
  });

  it('services.ts imports getDbForDomain from db module', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toMatch(/import\s*\{[^}]*getDbForDomain[^}]*\}\s*from\s*'\.\/db\.js'/);
  });
});

// ---------------------------------------------------------------------------
// tests: console.info log on pool creation
// ---------------------------------------------------------------------------

describe('INF-02: pool initialization logging', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('logs pool initialization with domain and max', async () => {
    setDbEnv();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { getDbForDomain } = await import('../src/lib/db.js');
    getDbForDomain('crypto');

    expect(infoSpy).toHaveBeenCalledWith(
      '[db] pool initialized for domain "crypto" (max: 10)',
    );

    infoSpy.mockRestore();
  });

  it('does not log on subsequent calls for the same domain', async () => {
    setDbEnv();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { getDbForDomain } = await import('../src/lib/db.js');
    getDbForDomain('hr');

    const callCount = infoSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('domain "hr"'),
    ).length;

    // call again — should not log
    getDbForDomain('hr');

    const newCallCount = infoSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('domain "hr"'),
    ).length;

    expect(newCallCount).toBe(callCount);

    infoSpy.mockRestore();
  });
});
