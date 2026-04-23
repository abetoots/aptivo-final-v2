/**
 * S17-B3: Anomaly baseline builder cron.
 *
 * Replaces the S16 placeholder constant baseline used by the LLM3-04
 * anomaly gate. Runs every 6 hours: for each configured scope (domain
 * → audit resource_type/action mapping from `services.ts`
 * `DOMAIN_AUDIT_SCOPE`), aggregates the trailing 7 days of audit
 * events into evaluation-window-sized buckets and computes mean,
 * stdDev, and sample size of the per-actor per-bucket counts. Results
 * are upserted into `anomaly_baselines` keyed on `(actor_id,
 * resource_type)` where `resource_type` is the same scope key the
 * gate passes to `getBaseline`.
 *
 * Scope key invariant: the cron MUST use the same joined-list string
 * the gate produces (currently `params.resourceTypes.join(',')` in
 * `audit-store-drizzle.aggregateAccessPattern`). Drift would mean the
 * gate looks up a baseline that doesn't exist and fails open
 * indefinitely. Tested explicitly so the format mismatch surfaces in
 * CI rather than at runtime in staging.
 *
 * Cold-start behaviour: actors with fewer than `minBaselineSamples`
 * (5) buckets of activity in the lookback window aren't filtered out
 * here — they're upserted with their actual sample size so the
 * detector's existing fail-open path (`if (sampleSize <
 * minBaselineSamples) return insufficient baseline data`) handles
 * them correctly.
 *
 * Operational caveat: like the gate itself, this cron only sees
 * audit rows with `user_id IS NOT NULL` (i.e. `actor.type === 'user'`).
 * Workflow-emitted events with `actor.type: 'system'` are excluded
 * — see B1's documented carry-forward.
 */

import { sql } from 'drizzle-orm';
import type { Inngest } from 'inngest';
import type {
  DrizzleAnomalyBaselineStore,
  DrizzleClient,
} from '@aptivo/database/adapters';

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

/**
 * One scope per gateway domain — must mirror `DOMAIN_AUDIT_SCOPE` in
 * `apps/web/src/lib/services.ts`. Composition root passes this so the
 * job has no domain knowledge.
 */
export interface BaselineScope {
  /**
   * Scope key used as `resource_type` in the baseline row. Must equal
   * what the gate's `aggregateAccessPattern` returns in
   * `AccessPattern.resourceType` (today: `resourceTypes.join(',')`).
   */
  readonly key: string;
  readonly resourceTypes: readonly string[];
  readonly actions: readonly string[];
}

export interface AnomalyBaselineBuilderConfig {
  /** Trailing window the cron aggregates over. Default 7 days. */
  readonly lookbackDays?: number;
  /** Bucket size for per-actor per-window counts. Must match the
   * gate's `ANOMALY_WINDOW_MS` so baseline and live counts are
   * directly comparable. Default 10 minutes. */
  readonly windowMs?: number;
  /** Inngest function id; default `anomaly-baseline-build`. */
  readonly id?: string;
  /** Cron expression. Default every 6 hours. */
  readonly cron?: string;
}

const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// pure aggregation
// ---------------------------------------------------------------------------

interface PerActorStats {
  readonly actor: string;
  readonly mean: number;
  readonly stdDev: number;
  readonly sampleSize: number;
}

/**
 * Aggregates `audit_logs` for a single scope. Pure SQL — no
 * upserts. Exposed for unit tests so the math can be verified
 * independently of the cron wrapper.
 */
