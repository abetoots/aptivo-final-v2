/**
 * SP-09: Schema Isolation Spike
 * @spike SP-09
 * @brd BO-CORE-009, BRD §6.10 (Build: Multi-Tenancy)
 * @frd FR-CORE-AUTH-006 (Schema isolation)
 * @add ADD §6.2 (Schema Isolation)
 * @warnings S7-W4 (RLS bypass), S7-W7 (connection pool exhaustion), S7-W19 (connection pool boundary max 20)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-09
 */

// spike validation: verify Postgres schema-per-tenant isolation,
// migration strategy, and cross-schema query prevention

import { Result } from '@aptivo/types';

export const SP_09_CONFIG = {
  name: 'SP-09: Schema Isolation',
  risk: 'HIGH' as const,
  validations: [
    'Schema creation per tenant',
    'RLS policy application per schema',
    'Cross-schema query prevention',
    'Migration execution per schema',
    'Connection pooling with schema switching',
    'Shared data access patterns',
  ],
} as const;

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

/** represents a row-level security policy bound to a table */
export interface RlsPolicy {
  /** name of the policy */
  name: string;
  /** column used for tenant filtering (e.g., 'tenant_id') */
  column: string;
  /** whether service-role bypasses this policy */
  serviceRoleBypass: boolean;
}

/** represents a simulated database connection */
export interface Connection {
  id: string;
  schema: string;
  acquiredAt: number;
}

/** represents a simulated row with tenant context */
export interface TenantRow {
  tenant_id: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// schema manager: simulates schema-per-tenant
// ---------------------------------------------------------------------------

/**
 * Simulates PostgreSQL schema-per-tenant management.
 * In production this would issue CREATE SCHEMA / DROP SCHEMA DDL.
 */
export class SchemaManager {
  private schemas = new Set<string>();

  /** creates a new tenant schema namespace */
  createSchema(tenantId: string): Result<void, string> {
    const schemaName = this.toSchemaName(tenantId);
    if (this.schemas.has(schemaName)) {
      return Result.err(`schema '${schemaName}' already exists`);
    }
    this.schemas.add(schemaName);
    return Result.ok(undefined);
  }

  /** removes a tenant schema */
  dropSchema(tenantId: string): Result<void, string> {
    const schemaName = this.toSchemaName(tenantId);
    if (!this.schemas.has(schemaName)) {
      return Result.err(`schema '${schemaName}' does not exist`);
    }
    this.schemas.delete(schemaName);
    return Result.ok(undefined);
  }

  /** checks if a tenant schema exists */
  schemaExists(tenantId: string): boolean {
    return this.schemas.has(this.toSchemaName(tenantId));
  }

  /** returns all tenant schema names */
  listSchemas(): string[] {
    return [...this.schemas].sort();
  }

  /** converts tenant id to schema name (simulates naming convention) */
  private toSchemaName(tenantId: string): string {
    return `tenant_${tenantId}`;
  }
}

// ---------------------------------------------------------------------------
// RLS policy engine: simulates row-level security enforcement
// ---------------------------------------------------------------------------

/**
 * Simulates PostgreSQL row-level security policy enforcement.
 * In production, RLS is enforced by the database engine itself.
 */
export class RlsPolicyEngine {
  // schema -> table -> policies
  private policies = new Map<string, Map<string, RlsPolicy[]>>();

  /** registers a policy on a table within a schema */
  addPolicy(schema: string, table: string, policy: RlsPolicy): void {
    if (!this.policies.has(schema)) {
      this.policies.set(schema, new Map());
    }
    const schemaPolicies = this.policies.get(schema)!;
    if (!schemaPolicies.has(table)) {
      schemaPolicies.set(table, []);
    }
    schemaPolicies.get(table)!.push(policy);
  }

  /**
   * Checks if access to a row is allowed under RLS policies.
   * Cross-schema access (different schema = different tenant) is always denied.
   */
  checkAccess(
    schema: string,
    table: string,
    row: TenantRow,
    currentTenantId: string,
    options?: { isServiceRole?: boolean },
  ): Result<'allowed', 'cross-schema-denied' | 'rls-denied'> {
    // cross-schema check: the row's tenant must match the schema's tenant
    const schemaTenant = schema.replace('tenant_', '');
    if (schemaTenant !== currentTenantId) {
      return Result.err('cross-schema-denied');
    }

    // check rls policies for this schema/table
    const schemaPolicies = this.policies.get(schema);
    if (!schemaPolicies) {
      // no policies registered means open access within own schema
      return Result.ok('allowed');
    }

    const tablePolicies = schemaPolicies.get(table);
    if (!tablePolicies || tablePolicies.length === 0) {
      return Result.ok('allowed');
    }

    // evaluate each policy; all must pass
    for (const policy of tablePolicies) {
      // service role bypass
      if (options?.isServiceRole && policy.serviceRoleBypass) {
        continue;
      }

      // check the column value matches the current tenant
      if (row[policy.column] !== currentTenantId) {
        return Result.err('rls-denied');
      }
    }

    return Result.ok('allowed');
  }

