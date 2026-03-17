/**
 * OBS-03: Retention purge service
 * @task OBS-03
 * @guidelines §2.1 (Functional core — factory pattern)
 *
 * createRetentionService(deps) — iterates domain policies, computes cutoff
 * dates, and calls store.purgeExpired in batches until no more records remain.
 */

import type {
  RetentionPolicy,
  RetentionPurgeResult,
  RetentionStore,
} from './retention-types.js';
import { DEFAULT_RETENTION_POLICIES } from './retention-types.js';

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export interface RetentionServiceDeps {
  store: RetentionStore;
  policies?: RetentionPolicy[];
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createRetentionService(deps: RetentionServiceDeps) {
  const policies = deps.policies ?? DEFAULT_RETENTION_POLICIES;
  const { store } = deps;

  return {
    /**
     * purge expired audit records across all configured domains.
     * iterates each policy, computes the cutoff date, and calls
     * store.purgeExpired in batches until no more records are returned.
     */
    async purgeExpired(): Promise<RetentionPurgeResult> {
      const domains: Record<string, number> = {};
      let purgedCount = 0;

      for (const policy of policies) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

        let domainPurged = 0;

        // batch loop: keep purging until a batch returns fewer than batchSize
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const purged = await store.purgeExpired(
            policy.domain,
            cutoffDate,
            policy.purgeBatchSize,
          );
          domainPurged += purged;

          // if fewer records purged than batch size, we're done for this domain
          if (purged < policy.purgeBatchSize) break;
        }

        if (domainPurged > 0) {
          domains[policy.domain] = domainPurged;
        }
        purgedCount += domainPurged;
      }

      return { purgedCount, domains };
    },
  };
}
