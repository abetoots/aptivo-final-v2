/**
 * PR-04: Pool Config Enforcement tests
 * @task PR-04
 *
 * verifies domain-scoped pool defaults, fallback behavior for unknown
 * domains, getPoolStats aggregation, and pool isolation between domains.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// PR-04: getPoolOptionsForDomain
// ---------------------------------------------------------------------------

describe('PR-04: getPoolOptionsForDomain', () => {
  it('crypto domain returns max:10, idleTimeoutMs:30000', async () => {
    const { getPoolOptionsForDomain } = await import(
      '../../../packages/database/src/pool-config'
    );

    const opts = getPoolOptionsForDomain('crypto');

    expect(opts.max).toBe(10);
    expect(opts.idleTimeoutMs).toBe(30_000);
  });

  it('hr domain returns max:10, idleTimeoutMs:30000', async () => {
    const { getPoolOptionsForDomain } = await import(
      '../../../packages/database/src/pool-config'
    );

    const opts = getPoolOptionsForDomain('hr');

    expect(opts.max).toBe(10);
    expect(opts.idleTimeoutMs).toBe(30_000);
  });

  it('platform domain returns max:20, idleTimeoutMs:60000', async () => {
    const { getPoolOptionsForDomain } = await import(
      '../../../packages/database/src/pool-config'
    );

    const opts = getPoolOptionsForDomain('platform');

    expect(opts.max).toBe(20);
    expect(opts.idleTimeoutMs).toBe(60_000);
  });

  it('unknown domain falls back to platform defaults', async () => {
    const { getPoolOptionsForDomain } = await import(
      '../../../packages/database/src/pool-config'
    );

    const opts = getPoolOptionsForDomain('unknown-domain');

    expect(opts.max).toBe(20);
    expect(opts.idleTimeoutMs).toBe(60_000);
  });

  it('empty string domain falls back to platform defaults', async () => {
    const { getPoolOptionsForDomain } = await import(
      '../../../packages/database/src/pool-config'
    );

    const opts = getPoolOptionsForDomain('');

    expect(opts.max).toBe(20);
    expect(opts.idleTimeoutMs).toBe(60_000);
  });
});

// ---------------------------------------------------------------------------
// PR-04: getPoolStats
// ---------------------------------------------------------------------------

describe('PR-04: getPoolStats', () => {
  it('returns pool options for all requested domains', async () => {
    const { getPoolStats } = await import(
      '../../../packages/database/src/pool-config'
    );

    const stats = getPoolStats(['crypto', 'hr', 'platform']);

    expect(Object.keys(stats)).toHaveLength(3);
    expect(stats.crypto).toBeDefined();
    expect(stats.hr).toBeDefined();
    expect(stats.platform).toBeDefined();
  });

  it('unknown domains in list get platform defaults', async () => {
    const { getPoolStats } = await import(
      '../../../packages/database/src/pool-config'
    );

    const stats = getPoolStats(['crypto', 'custom']);

    expect(stats.custom.max).toBe(20);
    expect(stats.custom.idleTimeoutMs).toBe(60_000);
  });

  it('empty domain list returns empty object', async () => {
    const { getPoolStats } = await import(
      '../../../packages/database/src/pool-config'
    );

    const stats = getPoolStats([]);

    expect(Object.keys(stats)).toHaveLength(0);
  });

  it('duplicate domains produce single entry per domain', async () => {
    const { getPoolStats } = await import(
      '../../../packages/database/src/pool-config'
    );

    const stats = getPoolStats(['crypto', 'crypto', 'hr']);

    expect(Object.keys(stats)).toHaveLength(2);
    expect(stats.crypto.max).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// PR-04: domain pool isolation
// ---------------------------------------------------------------------------

describe('PR-04: Pool isolation', () => {
  it('different domains get different configs', async () => {
    const { getPoolOptionsForDomain } = await import(
      '../../../packages/database/src/pool-config'
    );

    const crypto = getPoolOptionsForDomain('crypto');
    const platform = getPoolOptionsForDomain('platform');

    expect(crypto.max).not.toBe(platform.max);
    expect(crypto.idleTimeoutMs).not.toBe(platform.idleTimeoutMs);
  });

  it('crypto and hr share the same pool size', async () => {
    const { getPoolOptionsForDomain } = await import(
      '../../../packages/database/src/pool-config'
    );

    const crypto = getPoolOptionsForDomain('crypto');
    const hr = getPoolOptionsForDomain('hr');

    expect(crypto.max).toBe(hr.max);
    expect(crypto.idleTimeoutMs).toBe(hr.idleTimeoutMs);
  });
});

// ---------------------------------------------------------------------------
// PR-04: DOMAIN_POOL_DEFAULTS structure
// ---------------------------------------------------------------------------

describe('PR-04: DOMAIN_POOL_DEFAULTS structure', () => {
  it('contains exactly 3 domain entries', async () => {
    const { DOMAIN_POOL_DEFAULTS } = await import(
      '../../../packages/database/src/pool-config'
    );

    expect(Object.keys(DOMAIN_POOL_DEFAULTS)).toHaveLength(3);
    expect(Object.keys(DOMAIN_POOL_DEFAULTS).sort()).toEqual(['crypto', 'hr', 'platform']);
  });

  it('all entries have max and idleTimeoutMs as numbers', async () => {
    const { DOMAIN_POOL_DEFAULTS } = await import(
      '../../../packages/database/src/pool-config'
    );

    for (const [, opts] of Object.entries(DOMAIN_POOL_DEFAULTS)) {
      expect(typeof opts.max).toBe('number');
      expect(typeof opts.idleTimeoutMs).toBe('number');
      expect(opts.max).toBeGreaterThan(0);
      expect(opts.idleTimeoutMs).toBeGreaterThan(0);
    }
  });

  it('platform has higher pool limits than domain pools', async () => {
    const { DOMAIN_POOL_DEFAULTS } = await import(
      '../../../packages/database/src/pool-config'
    );

    expect(DOMAIN_POOL_DEFAULTS.platform.max).toBeGreaterThan(
      DOMAIN_POOL_DEFAULTS.crypto.max,
    );
  });
});