export async function computeScopeBaselines(
  db: DrizzleClient,
  scope: BaselineScope,
  lookbackDays: number,
  windowMs: number,
): Promise<readonly PerActorStats[]> {
  // empty scope (e.g. the `core` domain) → nothing to aggregate
  if (scope.resourceTypes.length === 0) return [];

  const windowSeconds = Math.floor(windowMs / 1000);
  const lookbackInterval = `${lookbackDays} days`;
  const resourceTypes = scope.resourceTypes as string[];
  const actions = scope.actions as string[];

  // action filter is optional — empty array means "any action"
  const actionFilter = actions.length > 0
    ? sql`AND action = ANY(${actions}::text[])`
    : sql``;

  const result = await db.execute(sql`
    WITH bucketed AS (
      SELECT
        user_id AS actor,
        floor(extract(epoch from created_at) / ${windowSeconds})::bigint AS bucket,
        COUNT(*)::int AS cnt
      FROM audit_logs
      WHERE created_at >= NOW() - (${lookbackInterval}::interval)
        AND user_id IS NOT NULL
        AND resource_type = ANY(${resourceTypes}::text[])
        ${actionFilter}
      GROUP BY user_id, bucket
    )
    SELECT
      actor,
      AVG(cnt)::float8 AS mean,
      COALESCE(STDDEV_SAMP(cnt), 0)::float8 AS std_dev,
      COUNT(*)::int AS sample_size
    FROM bucketed
    GROUP BY actor
  `);

  // pg drivers return either an array directly or { rows: [...] }
  const rows = Array.isArray(result)
    ? result
    : (result as { rows: Array<Record<string, unknown>> }).rows;

  return rows.map((row) => ({
    actor: String(row['actor']),
    mean: Number(row['mean']),
    stdDev: Number(row['std_dev']),
    sampleSize: Number(row['sample_size']),
  }));
}

// ---------------------------------------------------------------------------
// builder runner (test-friendly — no inngest dependency)
// ---------------------------------------------------------------------------

export interface BuilderRunResult {
  readonly scopesProcessed: number;
  readonly baselinesUpserted: number;
  readonly skippedEmptyScopes: number;
}

/**
 * Iterates over every configured scope, computes per-actor statistics,
 * and upserts each row. Idempotent — re-running the same window over
 * the same data produces the same baseline values.
 *
 * Errors per-scope are isolated: a failure aggregating one scope does
 * not abort the others. Each error is logged via the injected logger
 * and the run continues. The aggregate result reports counts only;
 * detailed errors live in the structured logs.
 */
export async function runAnomalyBaselineBuilder(deps: {
  readonly db: DrizzleClient;
  readonly store: DrizzleAnomalyBaselineStore;
  readonly scopes: readonly BaselineScope[];
  readonly logger: { warn(event: string, ctx?: Record<string, unknown>): void };
  readonly lookbackDays?: number;
  readonly windowMs?: number;
}): Promise<BuilderRunResult> {
  const lookbackDays = deps.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const windowMs = deps.windowMs ?? DEFAULT_WINDOW_MS;

  let scopesProcessed = 0;
  let baselinesUpserted = 0;
  let skippedEmptyScopes = 0;

  for (const scope of deps.scopes) {
    if (scope.resourceTypes.length === 0) {
      skippedEmptyScopes++;
      continue;
    }
    try {
      const stats = await computeScopeBaselines(deps.db, scope, lookbackDays, windowMs);
      for (const s of stats) {
        await deps.store.upsertBaseline({
          actorId: s.actor,
          resourceType: scope.key,
          mean: s.mean,
          stdDev: s.stdDev,
          sampleSize: s.sampleSize,
        });
        baselinesUpserted++;
      }
      scopesProcessed++;
    } catch (cause) {
      deps.logger.warn('anomaly_baseline_scope_failed', {
        scope: scope.key,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return { scopesProcessed, baselinesUpserted, skippedEmptyScopes };
}

// ---------------------------------------------------------------------------
// inngest function factory
// ---------------------------------------------------------------------------

export function createAnomalyBaselineBuilder(deps: {
  readonly inngest: Inngest;
  readonly db: DrizzleClient;
  readonly store: DrizzleAnomalyBaselineStore;
  readonly scopes: readonly BaselineScope[];
  readonly logger: { warn(event: string, ctx?: Record<string, unknown>): void };
  readonly config?: AnomalyBaselineBuilderConfig;
}) {
  const id = deps.config?.id ?? 'anomaly-baseline-build';
  const cron = deps.config?.cron ?? '0 */6 * * *';

  return deps.inngest.createFunction(
    { id, retries: 1 },
    { cron },
    async ({ step }) => {
      const result = await step.run('compute-baselines', () =>
        runAnomalyBaselineBuilder({
          db: deps.db,
          store: deps.store,
          scopes: deps.scopes,
          logger: deps.logger,
          lookbackDays: deps.config?.lookbackDays,
          windowMs: deps.config?.windowMs,
        }),
      );

      return {
        ranAt: new Date().toISOString(),
        ...result,
      };
    },
  );
}
