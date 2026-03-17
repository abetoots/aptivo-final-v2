/**
 * OBS-03: Retention policy types
 * @task OBS-03
 * @guidelines §2.1 (Result types, tagged union errors)
 */

// ---------------------------------------------------------------------------
// policy definition
// ---------------------------------------------------------------------------

export interface RetentionPolicy {
  domain: string;
  retentionDays: number;
  purgeBatchSize: number;
}

export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  { domain: 'core', retentionDays: 90, purgeBatchSize: 1000 },
  { domain: 'hr', retentionDays: 2555, purgeBatchSize: 1000 }, // 7 years
  { domain: 'crypto', retentionDays: 1825, purgeBatchSize: 1000 }, // 5 years
];

// ---------------------------------------------------------------------------
// purge result
// ---------------------------------------------------------------------------

export interface RetentionPurgeResult {
  purgedCount: number;
  domains: Record<string, number>;
}

// ---------------------------------------------------------------------------
// store interface (db-decoupled)
// ---------------------------------------------------------------------------

export interface RetentionStore {
  purgeExpired(domain: string, cutoffDate: Date, batchSize: number): Promise<number>;
}
