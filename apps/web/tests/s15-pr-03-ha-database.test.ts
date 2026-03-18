/**
 * PR-03: HA Database + Real Failover Exercise tests
 * @task PR-03
 *
 * verifies the connection manager: config resolution, connect/reconnect,
 * domain client isolation, ha mode detection, and failover script existence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock deps factory
// ---------------------------------------------------------------------------

function createMockDeps() {
  const clients: unknown[] = [];
  return {
    createClient: vi.fn().mockImplementation((url: string, options?: Record<string, unknown>) => {
      const client = { url, options, _mock: true };
      clients.push(client);
      return client;
    }),
    getClients: () => clients,
  };
}

// ---------------------------------------------------------------------------
// PR-03: resolveConnectionConfig
// ---------------------------------------------------------------------------

describe('PR-03: resolveConnectionConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('returns ha config when DATABASE_URL_HA is set', async () => {
    process.env.DATABASE_URL_HA = 'postgres://ha:5432/db';
    process.env.DATABASE_URL = 'postgres://standard:5432/db';

    const { resolveConnectionConfig } = await import('../src/lib/db/connection-manager');
    const result = resolveConnectionConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('postgres://ha:5432/db');
    expect(result.value.isHa).toBe(true);
  });

  it('falls back to DATABASE_URL when no HA url', async () => {
    delete process.env.DATABASE_URL_HA;
    process.env.DATABASE_URL = 'postgres://standard:5432/db';

    const { resolveConnectionConfig } = await import('../src/lib/db/connection-manager');
    const result = resolveConnectionConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('postgres://standard:5432/db');
    expect(result.value.isHa).toBe(false);
  });

  it('returns NoUrlError when neither is set', async () => {
    delete process.env.DATABASE_URL_HA;
    delete process.env.DATABASE_URL;

    const { resolveConnectionConfig } = await import('../src/lib/db/connection-manager');
    const result = resolveConnectionConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NoUrlError');
    expect(result.error.message).toContain('DATABASE_URL_HA');
    expect(result.error.message).toContain('DATABASE_URL');
  });
});

// ---------------------------------------------------------------------------
// PR-03: createConnectionManager — connect
// ---------------------------------------------------------------------------

describe('PR-03: createConnectionManager — connect', () => {
  it('connects and stores client', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    const manager = createConnectionManager(deps);

    const result = manager.connect({ url: 'postgres://test:5432/db', isHa: false });

    expect(result.ok).toBe(true);
    expect(manager.getClient()).not.toBeNull();
    expect(deps.createClient).toHaveBeenCalledWith('postgres://test:5432/db', undefined);
  });

  it('passes pool options to createClient', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    const manager = createConnectionManager(deps);

    manager.connect({
      url: 'postgres://test:5432/db',
      isHa: true,
      poolOptions: { max: 20, idleTimeoutMs: 30000 },
    });

    expect(deps.createClient).toHaveBeenCalledWith('postgres://test:5432/db', {
      max: 20,
      idleTimeoutMs: 30000,
    });
  });

  it('returns ConnectionFailed when createClient throws', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    deps.createClient.mockImplementation(() => {
      throw new Error('connection refused');
    });
    const manager = createConnectionManager(deps);

    const result = manager.connect({ url: 'postgres://bad:5432/db', isHa: false });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ConnectionFailed');
  });

  it('getConfig returns the stored config after connect', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const manager = createConnectionManager(createMockDeps());

    manager.connect({ url: 'postgres://test:5432/db', isHa: true });

    const config = manager.getConfig();
    expect(config).not.toBeNull();
    expect(config!.isHa).toBe(true);
    expect(config!.url).toBe('postgres://test:5432/db');
  });

  it('isHaMode returns true for ha connection', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const manager = createConnectionManager(createMockDeps());

    manager.connect({ url: 'postgres://ha:5432/db', isHa: true });

    expect(manager.isHaMode()).toBe(true);
  });

  it('isHaMode returns false for standard connection', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const manager = createConnectionManager(createMockDeps());

    manager.connect({ url: 'postgres://std:5432/db', isHa: false });

    expect(manager.isHaMode()).toBe(false);
  });

  it('isHaMode returns false when not connected', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const manager = createConnectionManager(createMockDeps());

    expect(manager.isHaMode()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR-03: createConnectionManager — reconnect
// ---------------------------------------------------------------------------

describe('PR-03: createConnectionManager — reconnect', () => {
  it('reconnects with same config and creates new client', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    const manager = createConnectionManager(deps);

    manager.connect({ url: 'postgres://test:5432/db', isHa: true });
    const firstClient = manager.getClient();

    const result = manager.reconnect();

    expect(result.ok).toBe(true);
    expect(deps.createClient).toHaveBeenCalledTimes(2);
    // new client instance
    expect(manager.getClient()).not.toBe(firstClient);
  });

  it('reconnect clears domain clients', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    const manager = createConnectionManager(deps);

    manager.connect({ url: 'postgres://test:5432/db', isHa: true });
    manager.getClientForDomain('crypto');
    manager.getClientForDomain('hr');
    expect(manager.getDomainClientCount()).toBe(2);

    manager.reconnect();

    expect(manager.getDomainClientCount()).toBe(0);
  });

  it('reconnect fails when not connected', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const manager = createConnectionManager(createMockDeps());

    const result = manager.reconnect();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ReconnectFailed');
  });

  it('reconnect fails when createClient throws', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    const manager = createConnectionManager(deps);

    manager.connect({ url: 'postgres://test:5432/db', isHa: true });

    // make second call throw
    deps.createClient.mockImplementation(() => {
      throw new Error('reconnect failed');
    });

    const result = manager.reconnect();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ReconnectFailed');
  });
});

// ---------------------------------------------------------------------------
// PR-03: createConnectionManager — domain clients
// ---------------------------------------------------------------------------

describe('PR-03: createConnectionManager — domain clients', () => {
  it('creates isolated client per domain', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    const manager = createConnectionManager(deps);

    manager.connect({ url: 'postgres://test:5432/db', isHa: false });

    const crypto = manager.getClientForDomain('crypto', { max: 10 });
    const hr = manager.getClientForDomain('hr', { max: 5 });

    expect(crypto).not.toBe(hr);
    // initial connect + 2 domain clients
    expect(deps.createClient).toHaveBeenCalledTimes(3);
  });

  it('caches domain client on subsequent calls', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    const manager = createConnectionManager(deps);

    manager.connect({ url: 'postgres://test:5432/db', isHa: false });

    const first = manager.getClientForDomain('crypto');
    const second = manager.getClientForDomain('crypto');

    expect(first).toBe(second);
    // connect + 1 domain client (not 2)
    expect(deps.createClient).toHaveBeenCalledTimes(2);
  });

  it('throws when getting domain client without connection', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const manager = createConnectionManager(createMockDeps());

    expect(() => manager.getClientForDomain('crypto')).toThrow('not connected');
  });

  it('clearDomainClients removes all cached domain clients', async () => {
    const { createConnectionManager } = await import('../src/lib/db/connection-manager');
    const deps = createMockDeps();
    const manager = createConnectionManager(deps);

    manager.connect({ url: 'postgres://test:5432/db', isHa: false });
    manager.getClientForDomain('crypto');
    manager.getClientForDomain('hr');

    expect(manager.getDomainClientCount()).toBe(2);

    manager.clearDomainClients();

    expect(manager.getDomainClientCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PR-03: failover test script exists
// ---------------------------------------------------------------------------

describe('PR-03: Failover Test Script', () => {
  it('failover-test.sh exists and is well-formed', async () => {
    const fs = await import('node:fs');
    const scriptPath = new URL('../../../scripts/failover-test.sh', import.meta.url);
    const source = fs.readFileSync(scriptPath, 'utf-8');

    // phase structure
    expect(source).toContain('Phase 1: Pre-flight');
    expect(source).toContain('Phase 2: Simulate Failover');
    expect(source).toContain('Phase 3: Monitor Recovery');
    expect(source).toContain('Phase 4: Validate');
    expect(source).toContain('Phase 5: Report');

    // supports --dry-run
    expect(source).toContain('--dry-run');

    // uses set -euo pipefail
    expect(source).toContain('set -euo pipefail');

    // outputs json report
    expect(source).toContain('interruption_seconds');
    expect(source).toContain('within_slo');
  });
});

// ---------------------------------------------------------------------------
// PR-03: existing db.ts patterns preserved
// ---------------------------------------------------------------------------

describe('PR-03: Existing db.ts HA patterns', () => {
  it('db.ts exports resolveConnectionString, getDb, reconnect, isHaMode', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/db.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('export function resolveConnectionString()');
    expect(source).toContain('export function getDb()');
    expect(source).toContain('export function reconnect()');
    expect(source).toContain('export function isHaMode()');
  });

  it('db.ts exports getDbForDomain for domain pool isolation', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/db.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('export function getDbForDomain');
    expect(source).toContain('DEFAULT_POOL_CONFIG');
  });

  it('db.ts exports getPoolStats for monitoring', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/db.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('export function getPoolStats()');
  });
});
