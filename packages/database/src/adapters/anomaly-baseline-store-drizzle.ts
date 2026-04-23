/**
 * S17-B3: Drizzle adapter for the anomaly baseline store.
 *
 * Local store interface mirrors what the gateway's `getBaseline`
 * callback consumes (see `packages/audit/src/anomaly/anomaly-detector.ts`
 * `BaselineStats`). This package intentionally does NOT depend on
 * `@aptivo/audit` at runtime — same DRIFT RISK pattern as the
 * llm-usage and department-budget stores. Cross-package consolidation
 * into `@aptivo/types` is tracked alongside the other S18 refactors.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { anomalyBaselines } from '../schema/anomaly-baselines.js';

// ---------------------------------------------------------------------------
// store contract (mirror of BaselineStats consumer)
// ---------------------------------------------------------------------------

export interface BaselineRecord {
  actorId: string;
  resourceType: string;
  mean: number;
  stdDev: number;
  sampleSize: number;
  computedAt: Date;
}

export interface AnomalyBaselineStore {
  /**
   * Returns the baseline for `(actorId, resourceType)`, or null when
   * none has been computed yet. Cold-start callers MUST treat null as
   * "insufficient data" — the detector will fail open.
   */
  findBaseline(actorId: string, resourceType: string): Promise<BaselineRecord | null>;

  /**
   * Inserts or updates the baseline for `(actorId, resourceType)`.
   * Implementation uses Postgres `ON CONFLICT … DO UPDATE` against
   * the `anomaly_baselines_actor_resource_uq` unique index so the
   * builder cron can be re-run idempotently.
   */
  upsertBaseline(input: {
    actorId: string;
    resourceType: string;
    mean: number;
    stdDev: number;
    sampleSize: number;
  }): Promise<void>;

  /**
   * Returns the most recent `computed_at` timestamp across all rows,
   * or null when the table is empty. Used by the §11.1 gate-clearance
   * audit ("anomaly_baselines table exists with a row where
   * computed_at > now() - 1 day") and by ops-side health checks.
   */
  latestComputedAt(): Promise<Date | null>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDrizzleAnomalyBaselineStore(db: DrizzleClient): AnomalyBaselineStore {
  return {
    async findBaseline(actorId, resourceType) {
      const rows = await db
        .select()
        .from(anomalyBaselines)
        .where(
          and(
            eq(anomalyBaselines.actorId, actorId),
            eq(anomalyBaselines.resourceType, resourceType),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      return {
        actorId: row.actorId,
        resourceType: row.resourceType,
        // numeric columns come back as strings from drizzle/pg; coerce
        mean: Number(row.mean),
        stdDev: Number(row.stdDev),
        sampleSize: row.sampleSize,
        computedAt: row.computedAt,
      };
    },

    async upsertBaseline(input) {
      await db
        .insert(anomalyBaselines)
        .values({
          actorId: input.actorId,
          resourceType: input.resourceType,
          mean: String(input.mean),
          stdDev: String(input.stdDev),
          sampleSize: input.sampleSize,
        })
        .onConflictDoUpdate({
          target: [anomalyBaselines.actorId, anomalyBaselines.resourceType],
          set: {
            mean: String(input.mean),
            stdDev: String(input.stdDev),
            sampleSize: input.sampleSize,
            computedAt: sql`now()`,
          },
        });
    },

    async latestComputedAt() {
      const rows = await db
        .select({ latest: sql<Date | null>`max(${anomalyBaselines.computedAt})` })
        .from(anomalyBaselines);
      return rows[0]?.latest ?? null;
    },
  };
}
