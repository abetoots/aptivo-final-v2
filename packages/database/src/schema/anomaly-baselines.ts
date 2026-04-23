/**
 * S17-B3: Anomaly baseline statistics per (actor, resource_type).
 *
 * Replaces the S16 placeholder constant `{mean:10, stdDev:3, sampleSize:100}`
 * that the LLM3-04 anomaly gate used while no historical baseline existed.
 * Closes Sprint-16 enablement gate #5: production flip of
 * `anomaly-blocking` is now defensible against measured baselines, not
 * an arbitrary constant.
 *
 * Populated by the `anomaly-baseline-builder` Inngest cron (every 6h):
 *   - bucket trailing 7 days of audit_logs into 10-minute windows
 *   - count events per window per (actor, scope)
 *   - compute mean / stdDev / sample_size (number of buckets)
 *   - upsert keyed on (actor_id, resource_type)
 *
 * `resource_type` here is the *gate scope key* — the same string
 * `aggregateAccessPattern` returns in its `AccessPattern.resourceType`
 * field (joined list of audit `resource_type` values per the per-domain
 * mapping in `apps/web/src/lib/services.ts:DOMAIN_AUDIT_SCOPE`). The
 * detector uses `(actor, resourceType)` for lookup, so the baseline
 * key MUST match the access-pattern key character-for-character.
 *
 * Cold-start behaviour: an unknown `(actor, resource_type)` pair returns
 * no row → service-layer lookup returns `undefined` → the detector
 * receives `sampleSize: 0` → `insufficient baseline data` → gate passes.
 * This preserves the fail-open semantics documented in S16's anomaly
 * gate (`packages/llm-gateway/src/safety/anomaly-gate.ts`).
 */

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const anomalyBaselines = pgTable(
  'anomaly_baselines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    actorId: text('actor_id').notNull(),
    resourceType: text('resource_type').notNull(),
    // numeric for fractional means/stdDevs; precision matches typical
    // request-count magnitudes without overflow concerns.
    mean: numeric('mean', { precision: 12, scale: 4 }).notNull(),
    stdDev: numeric('std_dev', { precision: 12, scale: 4 }).notNull(),
    sampleSize: integer('sample_size').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // upserts target this constraint
    actorScopeUnique: uniqueIndex('anomaly_baselines_actor_resource_uq')
      .on(table.actorId, table.resourceType),
    // freshness queries (e.g. "any row computed in the last 24h?") use
    // computed_at; an index keeps the cron's verification probes cheap
    computedAtIdx: index('anomaly_baselines_computed_at_idx').on(table.computedAt),
  }),
);
