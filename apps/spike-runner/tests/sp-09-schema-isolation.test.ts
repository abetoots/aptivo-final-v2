/**
 * @testcase SP-09-COMP-001 through SP-09-COMP-022
 * @requirements FR-CORE-AUTH-006
 * @warnings S7-W4 (RLS bypass), S7-W7 (pool exhaustion), S7-W19 (max 20)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-09
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SP_09_CONFIG,
  SchemaManager,
  RlsPolicyEngine,
  ConnectionPool,
  MigrationRunner,
  validateSearchPath,
  type TenantRow,
} from '../src/sp-09-schema-isolation.js';

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

describe('SP-09: Schema Isolation', () => {
  it('has correct spike configuration', () => {
    expect(SP_09_CONFIG.name).toBe('SP-09: Schema Isolation');
    expect(SP_09_CONFIG.risk).toBe('HIGH');
    expect(SP_09_CONFIG.validations).toHaveLength(6);
  });

  // ---------------------------------------------------------------------------
  // schema management
  // ---------------------------------------------------------------------------
  describe('SchemaManager', () => {
    let manager: SchemaManager;

    beforeEach(() => {
      manager = new SchemaManager();
    });

    it('creates a tenant schema', () => {
      const result = manager.createSchema('acme');
      expect(result.ok).toBe(true);
      expect(manager.schemaExists('acme')).toBe(true);
    });

    it('rejects duplicate schema creation', () => {
      manager.createSchema('acme');
      const result = manager.createSchema('acme');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('already exists');
    });

    it('drops a tenant schema', () => {
      manager.createSchema('acme');
      const result = manager.dropSchema('acme');
      expect(result.ok).toBe(true);
      expect(manager.schemaExists('acme')).toBe(false);
    });

    it('rejects dropping non-existent schema', () => {
      const result = manager.dropSchema('nonexistent');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('does not exist');
    });

    it('lists all tenant schemas in sorted order', () => {
      manager.createSchema('zebra');
      manager.createSchema('alpha');
      manager.createSchema('mid');
      const schemas = manager.listSchemas();
      expect(schemas).toEqual(['tenant_alpha', 'tenant_mid', 'tenant_zebra']);
    });

    it('reports non-existent schema correctly', () => {
      expect(manager.schemaExists('ghost')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // RLS policy engine
  // ---------------------------------------------------------------------------
  describe('RlsPolicyEngine', () => {
    let engine: RlsPolicyEngine;

    beforeEach(() => {
      engine = new RlsPolicyEngine();
      engine.addPolicy('tenant_acme', 'candidates', {
        name: 'tenant_isolation',
        column: 'tenant_id',
        serviceRoleBypass: true,
      });
    });

    it('allows access when tenant matches own schema', () => {
      const row: TenantRow = { tenant_id: 'acme', name: 'Alice' };
      const result = engine.checkAccess('tenant_acme', 'candidates', row, 'acme');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe('allowed');
    });

    it('denies cross-tenant access (different schema = different tenant)', () => {
      const row: TenantRow = { tenant_id: 'acme', name: 'Alice' };
      // tenant 'evil' tries to access 'acme' schema
      const result = engine.checkAccess('tenant_acme', 'candidates', row, 'evil');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('cross-schema-denied');
    });

    it('denies access when row tenant_id mismatches current tenant', () => {
      // row belongs to a different tenant but somehow ended up in schema
      const row: TenantRow = { tenant_id: 'other', name: 'Bob' };
      const result = engine.checkAccess('tenant_acme', 'candidates', row, 'acme');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('rls-denied');
    });

    it('allows service role to bypass RLS (S7-W4)', () => {
      // row technically belongs to another tenant in the data
      const row: TenantRow = { tenant_id: 'other', name: 'Service' };
      const result = engine.checkAccess(
        'tenant_acme',
        'candidates',
        row,
        'acme',
        { isServiceRole: true },
      );
      expect(result.ok).toBe(true);
    });

    it('allows access when no policies are registered on a table', () => {
      const row: TenantRow = { tenant_id: 'acme' };
      // 'logs' table has no policies
      const result = engine.checkAccess('tenant_acme', 'logs', row, 'acme');
      expect(result.ok).toBe(true);
    });

    it('returns registered policies for a schema/table', () => {
      const policies = engine.getPolicies('tenant_acme', 'candidates');
      expect(policies).toHaveLength(1);
      expect(policies[0]!.name).toBe('tenant_isolation');
    });
  });

  // ---------------------------------------------------------------------------
  // connection pool (S7-W7, S7-W19)
  // ---------------------------------------------------------------------------
  describe('ConnectionPool', () => {
    let pool: ConnectionPool;

    beforeEach(() => {
      pool = new ConnectionPool(20);
    });

    it('acquires a connection scoped to a schema', () => {
      const result = pool.acquire('tenant_acme');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.schema).toBe('tenant_acme');
      expect(result.value.id).toBeTruthy();
    });

    it('tracks active connection count', () => {
      pool.acquire('tenant_acme');
      pool.acquire('tenant_beta');
      expect(pool.getActiveCount()).toBe(2);
    });

    it('reports max connections (S7-W19: boundary max 20)', () => {
      expect(pool.getMaxConnections()).toBe(20);
    });

    it('acquires 20 connections successfully (S7-W19)', () => {
      for (let i = 0; i < 20; i++) {
        const result = pool.acquire(`tenant_${i}`);
        expect(result.ok).toBe(true);
      }
      expect(pool.getActiveCount()).toBe(20);
    });

    it('rejects 21st connection with pool-exhausted (S7-W7)', () => {
      // fill the pool to max
      for (let i = 0; i < 20; i++) {
        pool.acquire(`tenant_${i}`);
      }
      // 21st should fail
      const result = pool.acquire('tenant_overflow');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('pool-exhausted');
    });

    it('releases a connection back to the pool', () => {
      const acq = pool.acquire('tenant_acme');
      if (!acq.ok) return;
      expect(pool.getActiveCount()).toBe(1);

      const rel = pool.release(acq.value.id);
      expect(rel.ok).toBe(true);
      expect(pool.getActiveCount()).toBe(0);
    });

    it('allows acquire after release from exhausted pool', () => {
      // fill pool
      const ids: string[] = [];
      for (let i = 0; i < 20; i++) {
        const r = pool.acquire(`tenant_${i}`);
        if (r.ok) ids.push(r.value.id);
      }

      // pool exhausted
      expect(pool.acquire('tenant_new').ok).toBe(false);

      // release one
      pool.release(ids[0]!);

      // now acquire should succeed
      const result = pool.acquire('tenant_new');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.schema).toBe('tenant_new');
    });

    it('rejects release of unknown connection id', () => {
      const result = pool.release('conn-nonexistent');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('not-found');
    });

    it('tracks schema per connection (no leakage between tenants)', () => {
      const r1 = pool.acquire('tenant_acme');
      const r2 = pool.acquire('tenant_beta');
      if (!r1.ok || !r2.ok) return;

      expect(pool.getConnectionSchema(r1.value.id)).toBe('tenant_acme');
      expect(pool.getConnectionSchema(r2.value.id)).toBe('tenant_beta');

      // schemas are independent — no cross-contamination
      expect(pool.getConnectionSchema(r1.value.id)).not.toBe(
        pool.getConnectionSchema(r2.value.id),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // migration runner
  // ---------------------------------------------------------------------------
  describe('MigrationRunner', () => {
    let runner: MigrationRunner;

    beforeEach(() => {
      runner = new MigrationRunner();
    });

    it('applies a migration to a schema', () => {
      const result = runner.runMigration(
        'tenant_acme',
        '001-create-users',
        'CREATE TABLE users (id UUID PRIMARY KEY)',
      );
      expect(result.ok).toBe(true);
      expect(runner.hasMigration('tenant_acme', '001-create-users')).toBe(true);
    });

    it('rejects duplicate migration application', () => {
      runner.runMigration('tenant_acme', '001-create-users', 'CREATE TABLE users');
      const result = runner.runMigration('tenant_acme', '001-create-users', 'CREATE TABLE users');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('already-applied');
    });

    it('returns applied migrations for a schema', () => {
      runner.runMigration('tenant_acme', '001-create-users', 'sql1');
      runner.runMigration('tenant_acme', '002-add-email', 'sql2');
      const applied = runner.getAppliedMigrations('tenant_acme');
      expect(applied).toEqual(['001-create-users', '002-add-email']);
    });

    it('isolates migrations per schema', () => {
      runner.runMigration('tenant_acme', '001-create-users', 'sql');
      runner.runMigration('tenant_beta', '001-create-users', 'sql');
      runner.runMigration('tenant_beta', '002-add-email', 'sql');

      expect(runner.getAppliedMigrations('tenant_acme')).toHaveLength(1);
      expect(runner.getAppliedMigrations('tenant_beta')).toHaveLength(2);

      // acme should not see beta's second migration
      expect(runner.hasMigration('tenant_acme', '002-add-email')).toBe(false);
    });

    it('rejects migration against non-tenant schema', () => {
      const result = runner.runMigration('public', '001-bad', 'sql');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('invalid-schema');
    });

    it('validates no residual access after migration', () => {
      runner.runMigration('tenant_acme', '001-create-users', 'sql');
      const result = runner.validateNoResidualAccess('tenant_acme');
      expect(result.ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // search path injection prevention
  // ---------------------------------------------------------------------------
  describe('SearchPathValidator', () => {
    it('accepts valid tenant schema path', () => {
      const result = validateSearchPath('tenant_acme, public');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(['tenant_acme', 'public']);
    });

    it('accepts shared schema in path', () => {
      const result = validateSearchPath('shared, public');
      expect(result.ok).toBe(true);
    });

    it('rejects semicolon injection', () => {
      const result = validateSearchPath('tenant_acme; DROP SCHEMA public');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('injection-detected');
    });

    it('rejects comment injection (--)', () => {
      const result = validateSearchPath('tenant_acme -- malicious comment');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('injection-detected');
    });

    it('rejects block comment injection (/*)', () => {
      const result = validateSearchPath('tenant_acme /* comment */');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('injection-detected');
    });

    it('rejects quote injection', () => {
      const result = validateSearchPath("tenant_acme', 'evil");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('injection-detected');
    });

    it('rejects unauthorized schema names', () => {
      const result = validateSearchPath('information_schema');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('unauthorized-schema');
    });

    it('rejects empty search path', () => {
      const result = validateSearchPath('');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('unauthorized-schema');
    });
  });
});
