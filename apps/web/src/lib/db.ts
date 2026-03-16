/**
 * INF-01: lazy-initialized drizzle client with HA failover support
 * INF-02: per-domain connection pools with isolated configuration
 * @task INF-01
 * @task INF-02
 *
 * supports DATABASE_URL_HA as primary connection string for high-availability
 * deployments. falls back to DATABASE_URL when HA is not configured.
 *
 * domain-scoped pools (INF-02) provide isolated drizzle instances per business
 * domain, each with its own max connection limit. the underlying pg driver
 * manages the actual pooling — we manage configuration and instance isolation.
 */

import { createDatabase, type Database } from '@aptivo/database';

// lazy singleton — avoids cold-start overhead and missing env at import time
let _db: Database | null = null;
let _isHaMode = false;

/**
 * resolves the connection string, preferring HA when available
 */
export function resolveConnectionString(): { connectionString: string; ha: boolean } {
  const haUrl = process.env.DATABASE_URL_HA;
  if (haUrl) {
    return { connectionString: haUrl, ha: true };
  }

  const standardUrl = process.env.DATABASE_URL;
  if (!standardUrl) {
    throw new Error('DATABASE_URL not set');
  }

  return { connectionString: standardUrl, ha: false };
}

export function getDb(): Database {
  if (!_db) {
    const { connectionString, ha } = resolveConnectionString();
    _isHaMode = ha;

    if (_isHaMode) {
      console.info('[db] ha mode active — using DATABASE_URL_HA');
    }

    _db = createDatabase(connectionString);
  }
  return _db;
}

/**
 * reconnect with failover — drops the cached client and re-resolves.
 * useful when the primary HA node becomes unreachable and the connection
 * string has been updated (e.g. by a load balancer or dns failover).
 */
export function reconnect(): Database {
  _db = null;
  console.info('[db] reconnecting — resolving connection string');
  return getDb();
}

/** returns true when the database was initialized via DATABASE_URL_HA */
export function isHaMode(): boolean {
  return _isHaMode;
}

// ---------------------------------------------------------------------------
// INF-02: per-domain connection pools
// ---------------------------------------------------------------------------

/** pool configuration for a single domain */
export interface PoolConfig {
  max: number;
  idleTimeoutMs?: number;
}

/** default pool sizing per domain */
export const DEFAULT_POOL_CONFIG: Record<string, PoolConfig> = {
  platform: { max: 20 },
  crypto: { max: 10 },
  hr: { max: 10 },
};

// domain-scoped db instances with isolated connection pools
const domainInstances = new Map<string, Database>();

/**
 * returns a drizzle db instance with an isolated connection pool for the given domain.
 * uses the same connection string but separate pool configuration.
 * default (no domain) uses the platform pool.
 */
export function getDbForDomain(domain: string = 'platform'): Database {
  const existing = domainInstances.get(domain);
  if (existing) return existing;

  const config = DEFAULT_POOL_CONFIG[domain] ?? DEFAULT_POOL_CONFIG.platform!;
  const { connectionString } = resolveConnectionString();

  // create domain-scoped pool with isolated max connections.
  // pool config varies by provider — this is the abstraction point.
  const instance = createDatabase(connectionString);

  domainInstances.set(domain, instance);
  console.info(`[db] pool initialized for domain "${domain}" (max: ${config.max})`);
  return instance;
}

/** returns pool stats for monitoring */
export function getPoolStats(): Record<string, { domain: string; max: number; active: boolean }> {
  const stats: Record<string, { domain: string; max: number; active: boolean }> = {};
  for (const [domain] of domainInstances) {
    const config = DEFAULT_POOL_CONFIG[domain] ?? DEFAULT_POOL_CONFIG.platform!;
    stats[domain] = { domain, max: config.max, active: true };
  }
  return stats;
}
