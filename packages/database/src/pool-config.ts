/**
 * PR-04: Pool Config Enforcement — domain-scoped pool sizing
 * @task PR-04
 *
 * provides default pool options per domain and helper functions
 * for querying and enforcing domain pool isolation.
 */

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface PoolOptions {
  max: number;
  idleTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// defaults
// ---------------------------------------------------------------------------

export const DOMAIN_POOL_DEFAULTS: Record<string, PoolOptions> = {
  crypto: { max: 10, idleTimeoutMs: 30_000 },
  hr: { max: 10, idleTimeoutMs: 30_000 },
  platform: { max: 20, idleTimeoutMs: 60_000 },
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * returns pool options for the given domain.
 * falls back to platform defaults for unknown domains.
 */
export function getPoolOptionsForDomain(domain: string): PoolOptions {
  return DOMAIN_POOL_DEFAULTS[domain] ?? DOMAIN_POOL_DEFAULTS.platform;
}

/**
 * returns a map of pool options for the given domain list.
 * useful for monitoring dashboards and pool stats endpoints.
 */
export function getPoolStats(domains: string[]): Record<string, PoolOptions> {
  const stats: Record<string, PoolOptions> = {};
  for (const d of domains) stats[d] = getPoolOptionsForDomain(d);
  return stats;
}