  /** returns policies for a given schema and table */
  getPolicies(schema: string, table: string): RlsPolicy[] {
    return this.policies.get(schema)?.get(table) ?? [];
  }
}

// ---------------------------------------------------------------------------
// connection pool: simulates pooling with schema switching (S7-W7, S7-W19)
// ---------------------------------------------------------------------------

/**
 * Simulates a connection pool with per-connection schema assignment.
 * Validates S7-W7 (pool exhaustion) and S7-W19 (max 20 boundary).
 *
 * In production this would manage actual pg connections and
 * SET search_path / SET ROLE on each acquire.
 */
export class ConnectionPool {
  private readonly maxConnections: number;
  private connections = new Map<string, Connection>();
  private nextId = 1;

  constructor(maxConnections = 20) {
    this.maxConnections = maxConnections;
  }

  /** acquires a connection scoped to the given schema */
  acquire(schema: string): Result<Connection, 'pool-exhausted'> {
    if (this.connections.size >= this.maxConnections) {
      return Result.err('pool-exhausted');
    }

    const conn: Connection = {
      id: `conn-${this.nextId++}`,
      schema,
      acquiredAt: Date.now(),
    };
    this.connections.set(conn.id, conn);
    return Result.ok(conn);
  }

  /** releases a connection back to the pool */
  release(connectionId: string): Result<void, 'not-found'> {
    if (!this.connections.has(connectionId)) {
      return Result.err('not-found');
    }
    this.connections.delete(connectionId);
    return Result.ok(undefined);
  }

  /** returns the number of active (acquired) connections */
  getActiveCount(): number {
    return this.connections.size;
  }

  /** returns the configured maximum number of connections */
  getMaxConnections(): number {
    return this.maxConnections;
  }

  /** returns the schema assigned to a specific connection */
  getConnectionSchema(connectionId: string): string | undefined {
    return this.connections.get(connectionId)?.schema;
  }
}

// ---------------------------------------------------------------------------
// migration runner: simulates per-schema migration tracking
// ---------------------------------------------------------------------------

/**
 * Simulates a per-schema migration runner.
 * In production this would execute DDL/DML and record in a migrations table.
 */
export class MigrationRunner {
  // schema -> set of applied migration ids
  private appliedMigrations = new Map<string, Map<string, string>>();

  /** runs a migration against a specific schema */
  runMigration(
    schema: string,
    migrationId: string,
    sql: string,
  ): Result<void, 'already-applied' | 'invalid-schema'> {
    if (!schema.startsWith('tenant_')) {
      return Result.err('invalid-schema');
    }

    if (!this.appliedMigrations.has(schema)) {
      this.appliedMigrations.set(schema, new Map());
    }

    const schemaMigrations = this.appliedMigrations.get(schema)!;
    if (schemaMigrations.has(migrationId)) {
      return Result.err('already-applied');
    }

    // record the migration as applied (sql captured for audit)
    schemaMigrations.set(migrationId, sql);
    return Result.ok(undefined);
  }

  /** returns list of applied migration ids for a schema */
  getAppliedMigrations(schema: string): string[] {
    const schemaMigrations = this.appliedMigrations.get(schema);
    if (!schemaMigrations) return [];
    return [...schemaMigrations.keys()];
  }

  /** checks if a specific migration has been applied to a schema */
  hasMigration(schema: string, migrationId: string): boolean {
    return this.appliedMigrations.get(schema)?.has(migrationId) ?? false;
  }

  /**
   * Validates that after migration completion, the migration role
   * has no residual access beyond what was granted.
   * Returns ok if clean, err if residual access detected.
   */
  validateNoResidualAccess(schema: string): Result<void, 'residual-access'> {
    // in a real system this would check pg_roles / pg_catalog
    // simulation: always clean (no real roles to leak)
    if (!schema.startsWith('tenant_')) {
      return Result.err('residual-access');
    }
    return Result.ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// search path validator: prevents injection in SET search_path
// ---------------------------------------------------------------------------

/** allowed schemas for search_path (shared + tenant patterns) */
const DEFAULT_ALLOWLIST = ['public', 'shared', 'extensions'];
const TENANT_SCHEMA_PATTERN = /^tenant_[a-zA-Z0-9_-]+$/;

/**
 * Validates a PostgreSQL search_path value against injection attempts.
 * Rejects paths containing SQL injection markers (`;`, `--`, etc.)
 * and schemas not in the allowlist or matching tenant pattern.
 */
export function validateSearchPath(
  path: string,
  allowlist: string[] = DEFAULT_ALLOWLIST,
): Result<string[], 'injection-detected' | 'unauthorized-schema'> {
  // check for sql injection markers
  if (path.includes(';') || path.includes('--') || path.includes('/*')) {
    return Result.err('injection-detected');
  }

  // check for common injection patterns
  if (/['"]/.test(path) || /\bDROP\b/i.test(path) || /\bUNION\b/i.test(path)) {
    return Result.err('injection-detected');
  }

  // split by comma, trim whitespace
  const schemas = path.split(',').map((s) => s.trim()).filter(Boolean);

  if (schemas.length === 0) {
    return Result.err('unauthorized-schema');
  }

  // validate each schema against allowlist or tenant pattern
  const allowSet = new Set(allowlist);
  for (const schema of schemas) {
    if (!allowSet.has(schema) && !TENANT_SCHEMA_PATTERN.test(schema)) {
      return Result.err('unauthorized-schema');
    }
  }

  return Result.ok(schemas);
}
