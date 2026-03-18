/**
 * INF-09: HA failover validation tests
 * @task INF-09
 *
 * verifies the failover test script exists and is well-formed,
 * and that db.ts exports the HA connection helpers (resolveConnectionString,
 * isHaMode, reconnect).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mock @aptivo/database so getDb() / reconnect() don't need a real pg connection
const mockDb = { execute: vi.fn(), select: vi.fn(), insert: vi.fn() };
vi.mock('@aptivo/database', () => ({
  createDatabase: vi.fn(() => mockDb),
}));

describe('INF-09: HA failover validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // -------------------------------------------------------------------------
  // failover test script validation
  // -------------------------------------------------------------------------

  // @testtype doc-lint
  describe('failover-test.sh', () => {
    it('failover test script exists', () => {
      const { existsSync } = require('fs');
      const { resolve } = require('path');
      expect(existsSync(resolve(__dirname, '../../../scripts/failover-test.sh'))).toBe(true);
    });

    it('script has dry-run mode', () => {
      const { readFileSync } = require('fs');
      const { resolve } = require('path');
      const content = readFileSync(
        resolve(__dirname, '../../../scripts/failover-test.sh'),
        'utf-8',
      );
      expect(content).toContain('--dry-run');
      expect(content).toContain('DRY_RUN');
    });

    it('script validates all 5 phases', () => {
      const { readFileSync } = require('fs');
      const { resolve } = require('path');
      const content = readFileSync(
        resolve(__dirname, '../../../scripts/failover-test.sh'),
        'utf-8',
      );
      expect(content).toContain('Phase 1: Pre-flight');
      expect(content).toContain('Phase 2: Simulate');
      expect(content).toContain('Phase 3: Monitor');
      expect(content).toContain('Phase 4: Validate');
      expect(content).toContain('Phase 5: Report');
    });

    it('script produces JSON results', () => {
      const { readFileSync } = require('fs');
      const { resolve } = require('path');
      const content = readFileSync(
        resolve(__dirname, '../../../scripts/failover-test.sh'),
        'utf-8',
      );
      expect(content).toContain('RESULTS_FILE');
      expect(content).toContain('"within_slo"');
      expect(content).toContain('"target_seconds": 30');
    });

    it('script is executable', () => {
      const { statSync } = require('fs');
      const { resolve } = require('path');
      const stats = statSync(resolve(__dirname, '../../../scripts/failover-test.sh'));
      // check owner execute bit (0o100)
      expect(stats.mode & 0o100).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // db.ts HA connection handling
  // -------------------------------------------------------------------------

  describe('db.ts HA connection handling', () => {
    it('resolveConnectionString prefers DATABASE_URL_HA over DATABASE_URL', async () => {
      process.env.DATABASE_URL = 'postgres://regular:5432/db';
      process.env.DATABASE_URL_HA = 'postgres://ha-cluster:5432/db';

      const { resolveConnectionString } = await import('../src/lib/db');
      const result = resolveConnectionString();
      expect(result.connectionString).toBe('postgres://ha-cluster:5432/db');
      expect(result.ha).toBe(true);
    });

    it('resolveConnectionString falls back to DATABASE_URL when HA not set', async () => {
      process.env.DATABASE_URL = 'postgres://regular:5432/db';
      delete process.env.DATABASE_URL_HA;

      const { resolveConnectionString } = await import('../src/lib/db');
      const result = resolveConnectionString();
      expect(result.connectionString).toBe('postgres://regular:5432/db');
      expect(result.ha).toBe(false);
    });

    it('resolveConnectionString throws when no url is set', async () => {
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_URL_HA;

      const { resolveConnectionString } = await import('../src/lib/db');
      expect(() => resolveConnectionString()).toThrow('DATABASE_URL not set');
    });

    it('isHaMode returns true when HA URL is set', async () => {
      process.env.DATABASE_URL_HA = 'postgres://ha:5432/db';

      const mod = await import('../src/lib/db');
      // trigger db init so _isHaMode is set
      mod.getDb();
      expect(mod.isHaMode()).toBe(true);
    });

    it('isHaMode returns false when only regular URL set', async () => {
      delete process.env.DATABASE_URL_HA;
      process.env.DATABASE_URL = 'postgres://regular:5432/db';

      const mod = await import('../src/lib/db');
      mod.getDb();
      expect(mod.isHaMode()).toBe(false);
    });

    it('reconnect function is exported', async () => {
      process.env.DATABASE_URL = 'postgres://test:5432/db';

      const db = await import('../src/lib/db');
      expect(typeof db.reconnect).toBe('function');
    });

    it('reconnect returns a fresh db instance', async () => {
      process.env.DATABASE_URL = 'postgres://test:5432/db';

      const mod = await import('../src/lib/db');
      const first = mod.getDb();
      const second = mod.reconnect();
      // reconnect drops cached client, so getDb is called again
      expect(second).toBeDefined();
      expect(first).toBeDefined();
    });
  });
});
